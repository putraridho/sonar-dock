// How fast the model streams (answer, thinking, tool arguments): characters per sample, each
// sample against the recent peak, so slow and fast models both fill the meter.

export const FLOW_SAMPLE_MS = 200
const MIN_PEAK = 40
const PEAK_DECAY = 0.97

export class FlowMeter {
  private readonly samples: number[]
  private pending = 0
  private peak = MIN_PEAK

  constructor(readonly size: number) {
    this.samples = new Array(size).fill(0)
  }

  note(chars: number): void {
    this.pending += chars
  }

  // Closes a sample.
  roll(): readonly number[] {
    this.peak = Math.max(MIN_PEAK, this.peak * PEAK_DECAY, this.pending)
    this.samples.push(this.pending / this.peak)
    this.pending = 0
    while (this.samples.length > this.size) this.samples.shift()
    return this.samples
  }

  get readings(): readonly number[] {
    return this.samples
  }
}
