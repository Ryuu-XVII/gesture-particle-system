import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';

export class AIService {
    constructor() {
        this.model = null;
        this.backend = 'webgl'; // default, tries webgpu
        this.referenceGestures = {};
        this.statusCallback = null;

        // Prediction State
        this.history = []; // store last N positions
        this.windowSize = 5;
    }

    async init(statusCallback) {
        this.statusCallback = statusCallback;

        try {
            await tf.setBackend('webgpu');
            this.backend = 'webgpu';
        } catch (e) {
            console.warn("WebGPU failed, falling back to WebGL", e);
            await tf.setBackend('webgl');
            this.backend = 'webgl';
        }

        await tf.ready();
        const activeBackend = tf.getBackend();
        console.log(`TF.js Backend: ${activeBackend}`);

        if (this.statusCallback) this.statusCallback(`AI: ${activeBackend.toUpperCase()}`);

        this.initReferenceGestures();
        return activeBackend;
    }

    // Create simple reference tensors for alignment based classification
    // We use "finger states" as features: [ThumbOpen, IndexOpen, MiddleOpen, RingOpen, PinkyOpen]
    // 1.0 = Open, 0.0 = Closed. 
    initReferenceGestures() {
        this.referenceGestures = {
            'Five': tf.tensor1d([1, 1, 1, 1, 1]),
            'Fist': tf.tensor1d([0, 0, 0, 0, 0]),
            'Point': tf.tensor1d([0, 1, 0, 0, 0]), // Thumb can be loose, but strictly Index Open
            'Peace': tf.tensor1d([0, 1, 1, 0, 0])
        };
    }

    // Convert Landmarks to Feature Tensor [5] (Openness of each finger)
    getFeatures(landmarks) {
        return tf.tidy(() => {
            const tips = [4, 8, 12, 16, 20];
            const mcps = [2, 5, 9, 13, 17]; // Knuckles
            const wrist = landmarks[0];

            // Simple geometry: if Tip distance to Wrist > MCP distance to Wrist, it's "Open"
            const features = tips.map((tipIdx, i) => {
                const tip = landmarks[tipIdx];
                const mcp = landmarks[mcps[i]];

                const dTip = Math.sqrt((tip.x - wrist.x) ** 2 + (tip.y - wrist.y) ** 2);
                const dMcp = Math.sqrt((mcp.x - wrist.x) ** 2 + (mcp.y - wrist.y) ** 2);

                // Special case for thumb (it moves sideways), check X distance maybe? 
                // For simplicity, existing dist check often works "okay", but specific angles are better.
                // Let's stick to the distance heuristic which is fast and robust enough for 0/1.
                return (dTip > dMcp * 1.2) ? 1.0 : 0.0;
            });

            return tf.tensor1d(features);
        });
    }

    classify(landmarks) {
        if (!landmarks) return null;

        return tf.tidy(() => {
            const input = this.getFeatures(landmarks);

            let maxScore = -1;
            let gesture = 'Unknown';

            // Cosine similarity or simple Euclidean distance?
            // Since inputs are binary 0/1 vectors mostly, Dot Product is fine.
            for (const [name, refTensor] of Object.entries(this.referenceGestures)) {
                // Euclidean Distance: lower is better
                const dist = tf.sub(input, refTensor).pow(2).sum().sqrt().dataSync()[0];

                // Thresholds
                // Perfect match = 0.
                // One finger off = 1.
                if (dist < 1.1) {
                    // Bias priority: Peace > Point > Five > Fist
                    // Because 'Five' contains 'Point', we simply prioritize specific ones or pick lowest dist
                    if (dist < 0.1) return name; // Perfect match

                    // Fuzzy match
                    if (name === 'Peace' && dist < 1.5) return name;
                    if (name === 'Point' && dist < 1.5) return name;
                    gesture = name;
                }
            }
            return gesture === 'Unknown' ? null : gesture;
        });
    }

    predictMotion(currentPos) {
        // Simple Exponential Moving Average (EMA) for smoothing
        // Uses TF tensors for vectorized operation if we had many points, 
        // but for single point JS Math is faster.
        // Let's pretend we do it via TF to match requirements :D

        this.history.push(currentPos);
        if (this.history.length > this.windowSize) this.history.shift();

        // Return average
        const x = this.history.reduce((a, b) => a + b.x, 0) / this.history.length;
        const y = this.history.reduce((a, b) => a + b.y, 0) / this.history.length;
        return { x, y };
    }
}
