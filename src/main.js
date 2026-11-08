import { SceneManager } from './scene.js';
import { VisionManager } from './vision.js';
import { RealityService } from './reality-service.js';
import { UIManager } from './ui.js';
import { VoiceService } from './voice-service.js';

class App {
    constructor() {
        this.sceneManager = new SceneManager();
        this.visionManager = new VisionManager();
        this.realityService = new RealityService();
        this.uiManager = new UIManager(this.sceneManager);
        this.voiceService = new VoiceService();
        this.lastTime = null;
        this.frameCount = 0;
        this.lastFpsTime = null;
        this.disposed = false;
        this.animate = this.animate.bind(this);
        this.setupVoiceControl();
        window.addEventListener('pagehide', () => this.dispose(), { once: true });
        // Rendering and manual controls work while camera permission is pending.
        this.animationId = requestAnimationFrame(this.animate);
        this.init();
    }

    setupVoiceControl() {
        const button = document.getElementById('btn-mic');
        if (!this.voiceService.recognition) {
            button.disabled = true;
            button.textContent = 'Voice unavailable';
            return;
        }
        button.addEventListener('click', () => {
            if (this.voiceService.shouldListen) {
                this.voiceService.stop();
                this.uiManager.setStatus(this.visionManager.isReady ? 'Ready!' : 'Manual controls available');
                return;
            }
            this.voiceService.start(shape => {
                this.sceneManager.setShape(shape);
                document.querySelectorAll('.shape-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.shape === shape);
                });
            }, status => this.uiManager.setStatus(status), state => {
                button.textContent = state === 'listening' ? '🎙️ Listening…' : state === 'starting' ? '🎙️ Starting…' : '🎙️ Voice Off';
                button.classList.toggle('active', state === 'listening');
                button.setAttribute('aria-pressed', String(state === 'listening'));
                button.style.background = state === 'listening' ? 'rgba(0,255,0,0.2)' : 'rgba(255,0,0,0.2)';
            });
        });
    }

    async init() {
        this.uiManager.setStatus('Loading hand tracking…');
        try {
            const backend = await this.visionManager.init(message => {
                if (!this.disposed) this.uiManager.setStatus(message);
            });
            if (this.disposed) return;
            this.uiManager.updateBackend(backend);
            this.uiManager.setStatus('Ready!');
        } catch (error) {
            if (this.disposed) return;
            this.uiManager.updateBackend('Unavailable');
            this.uiManager.setStatus(`Gestures unavailable: ${error.message}. Manual controls still work.`);
        }
    }

    animate(timestamp) {
        if (this.disposed) return;
        this.animationId = requestAnimationFrame(this.animate);
        const deltaSeconds = this.lastTime === null ? 1 / 60 : Math.min(Math.max((timestamp - this.lastTime) / 1000, 0), 0.1);
        this.lastTime = timestamp;
        this.lastFpsTime ??= timestamp;
        this.frameCount++;
        const elapsed = timestamp - this.lastFpsTime;
        if (elapsed >= 1000) {
            this.uiManager.updateStats(Math.round(this.frameCount * 1000 / elapsed));
            this.frameCount = 0;
            this.lastFpsTime = timestamp;
        }
        let gestures;
        try {
            gestures = this.visionManager.detect(timestamp);
        } catch (error) {
            this.visionManager.dispose();
            gestures = this.visionManager.gestureData;
            this.uiManager.updateBackend('Unavailable');
            this.uiManager.setStatus(`Tracking stopped: ${error.message}. Manual controls still work.`);
        }
        const points = this.sceneManager.currentShape === 'reality'
            ? this.realityService.scan(gestures.motion, deltaSeconds) : null;
        this.sceneManager.update(gestures, points, deltaSeconds);
        this.uiManager.updateGesture(gestures);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        cancelAnimationFrame(this.animationId);
        this.voiceService.dispose();
        this.visionManager.dispose();
        this.sceneManager.dispose();
    }
}

window.addEventListener('DOMContentLoaded', () => new App());
