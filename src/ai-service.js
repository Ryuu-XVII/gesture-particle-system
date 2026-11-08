import { clamp, validHand, palmSize, fingerFeatures } from './hand-geometry.js';
import { PoseFilter } from './pose-filter.js';

// MediaPipe supplies landmarks; pose matching stays lightweight and local.
export class AIService {
    constructor() {
        this.backend = 'javascript';
        this.referenceGestures = {
            Five: [1, 1, 1, 1, 1], Fist: [0, 0, 0, 0, 0],
            Point: [0, 1, 0, 0, 0], Peace: [0, 1, 1, 0, 0]
        };
        this.poseFilter = new PoseFilter();
        this.reset();
    }

    async init(statusCallback) {
        statusCallback?.('Gesture controls ready');
        return this.backend;
    }

    getFeatures(landmarks) {
        return fingerFeatures(landmarks);
    }

    classifyDetailed(landmarks) {
        const empty = { gesture: null, confidence: 0, openness: 1 };
        if (!validHand(landmarks) || palmSize(landmarks) < 1e-4) return empty;
        const features = this.getFeatures(landmarks);
        const weights = [0.35, 1, 1, 1, 1]; // Thumb positions vary more than other fingers.
        const scores = Object.entries(this.referenceGestures).map(([gesture, reference]) => ({
            gesture,
            error: features.reduce((sum, value, i) => sum + weights[i] * (value - reference[i]) ** 2, 0) / 4.35
        })).sort((a, b) => a.error - b.error);
        const best = scores[0];
        const confidence = clamp(1 - best.error);
        // A high fit alone is insufficient if a competing pose fits just as well.
        const unambiguous = scores[1].error - best.error >= 0.04;
        return {
            gesture: confidence >= 0.84 && unambiguous ? best.gesture : null,
            confidence,
            matches: Object.fromEntries(scores.map(score => [score.gesture, clamp(1 - score.error)])),
            openness: features.slice(1).reduce((sum, value) => sum + value, 0) / 4
        };
    }

    classify(landmarks) {
        return this.classifyDetailed(landmarks).gesture;
    }

    update(landmarks, timestamp) {
        const result = this.classifyDetailed(landmarks);
        const gesture = this.poseFilter.update(result.gesture, timestamp);
        return { ...result, gesture, confidence: gesture ? result.matches?.[gesture] ?? 0 : 0, candidate: result.gesture };
    }

    predictMotion(currentPos, timestamp = performance.now()) {
        const dt = this.pointerTime === null ? 0 : (timestamp - this.pointerTime) / 1000;
        if (!this.pointer || dt <= 0 || dt > 0.25) {
            this.pointer = { x: currentPos.x, y: currentPos.y };
        } else {
            const speed = Math.hypot(currentPos.x - this.lastRaw.x, currentPos.y - this.lastRaw.y) / dt;
            // More smoothing at rest; less latency when deliberately moving.
            const tau = 0.085 - 0.06 * clamp(speed / 1.5);
            const alpha = 1 - Math.exp(-dt / tau);
            this.pointer.x += (currentPos.x - this.pointer.x) * alpha;
            this.pointer.y += (currentPos.y - this.pointer.y) * alpha;
        }
        this.pointerTime = timestamp;
        this.lastRaw = { x: currentPos.x, y: currentPos.y };
        return { ...this.pointer };
    }

    reset() {
        this.poseFilter.reset();
        this.pointer = null;
        this.pointerTime = null;
        this.lastRaw = null;
    }
}
