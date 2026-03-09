import * as THREE from 'three';
import { getHeartPoints, getStarPoints, getFireworksPoints, getFlowerPoints, getSaturnPoints, PARTICLE_COUNT } from './particles.js';

export class SceneManager {
    constructor() {
        this.canvas = document.querySelector('canvas');
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
        this.camera.position.z = 30;
        this.targetZ = 30; // for zoom lerping

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.body.appendChild(this.renderer.domElement);

        // Resize handler
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Particle System
        this.particles = null;
        this.geometry = null;
        this.material = null;

        // State
        this.currentShape = 'heart';
        this.targetPositions = [];
        this.baseColor = new THREE.Color('#00ffff');

        // Gesture State
        this.expansion = 1.0;
        this.targetExpansion = 1.0;
        this.rotationX = 0;
        this.rotationY = 0;
        this.rotationZ = 0;
        this.targetRotationX = 0;
        this.targetRotationY = 0;
        this.targetRotationZ = 0;

        this.initParticles();
    }

    initParticles() {
        this.geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(PARTICLE_COUNT * 3);

        // Initial positions (random)
        for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 100;
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Material
        const sprite = new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/sprites/disc.png');

        this.material = new THREE.PointsMaterial({
            color: this.baseColor,
            size: 0.5,
            map: sprite,
            sizeAttenuation: true,
            alphaTest: 0.5,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.particles);

        // Check valid current shape just in case
        this.setShape(this.currentShape);
    }

    setShape(shapeName) {
        this.currentShape = shapeName;
        let points = [];
        switch (shapeName) {
            case 'heart': points = getHeartPoints(); break;
            case 'star': points = getStarPoints(); break;
            case 'fireworks': points = getFireworksPoints(); break;
            case 'flower': points = getFlowerPoints(); break;
            case 'saturn': points = getSaturnPoints(); break;
            case 'reality':
                // Reality mode handled dynamically in update()
                // We set a marker here
                this.targetPositions = []; // Will be filled per frame
                break;
            default: points = getHeartPoints();
        }

        // Only set static targets if NOT reality
        if (shapeName !== 'reality') {
            this.targetPositions = points;
        }
    }

    setColor(hexColor) {
        this.baseColor.set(hexColor);
        if (this.material) this.material.color.set(hexColor);
    }

    onWindowResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }

    // Helper: Lerp vector3 towards target
    lerpParticles(realityPoints = null) {
        const positions = this.geometry.attributes.position.array;

        // If Reality Mode (AI Director)
        if (this.currentShape === 'reality' && realityPoints && realityPoints.length > 0) {
            // Dynamic Lerp Factor based on "Energy" ? 
            // For now use constant, or we could pass energy in.
            const lerpFactor = 0.08;

            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const ix = i * 3;
                // Loop if fewer points
                const pt = realityPoints[i % realityPoints.length];

                // Lerp
                positions[ix] += (pt.x - positions[ix]) * lerpFactor;
                positions[ix + 1] += (pt.y - positions[ix + 1]) * lerpFactor;
                positions[ix + 2] += (pt.z - positions[ix + 2]) * lerpFactor;
            }
            this.geometry.attributes.position.needsUpdate = true;
            return;
        }

        // Normal Shape Mode
        const lerpFactor = 0.05; // speed of shape transition
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const target = this.targetPositions[i];
            if (!target) continue;

            const ix = i * 3;
            const iy = i * 3 + 1;
            const iz = i * 3 + 2;

            // Base Target Position
            let tx = target.x;
            let ty = target.y;
            let tz = target.z;

            // Apply Expansion/Collapse (Gesture)
            // Expansion is a multiplier from hand open/fist
            tx *= this.expansion;
            ty *= this.expansion;
            tz *= this.expansion;

            // Current Pos
            let cx = positions[ix];
            let cy = positions[iy];
            let cz = positions[iz];

            // Lerp
            positions[ix] = cx + (tx - cx) * lerpFactor;
            positions[iy] = cy + (ty - cy) * lerpFactor;
            positions[iz] = cz + (tz - cz) * lerpFactor;
        }
        this.geometry.attributes.position.needsUpdate = true;
    }

    update(gestureData, realityPoints = null) {
        // 1. Process Gesture Data
        if (gestureData) {
            // Expansion (Mapped from Fist/Five)
            if (gestureData.expansionFactor !== undefined) {
                // 0 (fist) -> 0.1 (collapsed)
                // 1 (spread) -> 1.5 (expanded)
                const e = gestureData.expansionFactor;
                this.targetExpansion = 0.1 + (e * 1.4);
            }

            // Special Gestures
            if (gestureData.gesture === 'Peace') {
                // Randomize color occasionally
                if (Math.random() < 0.05) {
                    this.particles.material.color.setHSL(Math.random(), 1, 0.5);
                }
            }

            if (gestureData.gesture === 'Point' && gestureData.pointer) {
                // Gravity Well at pointer
                // Map 0..1 x/y to -20..20 world coords approx
                const px = (gestureData.pointer.x - 0.5) * -40; // Invert X
                const py = (gestureData.pointer.y - 0.5) * -30; // Invert Y

                // This would require updating every particle speed towards this point
                // For now, let's just make the whole system drift towards it or distort
                this.particles.position.x += (px - this.particles.position.x) * 0.05;
                this.particles.position.y += (py - this.particles.position.y) * 0.05;
            } else {
                // Reset position
                this.particles.position.x *= 0.95;
                this.particles.position.y *= 0.95;
            }
        }

        // Auto Rotation (Slow)
        this.particles.rotation.y += 0.002;

        // Smooth Interpolation for Expansion
        this.expansion += (this.targetExpansion - this.expansion) * 0.1;

        // Interpolate individual particles
        this.lerpParticles(realityPoints);

        // Render
        this.renderer.render(this.scene, this.camera);
    }
}
