// Confirm a pose over elapsed time, rather than a frame-count vote. A brief
// uncertain sample keeps the last pose; sustained uncertainty releases it.
export class PoseFilter {
    constructor(holdMs = 90, releaseMs = 120) {
        this.holdMs = holdMs;
        this.releaseMs = releaseMs;
        this.reset();
    }

    reset() {
        this.stable = null;
        this.candidate = null;
        this.since = null;
        this.lastTime = null;
    }

    update(pose, timestamp) {
        if (!Number.isFinite(timestamp)) { this.reset(); return null; }
        if (this.lastTime !== null && (timestamp < this.lastTime || timestamp - this.lastTime > 250)) this.reset();
        this.lastTime = timestamp;
        if (pose === this.stable) {
            this.candidate = pose;
            this.since = timestamp;
            return this.stable;
        }
        if (pose !== this.candidate || this.since === null) {
            this.candidate = pose;
            this.since = timestamp;
        }
        if (timestamp - this.since >= (pose ? this.holdMs : this.releaseMs)) this.stable = pose;
        return this.stable;
    }
}
