
import { SceneManager } from './scene.js';
import { VisionManager } from './vision.js';
import { RealityService } from './reality-service.js';
import { UIManager } from './ui.js';
import { VoiceService } from './voice-service.js';

class App {
    constructor() {
        this.sceneManager = new SceneManager();
        this.visionManager = new VisionManager();
        // Link video from VisionManager (shared element)
        this.realityService = new RealityService();

        this.uiManager = new UIManager(this.sceneManager); // Pass sceneManager to UI
        this.voiceService = new VoiceService();

        this.setupVoiceControl();

        this.lastTime = 0;
        this.frameCount = 0;
        this.lastFpsTime = 0;

        this.init();
    }

    setupVoiceControl() {
        const btnMic = document.getElementById('btn-mic');
        if (!btnMic) return;

        btnMic.addEventListener('click', () => {
            if (this.voiceService.isListening) {
                this.voiceService.stop();
                btnMic.textContent = "🎙️ Voice Off";
                btnMic.style.background = "rgba(255,0,0,0.2)";
                btnMic.classList.remove('active');
            } else {
                this.voiceService.start(
                    (shape) => {
                        console.log("Voice Command Executed:", shape);
                        this.sceneManager.setShape(shape);
                        this.uiManager.setStatus(`Voice: ${shape.toUpperCase()} `);

                        // Update UI activeness
                        document.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
                        const matches = document.querySelectorAll(`[data-shape="${shape}"]`);
                        if (matches.length > 0) matches[0].classList.add('active');
                    },
                    (status) => {
                        if (status) this.uiManager.setStatus(status);
                    }
                );
                btnMic.textContent = "🎙️ Listening...";
                btnMic.style.background = "rgba(0,255,0,0.2)";
                btnMic.classList.add('active');
            }
        });
    }

    async init() {
        this.uiManager.setStatus("Loading AI & Vision...");
        await this.visionManager.init((msg) => this.uiManager.setStatus(msg));

        // Get verified backend
        const backend = this.visionManager.aiService.backend;
        this.uiManager.updateBackend(backend.toUpperCase());
        this.uiManager.setStatus("Ready!");

        this.animate(0);
    }

    animate(timestamp) {
        requestAnimationFrame(this.animate.bind(this));

        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        // FPS Calculation
        this.frameCount++;
        if (timestamp - this.lastFpsTime >= 1000) {
            this.uiManager.updateStats(this.frameCount);
            this.frameCount = 0;
            this.lastFpsTime = timestamp;
        }

        // Logic
        const gestures = this.visionManager.detect();

        // Reality AI / AI Director Mode
        let proceduralPoints = null;
        if (this.sceneManager.currentShape === 'reality') {
            // Pass motion data to generator
            proceduralPoints = this.realityService.scan(gestures.motion);
        }

        this.sceneManager.update(gestures, proceduralPoints);

        // Update UI with AI result
        this.uiManager.updateGesture(gestures.gesture);
    }
}

// Start App
window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});
