export class MotionAnalyzer {
    constructor() {
        this.history = []; // Store last N frames of landmarks
        this.maxHistory = 10;
        this.lastTime = 0;
    }

    analyze(landmarks, timestamp) {
        if (!landmarks || landmarks.length === 0) {
            return { energy: 0, speed: 0, shape: null };
        }

        // 1. Calculate Motion Metrics (Energy/Speed)
        // Average movement of all 21 points
        let totalSpeed = 0;

        if (this.history.length > 0) {
            const last = this.history[this.history.length - 1];
            const dt = (timestamp - last.time);

            if (dt > 0) {
                // For simplicity, take index 0 (Wrist) and 8 (Index Tip) movement
                // Or average all. Let's average Wrist(0) and Index(8) and Pinky(20)
                const indices = [0, 8, 20];
                let distSum = 0;

                // We handle single or multi hand. landmarks is array of arrays if multi?
                // MediaPipe `results.landmarks` is Array<Array<Landmark>>.
                // We assume landmarks[0] is first hand.
                const hand = landmarks[0];
                const lastHand = last.landmarks[0];

                if (hand && lastHand) {
                    for (let i of indices) {
                        const p1 = hand[i];
                        const p2 = lastHand[i];
                        const d = Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
                        distSum += d;
                    }
                    const avgDist = distSum / indices.length;
                    // Speed = distance / time. 
                    // Raw distance is in 0..1 coordinates.
                    totalSpeed = avgDist * 100; // Scale up
                }
            }
        }

        // Update History
        this.history.push({ time: timestamp, landmarks: landmarks });
        if (this.history.length > this.maxHistory) this.history.shift();

        // Energy is smoothed speed
        // Returns 0.0 (Still) to 1.0 (Fast)
        const energy = Math.min(totalSpeed, 1.0);


        // 2. Complex Shape Detection
        // Two-Hand Heart
        let complexShape = null;
        if (landmarks.length >= 2) {
            const h1 = landmarks[0];
            const h2 = landmarks[1];

            // Check for Heart:
            // Thumb tips (4) close, Index tips (8) touching and curved down?
            // Actually simpler: Thumbs touching, Indexes touching.

            const t1 = h1[4];
            const t2 = h2[4];
            const i1 = h1[8];
            const i2 = h2[8];
            const w1 = h1[0];
            const w2 = h2[0];

            const thumbDist = Math.sqrt(Math.pow(t1.x - t2.x, 2) + Math.pow(t1.y - t2.y, 2));
            const indexDist = Math.sqrt(Math.pow(i1.x - i2.x, 2) + Math.pow(i1.y - i2.y, 2));
            const wristDist = Math.sqrt(Math.pow(w1.x - w2.x, 2) + Math.pow(w1.y - w2.y, 2));

            const threshold = 0.08; // Tolerance

            // PRIORITY 1: HEART (Thumbs + Indexes touching, + Topology)
            if (thumbDist < threshold && indexDist < threshold) {
                // Check y-order for heart (Index below/near thumb usually for inverted heart? or above?)
                // Standard heart hands: Thumbs at bottom, Indexes curved at top.
                // MP Y: 0 is top. So Index (smaller y) < Thumb (larger y).
                if (i1.y < t1.y && i2.y < t2.y) {
                    complexShape = 'HEART_HANDS';
                }
            }

            // PRIORITY 2: STAR (Index fingers touching only)
            // If not heart, check just indexes
            if (!complexShape && indexDist < 0.05) {
                complexShape = 'STAR_HANDS';
            }

            // PRIORITY 3: FLOWER (Wrists touching)
            if (!complexShape && wristDist < 0.15) {
                complexShape = 'FLOWER_HANDS';
            }
        }

        return {
            energy: energy,
            shape: complexShape
        };
    }
}
