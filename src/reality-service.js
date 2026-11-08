import { getHeartPoints, getStarPoints, getFlowerPoints, PARTICLE_COUNT } from './particles.js';

// Procedural motion effects driven by MediaPipe landmarks.
export class RealityService {
    constructor() {
        this.currentMode = null;
        this.cache = new Map();
        this.generatedPoints = new Float32Array(PARTICLE_COUNT * 3);
        this.time = 0;
        this.highEnergy = false;
    }

    generate(motionData, deltaSeconds = 1 / 60) {
        const shapeModes = { HEART_HANDS: 'HEART', STAR_HANDS: 'STAR', FLOWER_HANDS: 'FLOWER' };
        const energy = Math.min(1, Math.max(0, motionData?.energy ?? 0));
        // Separate entry/exit thresholds keep noisy motion from flickering modes.
        if (energy > 0.8) this.highEnergy = true;
        else if (energy < 0.55) this.highEnergy = false;
        const mode = shapeModes[motionData?.shape] ?? (this.highEnergy ? 'CHAOS' : 'FLUID');
        this.time += deltaSeconds * (0.6 + energy * 1.4);
        this.currentMode = mode;
        if (!this.cache.has(mode)) {
            const buffer = new Float32Array(PARTICLE_COUNT * 3);
            const generator = { HEART: getHeartPoints, STAR: getStarPoints, FLOWER: getFlowerPoints }[mode];
            if (generator) {
                generator().forEach((point, i) => buffer.set([point.x, point.y, point.z], i * 3));
            } else {
                for (let i = 0; i < buffer.length; i += 3) {
                    buffer[i] = (Math.random() - 0.5) * (mode === 'CHAOS' ? 100 : 60);
                    buffer[i + 1] = (Math.random() - 0.5) * (mode === 'CHAOS' ? 80 : 60);
                    buffer[i + 2] = (Math.random() - 0.5) * (mode === 'CHAOS' ? 50 : 20);
                }
            }
            this.cache.set(mode, buffer);
        }
        const base = this.cache.get(mode);
        if (mode === 'FLUID' || mode === 'CHAOS') {
            const amplitude = mode === 'CHAOS' ? 4 + energy * 6 : 1 + energy * 3;
            const speed = mode === 'CHAOS' ? 5 : 1;
            for (let i = 0; i < base.length; i += 3) {
                const phase = this.time * speed + base[i] * 0.1;
                this.generatedPoints[i] = base[i] + Math.sin(phase) * amplitude;
                this.generatedPoints[i + 1] = base[i + 1] + Math.cos(phase) * amplitude;
                this.generatedPoints[i + 2] = base[i + 2] + Math.sin(phase * 0.7) * amplitude;
            }
        } else {
            this.generatedPoints.set(base);
        }
        return this.generatedPoints;
    }

    scan(motionData, deltaSeconds) {
        return this.generate(motionData, deltaSeconds);
    }
}
