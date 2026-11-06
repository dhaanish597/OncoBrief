import { createHmac } from 'node:crypto';
import type { DeliveryPort, OutboundMessage, SendResult } from '@oncobrief/ports';

export interface WebhookDeliveryConfig {
  channel?: 'sms' | 'whatsapp';
  webhookUrl?: string;
  webhookSecret?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Real Outbound SMS / WhatsApp Messaging Provider Adapter (`TASK-024`, `REQ-059`).
 *
 * Supports two real outbound HTTP contracts with bounded exponential backoff retries:
 * 1. **Twilio Programmable Messaging API (`https://api.twilio.com/2010-04-01/Accounts/{Sid}/Messages.json`):**
 *    When `twilioAccountSid`, `twilioAuthToken`, and `twilioFromNumber` are configured,
 *    dispatches `application/x-www-form-urlencoded` requests with HTTP Basic Auth and
 *    returns `simulated: false` + Twilio's `sid` as `externalRef`.
 * 2. **Signed HTTP Webhook Gateway (`DELIVERY_WEBHOOK_URL`):**
 *    When `webhookUrl` is configured, dispatches a JSON payload signed with HMAC-SHA256
 *    in header `x-oncobrief-delivery-signature` and returns `simulated: false`.
 * 3. **Safe Local Fallback (`simulated: true`):**
 *    When neither live provider is configured (or if `SIMULATE_DELIVERY_ONLY=1` is set),
 *    records a deterministic simulated outbox entry (`simulated: true`) so no real
 *    patient phone number is ever contacted without explicit credentials.
 */
export class WebhookDeliveryAdapter implements DeliveryPort {
  readonly channel: 'sms' | 'whatsapp';
  private readonly webhookUrl: string | undefined;
  private readonly webhookSecret: string;
  private readonly twilioAccountSid: string | undefined;
  private readonly twilioAuthToken: string | undefined;
  private readonly twilioFromNumber: string | undefined;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(config: WebhookDeliveryConfig = {}) {
    this.channel = config.channel ?? 'sms';
    this.webhookUrl = config.webhookUrl?.trim() || process.env['DELIVERY_WEBHOOK_URL']?.trim();
    this.webhookSecret =
      config.webhookSecret ||
      process.env['DELIVERY_WEBHOOK_SECRET'] ||
      'oncobrief-delivery-webhook-secret';
    this.twilioAccountSid =
      config.twilioAccountSid?.trim() || process.env['TWILIO_ACCOUNT_SID']?.trim();
    this.twilioAuthToken =
      config.twilioAuthToken?.trim() || process.env['TWILIO_AUTH_TOKEN']?.trim();
    this.twilioFromNumber =
      config.twilioFromNumber?.trim() || process.env['TWILIO_FROM_NUMBER']?.trim();
    this.maxRetries = Math.max(0, Math.min(4, config.maxRetries ?? 2));
    this.retryBaseDelayMs = Math.max(5, Math.min(2000, config.retryBaseDelayMs ?? 25));
    this.fetchFn = config.fetchImpl ?? globalThis.fetch;
  }

  get isLiveConfigured(): boolean {
    if (process.env['SIMULATE_DELIVERY_ONLY'] === '1') return false;
    return Boolean(
      this.webhookUrl ||
        (this.twilioAccountSid && this.twilioAuthToken && this.twilioFromNumber),
    );
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await this.fetchFn(url, init);
        if ((res.status >= 500 || res.status === 429) && attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, this.retryBaseDelayMs * Math.pow(2, attempt)));
          continue;
        }
        return res;
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await new Promise((r) => setTimeout(r, this.retryBaseDelayMs * Math.pow(2, attempt)));
          continue;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('delivery_network_error');
  }

  async send(msg: OutboundMessage): Promise<SendResult> {
    if (!msg.body || msg.body.trim().length === 0) {
      return {
        simulated: !this.isLiveConfigured,
        status: 'failed',
        errorMessage: 'empty_body',
      };
    }

    // 1. Twilio Programmable SMS / WhatsApp API contract
    if (
      process.env['SIMULATE_DELIVERY_ONLY'] !== '1' &&
      this.twilioAccountSid &&
      this.twilioAuthToken &&
      this.twilioFromNumber
    ) {
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
          this.twilioAccountSid,
        )}/Messages.json`;
        const fromFormatted =
          this.channel === 'whatsapp' && !this.twilioFromNumber.startsWith('whatsapp:')
            ? `whatsapp:${this.twilioFromNumber}`
            : this.twilioFromNumber;
        const toFormatted =
          this.channel === 'whatsapp' && !msg.recipientRef.startsWith('whatsapp:')
            ? `whatsapp:${msg.recipientRef}`
            : msg.recipientRef;

        const form = new URLSearchParams({
          To: toFormatted,
          From: fromFormatted,
          Body: msg.body,
        });

        const basicAuth = Buffer.from(
          `${this.twilioAccountSid}:${this.twilioAuthToken}`,
          'utf8',
        ).toString('base64');

        const res = await this.fetchWithRetry(url, {
          method: 'POST',
          headers: {
            authorization: `Basic ${basicAuth}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });

        if (!res.ok) {
          return {
            simulated: false,
            status: 'failed',
            errorMessage: `twilio_http_${res.status}`,
          };
        }

        const payload = (await res.json()) as { sid?: string; status?: string };
        return {
          simulated: false,
          status: 'accepted',
          externalRef: payload.sid ?? `twilio:${msg.patientMessageId}`,
        };
      } catch (err: unknown) {
        return {
          simulated: false,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'twilio_network_error',
        };
      }
    }

    // 2. Signed HTTP Webhook Gateway contract
    if (process.env['SIMULATE_DELIVERY_ONLY'] !== '1' && this.webhookUrl) {
      try {
        const rawPayload = JSON.stringify({
          patientMessageId: msg.patientMessageId,
          channel: msg.channel,
          recipientRef: msg.recipientRef,
          body: msg.body,
          dispatchedAt: new Date().toISOString(),
        });
        const signature = createHmac('sha256', this.webhookSecret)
          .update(rawPayload, 'utf8')
          .digest('hex');

        const res = await this.fetchWithRetry(this.webhookUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-oncobrief-delivery-signature': `sha256=${signature}`,
          },
          body: rawPayload,
        });

        if (!res.ok) {
          return {
            simulated: false,
            status: 'failed',
            errorMessage: `webhook_http_${res.status}`,
          };
        }

        const data = (await res.json().catch(() => ({}))) as {
          externalRef?: string;
          messageId?: string;
        };
        return {
          simulated: false,
          status: 'accepted',
          externalRef:
            data.externalRef ?? data.messageId ?? `webhook:${msg.patientMessageId.slice(0, 8)}`,
        };
      } catch (err: unknown) {
        return {
          simulated: false,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'webhook_network_error',
        };
      }
    }

    // 3. Explicit Simulated Local Outbox Fallback
    return {
      simulated: true,
      status: 'accepted',
      externalRef: `sim:${msg.channel}:${msg.patientMessageId.slice(0, 8)}`,
    };
  }
}
