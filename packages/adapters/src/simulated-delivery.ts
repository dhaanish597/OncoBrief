import type { DeliveryPort, DeliveryResult, RenderedMessage } from '@oncobrief/ports';

/**
 * Simulated delivery (ADR 0011).
 *
 * Real WhatsApp / IVR delivery needs credentials this environment does not
 * have. The prototype is honest about it: the outbox records `simulated: true`
 * and the UI labels it, rather than showing a green "Sent" tick for a message
 * that never left the machine.
 */
export class SimulatedDeliveryAdapter implements DeliveryPort {
  readonly channel = 'simulated' as const;

  async send(msg: RenderedMessage): Promise<DeliveryResult> {
    return {
      status: 'accepted',
      simulated: true,
      externalRef: `simulated:${msg.patientMessageId}`,
    };
  }
}
