/** Tiny synthesized sound effects (original, generated at runtime — no audio files). */
export type Sfx = 'shot' | 'hit' | 'kill' | 'hurt' | 'xp' | 'levelup' | 'pulse' | 'defeat';

export class SoundFx {
  private ctx: AudioContext | null = null;
  muted = false;

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
  }

  play(kind: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const spec: Record<Sfx, [OscillatorType, number, number, number, number]> = {
      // type, startHz, endHz, seconds, volume
      shot: ['square', 880, 520, 0.06, 0.03],
      hit: ['triangle', 300, 180, 0.05, 0.05],
      kill: ['triangle', 520, 900, 0.09, 0.06],
      hurt: ['sawtooth', 220, 90, 0.18, 0.08],
      xp: ['sine', 1200, 1600, 0.05, 0.04],
      levelup: ['square', 520, 1040, 0.3, 0.06],
      pulse: ['sine', 160, 60, 0.25, 0.1],
      defeat: ['sawtooth', 300, 50, 0.8, 0.1],
    };
    const [type, f0, f1, dur, vol] = spec[kind];
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}
