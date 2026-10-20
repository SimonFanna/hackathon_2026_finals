// Quality presets and an fps governor that asks to drop to low quality on weak GPUs.

export type Quality = "high" | "low";

export interface QualityPreset {
  pixelRatio: number;
  bloom: boolean;
  /** Fraction of decorative instances (windows, field lights) to draw. */
  density: number;
  antialias: boolean;
}

export function preset(q: Quality, devicePixelRatio: number): QualityPreset {
  return q === "high"
    ? { pixelRatio: Math.min(devicePixelRatio, 2), bloom: true, density: 1, antialias: true }
    : { pixelRatio: 1, bloom: false, density: 0.4, antialias: false };
}

export class FpsGovernor {
  private times: number[] = [];
  private start: number | null = null;
  fps = 60;
  constructor(private opts: { windowMs: number; minFps: number; warmupMs: number }) {}

  /** Feed one frame timestamp (ms). Returns true when quality should drop. */
  sample(now: number): boolean {
    if (this.start == null) this.start = now;
    this.times.push(now);
    while (this.times.length && now - this.times[0] > this.opts.windowMs) this.times.shift();
    if (this.times.length > 1) this.fps = ((this.times.length - 1) * 1000) / (now - this.times[0]);
    const warm = now - this.start >= this.opts.warmupMs + this.opts.windowMs;
    return warm && this.fps < this.opts.minFps;
  }

  reset() {
    this.times = [];
    this.start = null;
  }
}
