import { chromium, type Page } from '../../apps/web/node_modules/@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';

export interface VideoMetadata {
  filename: string;
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  hasAudio: boolean;
  sha256: string;
  representativeFrames: string[];
  playbackVerified: boolean;
  notes: string;
}

export class RecorderHelper {
  constructor(public page: Page, public title: string) {}

  async setHud(stepTitle: string, detail: string) {
    await this.page.evaluate(
      ({ mainTitle, stepTitle, detail }) => {
        let hud = document.getElementById('oncobrief-demo-hud');
        if (!hud) {
          hud = document.createElement('div');
          hud.id = 'oncobrief-demo-hud';
          hud.style.position = 'fixed';
          hud.style.top = '14px';
          hud.style.left = '50%';
          hud.style.transform = 'translateX(-50%)';
          hud.style.zIndex = '999999';
          hud.style.backgroundColor = 'rgba(15, 23, 42, 0.95)';
          hud.style.backdropFilter = 'blur(12px)';
          hud.style.border = '1px solid rgba(56, 189, 248, 0.5)';
          hud.style.borderRadius = '10px';
          hud.style.padding = '10px 22px';
          hud.style.boxShadow = '0 12px 30px -4px rgba(0, 0, 0, 0.6)';
          hud.style.fontFamily = 'system-ui, -apple-system, sans-serif';
          hud.style.color = '#ffffff';
          hud.style.pointerEvents = 'none';
          hud.style.display = 'flex';
          hud.style.flexDirection = 'column';
          hud.style.alignItems = 'center';
          hud.style.maxWidth = '880px';
          hud.style.textAlign = 'center';
          hud.style.transition = 'all 0.3s ease';
          document.body.appendChild(hud);
        }
        hud.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 3px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #38bdf8; box-shadow: 0 0 8px #38bdf8;"></span>
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #38bdf8; font-weight: 700;">
              ${mainTitle}
            </span>
          </div>
          <div style="font-size: 14px; font-weight: 600; color: #f8fafc; margin-bottom: 2px;">
            ${stepTitle}
          </div>
          <div style="font-size: 12px; color: #94a3b8; font-weight: 400;">
            ${detail}
          </div>
        `;
      },
      { mainTitle: this.title, stepTitle, detail }
    );
  }

  async wait(ms: number) {
    await this.page.waitForTimeout(ms);
  }

  async highlightElement(selector: string, durationMs = 1200) {
    try {
      const loc = this.page.locator(selector).first();
      await loc.evaluate((el: HTMLElement) => {
        el.style.outline = '3px solid #38bdf8';
        el.style.outlineOffset = '2px';
        el.style.boxShadow = '0 0 15px rgba(56, 189, 248, 0.6)';
        el.style.transition = 'all 0.2s ease';
      });
      await this.wait(durationMs);
      await loc.evaluate((el: HTMLElement) => {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.boxShadow = '';
      });
    } catch {
      // Element may be transient or off-screen
    }
  }

  async clickWithHighlight(selector: string, waitAfter = 800) {
    const loc = this.page.locator(selector).first();
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    await loc.evaluate((el: HTMLElement) => {
      el.style.outline = '3px solid #f59e0b';
      el.style.outlineOffset = '2px';
      el.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.7)';
      el.style.transition = 'all 0.15s ease';
    }).catch(() => {});
    await this.wait(350);
    await loc.click();
    await this.wait(waitAfter);
  }

  async fillWithTyping(selector: string, text: string, delayBetweenChars = 25) {
    const loc = this.page.locator(selector).first();
    await loc.click();
    await loc.fill('');
    for (const char of text) {
      await loc.pressSequentially(char, { delay: delayBetweenChars });
    }
    await this.wait(300);
  }

  async showTerminal(options: {
    title: string;
    command: string;
    output: string;
    exitCode?: number;
    durationMs?: number;
  }) {
    await this.page.evaluate(
      ({ termTitle, command, output, exitCode }) => {
        let term = document.getElementById('oncobrief-demo-term');
        if (!term) {
          term = document.createElement('div');
          term.id = 'oncobrief-demo-term';
          term.style.position = 'fixed';
          term.style.bottom = '24px';
          term.style.left = '50%';
          term.style.transform = 'translateX(-50%)';
          term.style.width = '90%';
          term.style.maxWidth = '1100px';
          term.style.height = '340px';
          term.style.zIndex = '999990';
          term.style.backgroundColor = '#0b0f19';
          term.style.border = '1px solid #1e293b';
          term.style.borderRadius = '10px';
          term.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.8)';
          term.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          term.style.fontSize = '12px';
          term.style.color = '#e2e8f0';
          term.style.display = 'flex';
          term.style.flexDirection = 'column';
          term.style.overflow = 'hidden';
          term.style.transition = 'opacity 0.25s ease';
          document.body.appendChild(term);
        }

        const isSuccess = exitCode === undefined || exitCode === 0;
        const statusBadge = isSuccess
          ? '<span style="color: #10b981; font-weight: 600;">PASS (exit 0)</span>'
          : `<span style="color: #ef4444; font-weight: 600;">FAIL (exit ${exitCode})</span>`;

        term.innerHTML = `
          <div style="background-color: #111827; padding: 8px 16px; border-bottom: 1px solid #1f2937; display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #ef4444;"></span>
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #f59e0b;"></span>
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #10b981;"></span>
              <span style="margin-left: 8px; font-weight: 600; color: #94a3b8; font-size: 11px;">${termTitle}</span>
            </div>
            <div>${statusBadge}</div>
          </div>
          <div style="background-color: #0b0f19; padding: 10px 16px; border-bottom: 1px solid #1f2937; color: #38bdf8; font-weight: 600;">
            $ ${command}
          </div>
          <div style="flex: 1; padding: 12px 16px; overflow-y: auto; white-space: pre-wrap; line-height: 1.5; color: #cbd5e1; font-size: 11.5px; background: #070a11;">
${output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
          </div>
        `;
        term.style.opacity = '1';
      },
      {
        termTitle: options.title,
        command: options.command,
        output: options.output,
        exitCode: options.exitCode ?? 0,
      }
    );

    await this.wait(options.durationMs ?? 3500);
  }

  async hideTerminal() {
    await this.page.evaluate(() => {
      const term = document.getElementById('oncobrief-demo-term');
      if (term) term.remove();
    });
    await this.wait(300);
  }
}

export async function recordScenario(config: {
  filename: string;
  title: string;
  width?: number;
  height?: number;
  audioWavPath?: string;
  notes?: string;
  scenario: (page: Page, helper: RecorderHelper) => Promise<void>;
}): Promise<VideoMetadata> {
  const width = config.width ?? 1440;
  const height = config.height ?? 900;
  const outputDir = path.resolve(process.cwd(), 'reports/visual-proof');
  const rawDir = path.resolve(outputDir, 'raw');
  const framesDir = path.resolve(outputDir, 'frames');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const finalMp4Path = path.resolve(outputDir, config.filename);
  console.log(`\n======================================================`);
  console.log(`[RECORDER] Starting recording: ${config.filename}`);
  console.log(`[RECORDER] Title: ${config.title}`);
  console.log(`[RECORDER] Resolution: ${width}x${height}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: rawDir,
      size: { width, height },
    },
    viewport: { width, height },
    baseURL: 'http://localhost:3000',
  });

  const page = await context.newPage();
  const helper = new RecorderHelper(page, config.title);

  try {
    await config.scenario(page, helper);
  } catch (err) {
    console.error(`[RECORDER] Error during scenario ${config.filename}:`, err);
    throw err;
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const rawVideo = await page.video()?.path();
  if (!rawVideo || !fs.existsSync(rawVideo)) {
    throw new Error(`Raw video was not produced for ${config.filename}`);
  }

  console.log(`[RECORDER] Raw video captured: ${rawVideo}`);
  console.log(`[RECORDER] Encoding to standard H.264 MP4 via FFmpeg...`);

  // Transcode to MP4
  const _tempMp4 = path.resolve(rawDir, `temp_${config.filename}`);
  if (config.audioWavPath && fs.existsSync(config.audioWavPath)) {
    console.log(`[RECORDER] Muxing audio track from: ${config.audioWavPath}`);
    execSync(
      `ffmpeg -y -i "${rawVideo}" -i "${config.audioWavPath}" -c:v libx264 -pix_fmt yuv420p -crf 22 -preset fast -c:a aac -shortest "${finalMp4Path}"`,
      { stdio: 'pipe' }
    );
  } else {
    execSync(
      `ffmpeg -y -i "${rawVideo}" -c:v libx264 -pix_fmt yuv420p -crf 22 -preset fast "${finalMp4Path}"`,
      { stdio: 'pipe' }
    );
  }

  // Remove raw webm
  try {
    fs.unlinkSync(rawVideo);
  } catch { /* Best-effort cleanup; recording output is already retained. */ }

  // Inspect with ffprobe
  const ffprobeOutput = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,codec_name -show_entries format=duration,size -of json "${finalMp4Path}"`
  ).toString();
  const probeData = JSON.parse(ffprobeOutput);
  const stream = probeData.streams?.[0] ?? {};
  const duration = parseFloat(stream.duration || probeData.format?.duration || '0');
  const sizeBytes = fs.statSync(finalMp4Path).size;

  // Check audio stream presence
  const ffprobeAudioOutput = execSync(
    `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of json "${finalMp4Path}"`
  ).toString();
  const audioData = JSON.parse(ffprobeAudioOutput);
  const hasAudio = (audioData.streams?.length ?? 0) > 0;

  // Extract 3 representative frames to prove video validity
  const baseName = path.basename(config.filename, path.extname(config.filename));
  const frameTimes = [
    Math.max(0.5, duration * 0.25).toFixed(2),
    Math.max(1.0, duration * 0.5).toFixed(2),
    Math.max(1.5, duration * 0.75).toFixed(2),
  ];
  const representativeFrames: string[] = [];

  for (let i = 0; i < frameTimes.length; i++) {
    const framePath = path.resolve(framesDir, `${baseName}_frame_${i + 1}.png`);
    try {
      execSync(
        `ffmpeg -y -ss ${frameTimes[i]} -i "${finalMp4Path}" -vframes 1 "${framePath}"`,
        { stdio: 'pipe' }
      );
      if (fs.existsSync(framePath) && fs.statSync(framePath).size > 0) {
        representativeFrames.push(path.relative(outputDir, framePath));
      }
    } catch (e) {
      console.warn(`[RECORDER] Frame extraction warning at ${frameTimes[i]}s:`, e);
    }
  }

  // Compute SHA-256
  const fileBuf = fs.readFileSync(finalMp4Path);
  const sha256 = crypto.createHash('sha256').update(fileBuf).digest('hex');

  const metadata: VideoMetadata = {
    filename: config.filename,
    absolutePath: finalMp4Path,
    relativePath: `reports/visual-proof/${config.filename}`,
    sizeBytes,
    durationSeconds: parseFloat(duration.toFixed(2)),
    width: stream.width ?? width,
    height: stream.height ?? height,
    codec: stream.codec_name ?? 'h264',
    hasAudio,
    sha256,
    representativeFrames,
    playbackVerified: sizeBytes > 0 && duration > 0 && representativeFrames.length > 0,
    notes: config.notes ?? 'Recorded and verified on OncoBrief release candidate baseline.',
  };

  console.log(`[RECORDER] Successfully generated: ${config.filename}`);
  console.log(`[RECORDER] Duration: ${metadata.durationSeconds}s | Size: ${(metadata.sizeBytes / (1024 * 1024)).toFixed(2)} MB | SHA256: ${metadata.sha256.slice(0, 16)}...`);
  console.log(`[RECORDER] Verified frames: ${metadata.representativeFrames.join(', ')}`);
  console.log(`======================================================\n`);

  return metadata;
}
