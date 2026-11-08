import { clamp, validHand, distance, distance2D, palmSize, fingerFeatures } from './hand-geometry.js';
import { PoseFilter } from './pose-filter.js';

export class MotionAnalyzer {
    constructor() {
        this.shapeFilter = new PoseFilter(120, 160);
        this.reset();
    }

    reset() {
        this.previous = null;
        this.energy = 0;
        this.shapeFilter.reset();
    }

    matchHands(hands) {
        if (hands.length !== 2 || this.previous?.hands.length !== 2) return hands;
        const last = this.previous.hands;
        const direct = distance2D(hands[0][0], last[0][0]) + distance2D(hands[1][0], last[1][0]);
        const swapped = distance2D(hands[1][0], last[0][0]) + distance2D(hands[0][0], last[1][0]);
        return swapped < direct ? [hands[1], hands[0]] : hands;
    }

    detectShape(hands) {
        if (hands.length < 2) return null;
        const [a, b] = hands;
        // Ratios adapt contact thresholds when hands move toward/away from camera.
        const scale = (palmSize(a) + palmSize(b)) / 2;
        const thumbs = distance2D(a[4], b[4]) / scale;
        const indexes = distance2D(a[8], b[8]) / scale;
        const wrists = distance2D(a[0], b[0]) / scale;
        const indexAboveThumb = hand => {
            const dx = hand[9].x - hand[0].x, dy = hand[9].y - hand[0].y;
            const length = Math.hypot(dx, dy);
            if (length < 1e-6) return false;
            return ((hand[8].x - hand[4].x) * dx + (hand[8].y - hand[4].y) * dy) / length > scale * 0.1;
        };
        if (thumbs < 0.55 && indexes < 0.55 && indexAboveThumb(a) && indexAboveThumb(b)) return 'HEART_HANDS';
        if (indexes < 0.35) return 'STAR_HANDS';
        const open = hands.every(hand => fingerFeatures(hand).slice(1).filter(value => value > 0.65).length >= 3);
        if (wrists < 0.9 && open && distance2D(a[12], b[12]) > scale) return 'FLOWER_HANDS';
        return null;
    }

    analyze(landmarks, timestamp) {
        const hands = (landmarks ?? []).filter(hand => validHand(hand) && palmSize(hand) >= 1e-4);
        if (!hands.length || !Number.isFinite(timestamp)) {
            this.reset();
            return { energy: 0, speed: 0, shape: null };
        }
        const ordered = this.matchHands(hands);
        const dt = this.previous ? (timestamp - this.previous.time) / 1000 : 0;
        let speed = 0;
        if (dt > 0 && dt <= 0.25 && this.previous.hands.length === ordered.length) {
            let total = 0, matches = 0;
            ordered.forEach((hand, i) => {
                const last = this.previous.hands[i];
                const scale = (palmSize(hand) + palmSize(last)) / 2;
                // Ignore implausible jumps, such as a newly acquired hand.
                if (distance2D(hand[0], last[0]) / scale > 2) return;
                const movement = [0, 8, 20].reduce((sum, index) => sum + distance(hand[index], last[index]), 0) / 3;
                total += movement / scale / dt;
                matches++;
            });
            speed = matches ? total / matches : 0; // Palm widths per second.
            this.energy += (clamp(speed / 5) - this.energy) * (1 - Math.exp(-dt / 0.08));
        } else {
            this.energy = 0;
            this.shapeFilter.reset();
        }
        this.previous = { hands: ordered, time: timestamp };
        const candidateShape = this.detectShape(ordered);
        return { energy: this.energy, speed, shape: this.shapeFilter.update(candidateShape, timestamp), candidateShape };
    }
}
