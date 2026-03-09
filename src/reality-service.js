import * as THREE from 'three';
import { getHeartPoints, getStarPoints, getFireworksPoints, getFlowerPoints, PARTICLE_COUNT } from './particles.js';

// Reusing this file/class name to avoid breaking imports, but logic is all new.
export class RealityService {
    constructor() {
        this.currentMode = 'neutral';
        this.generatedPoints = null;
    }

    // "Scan" is now "Generate based on Motion"
    // Returns array of Vector3 OR null (if we should just use standard physics)
    // Actually, SceneManager expects a list of points to Lerp to.
    generate(motionData) {
        if (!motionData) return [];

        const points = [];

        // 1. Shape Override (Highest Priority)
        // HEART HANDS
        if (motionData.shape === 'HEART_HANDS') {
            if (this.currentMode !== 'HEART') {
                this.generatedPoints = getHeartPoints(PARTICLE_COUNT);
                this.currentMode = 'HEART';
            }
            return this.generatedPoints;
        }

        // STAR HANDS (E.T. Touch)
        if (motionData.shape === 'STAR_HANDS') {
            if (this.currentMode !== 'STAR') {
                this.generatedPoints = getStarPoints(PARTICLE_COUNT);
                this.currentMode = 'STAR';
            }
            return this.generatedPoints;
        }

        // FLOWER HANDS (Wrists Touch)
        if (motionData.shape === 'FLOWER_HANDS') {
            if (this.currentMode !== 'FLOWER') {
                this.generatedPoints = getFlowerPoints(PARTICLE_COUNT);
                this.currentMode = 'FLOWER';
            }
            return this.generatedPoints;
        }

        // 2. High Energy (Explosion/Spark)
        // If moving very fast
        if (motionData.energy > 0.8) {
            // Generate random chaotic points
            // "Explosive" flow
            const count = PARTICLE_COUNT;
            for (let i = 0; i < count; i++) {
                // Random scatter
                const x = (Math.random() - 0.5) * 100;
                const y = (Math.random() - 0.5) * 80;
                const z = (Math.random() - 0.5) * 50;
                points.push({ x, y, z });
            }
            this.currentMode = 'CHAOS';
            return points;
        }

        // 3. Fluid Flow (Low Energy)
        // Generate a flowing wave or nebula
        if (this.currentMode !== 'FLUID') {
            // We can return a specific shape, or just "null" to let SceneManager handle safe defaults?
            // Let's generate a "Cloud" shape
            const count = PARTICLE_COUNT;
            for (let i = 0; i < count; i++) {
                const x = (Math.random() - 0.5) * 60;
                const y = (Math.random() - 0.5) * 60;
                const z = (Math.random() - 0.5) * 20;
                points.push({ x, y, z });
            }
            this.generatedPoints = points;
            this.currentMode = 'FLUID';
        }

        return this.generatedPoints;
    }

    // Alias for compatibility if main.js calls scan()
    scan(motionData) {
        return this.generate(motionData);
    }
}
