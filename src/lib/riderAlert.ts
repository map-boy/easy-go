/**
 * riderAlert.ts
 * Handles all sensory alerts for incoming orders:
 *  - Repeating audio tone
 *  - Continuous vibration pattern
 *  - Flashlight blink (real torch or visual DOM fallback)
 *
 * Usage:
 *   const alert = new RiderAlert();
 *   alert.start();   // when order arrives
 *   alert.stop();    // when accepted / declined / timed out
 */

export class RiderAlert {
  private audioCtx:      AudioContext | null = null;
  private audioLoop:     ReturnType<typeof setInterval> | null = null;
  private vibLoop:       ReturnType<typeof setInterval> | null = null;
  private flashLoop:     ReturnType<typeof setInterval> | null = null;
  private torchTrack:    MediaStreamTrack | null = null;
  private flashOverlay:  HTMLDivElement | null = null;
  private running = false;

  // ── Audio ────────────────────────────────────────────────────────────────
  private playTone() {
    if (!this.audioCtx) return;
    const ctx = this.audioCtx;
    // Two-note dispatch chime: high-low
    const notes = [880, 660, 880, 660, 1050];
    let t = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type            = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.45, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.start(t);
      osc.stop(t + 0.3);
      t += i === 2 ? 0.15 : 0.32; // slight pause after 3rd note
    });
  }

  private startAudio() {
    try {
      this.audioCtx = new AudioContext();
      this.playTone();
      // Repeat every 2.2 seconds
      this.audioLoop = setInterval(() => this.playTone(), 2200);
    } catch {
      console.warn('RiderAlert: Audio not available');
    }
  }

  private stopAudio() {
    if (this.audioLoop) { clearInterval(this.audioLoop); this.audioLoop = null; }
    try { this.audioCtx?.close(); } catch {}
    this.audioCtx = null;
  }

  // ── Vibration ────────────────────────────────────────────────────────────
  private startVibration() {
    if (!navigator.vibrate) return;
    // Pattern: 500ms on, 200ms off, 500ms on, 300ms off — repeat
    const pattern = [500, 200, 500, 300];
    navigator.vibrate(pattern);
    // Re-trigger every 1.6s to loop (pattern total = 1500ms)
    this.vibLoop = setInterval(() => navigator.vibrate(pattern), 1600);
  }

  private stopVibration() {
    if (this.vibLoop) { clearInterval(this.vibLoop); this.vibLoop = null; }
    if (navigator.vibrate) navigator.vibrate(0); // cancel any active vibration
  }

  // ── Flashlight (real torch via camera API) ───────────────────────────────
  private async startTorch() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      const [track] = stream.getVideoTracks();
      // @ts-ignore — torch is a valid constraint on mobile
      const caps = track.getCapabilities?.() as any;
      if (caps?.torch) {
        this.torchTrack = track;
        let on = true;
        this.flashLoop = setInterval(async () => {
          try {
            // @ts-ignore
            await track.applyConstraints({ advanced: [{ torch: on }] });
            on = !on;
          } catch {}
        }, 400); // blink every 400ms
        return;
      }
      // Device doesn't support torch — fall back to visual
      stream.getTracks().forEach(t => t.stop());
    } catch {
      // Permission denied or not available — use visual fallback
    }
    this.startVisualFlash();
  }

  private stopTorch() {
    if (this.flashLoop) { clearInterval(this.flashLoop); this.flashLoop = null; }
    try {
      // @ts-ignore
      this.torchTrack?.applyConstraints({ advanced: [{ torch: false }] });
      this.torchTrack?.stop();
    } catch {}
    this.torchTrack = null;
    this.stopVisualFlash();
  }

  // ── Visual Flash Fallback (full-screen white blink) ───────────────────────
  private startVisualFlash() {
    const div = document.createElement('div');
    div.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'pointer-events:none', 'opacity:0',
      'background:rgba(255,255,255,0.55)',
      'transition:opacity 0.1s',
    ].join(';');
    document.body.appendChild(div);
    this.flashOverlay = div;

    let visible = false;
    this.flashLoop = setInterval(() => {
      visible = !visible;
      div.style.opacity = visible ? '1' : '0';
    }, 350);
  }

  private stopVisualFlash() {
    if (this.flashOverlay) {
      this.flashOverlay.remove();
      this.flashOverlay = null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.startAudio();
    this.startVibration();
    this.startTorch(); // async — won't block
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.stopAudio();
    this.stopVibration();
    this.stopTorch();
  }

  isRunning() { return this.running; }
}