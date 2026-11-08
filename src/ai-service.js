// MediaPipe supplies landmarks; these five binary features need no ML backend.
export class AIService {
    constructor() {
        this.backend = 'javascript';
        this.referenceGestures = {
            Five: [1, 1, 1, 1, 1],
            Fist: [0, 0, 0, 0, 0],
            Point: [0, 1, 0, 0, 0],
            Peace: [0, 1, 1, 0, 0]
        };
        this.history = [];
        this.windowSize = 5;
    }

    async init(statusCallback) {
        statusCallback?.('Gesture controls ready');
        return this.backend;
    }

    getFeatures(landmarks) {
        const tips = [4, 8, 12, 16, 20];
        const mcps = [2, 5, 9, 13, 17];
        const wrist = landmarks[0];
        return tips.map((tipIdx, i) => {
            const tip = landmarks[tipIdx];
            const mcp = landmarks[mcps[i]];
            const dTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
            const dMcp = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
            return dTip > dMcp * 1.2 ? 1 : 0;
        });
    }

    classify(landmarks) {
        if (!landmarks || landmarks.length < 21) return null;
        const features = this.getFeatures(landmarks);
        let bestDistance = Infinity;
        let bestGesture = null;
        let tied = false;
        for (const [name, reference] of Object.entries(this.referenceGestures)) {
            const distance = features.reduce((sum, value, i) => sum + (value - reference[i]) ** 2, 0);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestGesture = name;
                tied = false;
            } else if (distance === bestDistance) {
                tied = true;
            }
        }
        // Accept at most one finger of error; ambiguous poses do nothing.
        return bestDistance <= 1 && !tied ? bestGesture : null;
    }

    predictMotion(currentPos) {
        this.history.push(currentPos);
        if (this.history.length > this.windowSize) this.history.shift();
        return {
            x: this.history.reduce((sum, p) => sum + p.x, 0) / this.history.length,
            y: this.history.reduce((sum, p) => sum + p.y, 0) / this.history.length
        };
    }

    reset() {
        this.history.length = 0;
    }
}
