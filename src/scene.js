import * as THREE from 'three';
import { getHeartPoints, getStarPoints, getFireworksPoints, getFlowerPoints, getSaturnPoints, PARTICLE_COUNT } from './particles.js';

export class SceneManager {
    constructor() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, this.width / this.height, 0.1, 1000);
        this.camera.position.z = 30;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        document.body.appendChild(this.renderer.domElement);

        // Resize handler
        this.resizeHandler = this.onWindowResize.bind(this);
        window.addEventListener('resize', this.resizeHandler);

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
        // Generate the sprite locally so a remote texture failure cannot hide particles.
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const context = canvas.getContext('2d');
        context.fillStyle = 'white';
        context.beginPath();
        context.arc(16, 16, 15, 0, Math.PI * 2);
        context.fill();
        this.sprite = new THREE.CanvasTexture(canvas);

        this.material = new THREE.PointsMaterial({
            color: this.baseColor,
            size: 0.5,
            map: this.sprite,
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
                // Motion targets are supplied dynamically each frame.
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
    lerpParticles(realityPoints = null, deltaSeconds = 1 / 60) {
        const positions = this.geometry.attributes.position.array;

        // Procedural motion targets use the same expansion as static shapes.
        if (this.currentShape === 'reality' && realityPoints && realityPoints.length > 0) {
            const lerpFactor = 1 - Math.pow(1 - 0.08, deltaSeconds * 60);

            const flat = realityPoints instanceof Float32Array;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const ix = i * 3;
                const pt = flat ? null : realityPoints[i % realityPoints.length];
                const x = flat ? realityPoints[ix] : pt.x;
                const y = flat ? realityPoints[ix + 1] : pt.y;
                const z = flat ? realityPoints[ix + 2] : pt.z;

                // Lerp
                positions[ix] += (x * this.expansion - positions[ix]) * lerpFactor;
                positions[ix + 1] += (y * this.expansion - positions[ix + 1]) * lerpFactor;
                positions[ix + 2] += (z * this.expansion - positions[ix + 2]) * lerpFactor;
            }
            this.geometry.attributes.position.needsUpdate = true;
            return;
        }

        // Normal Shape Mode
        const lerpFactor = 1 - Math.pow(1 - 0.05, deltaSeconds * 60);
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

    dispose() {
        window.removeEventListener('resize', this.resizeHandler);
        this.geometry.dispose();
        this.material.dispose();
        this.sprite.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }

    update(gestureData, realityPoints = null, deltaSeconds = 1 / 60) {
        const moveAlpha = 1 - Math.pow(0.95, deltaSeconds * 60);
        const expansionAlpha = 1 - Math.pow(0.9, deltaSeconds * 60);
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
                if (Math.random() < moveAlpha) {
                    this.particles.material.color.setHSL(Math.random(), 1, 0.5);
                }
            }

            if (gestureData.gesture === 'Point' && gestureData.pointer) {
                // Map 0..1 x/y to -20..20 world coords approx
                const px = (gestureData.pointer.x - 0.5) * -40; // Invert X
                const py = (gestureData.pointer.y - 0.5) * -30; // Invert Y

                // Smoothly move the system toward the pointing finger.
                this.particles.position.x += (px - this.particles.position.x) * moveAlpha;
                this.particles.position.y += (py - this.particles.position.y) * moveAlpha;
            } else {
                // Reset position
                this.particles.position.x *= 1 - moveAlpha;
                this.particles.position.y *= 1 - moveAlpha;
            }
        }

        // Auto Rotation (Slow)
        this.particles.rotation.y += 0.12 * deltaSeconds;

        // Smooth Interpolation for Expansion
        this.expansion += (this.targetExpansion - this.expansion) * expansionAlpha;

        // Interpolate individual particles
        this.lerpParticles(realityPoints, deltaSeconds);

        // Render
        this.renderer.render(this.scene, this.camera);
    }
}
