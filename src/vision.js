import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { AIService } from './ai-service.js';
import { MotionAnalyzer } from './motion-analyzer.js';

export class VisionManager {
    constructor() {
        this.video = document.getElementById('webcam');
        this.handLandmarker = null;
        this.lastVideoTime = -1;
        this.isReady = false;
        this.disposed = false;
        this.aiService = new AIService();
        this.motionAnalyzer = new MotionAnalyzer();
        this.gestureData = {
            expansionFactor: 1,
            gesture: null,
            pointer: { x: 0.5, y: 0.5 },
            motion: { energy: 0, shape: null }
        };
    }

    async init(statusFn) {
        try {
            await this.aiService.init(statusFn);
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm'
            );
            const options = {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                    delegate: 'GPU'
                },
                runningMode: 'VIDEO',
                numHands: 2
            };
            try {
                this.handLandmarker = await HandLandmarker.createFromOptions(vision, options);
                this.backend = 'GPU';
            } catch (error) {
                statusFn?.('GPU unavailable; trying CPU…');
                options.baseOptions.delegate = 'CPU';
                this.handLandmarker = await HandLandmarker.createFromOptions(vision, options);
                this.backend = 'CPU';
            }
            if (this.disposed) throw new Error('Camera initialization cancelled');
            statusFn?.('Allow camera access to enable gestures');
            await this.startWebcam();
            this.isReady = true;
            return this.backend;
        } catch (error) {
            this.dispose();
            throw error;
        }
    }

    async startWebcam() {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('Camera access requires HTTPS or localhost and a supported browser');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 }, audio: false
        });
        if (this.disposed) {
            stream.getTracks().forEach(track => track.stop());
            throw new Error('Camera initialization cancelled');
        }
        this.video.srcObject = stream;
        // play() resolves when playback actually starts, or rejects on failure.
        await this.video.play();
    }

    detect(timestamp = performance.now()) {
        if (!this.isReady || this.video.readyState < 2) return this.gestureData;
        if (this.video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.video.currentTime;
            const results = this.handLandmarker.detectForVideo(this.video, timestamp);
            this.processGestures(results.landmarks ?? [], timestamp);
        }
        return this.gestureData;
    }

    processGestures(hands, timestamp) {
        this.gestureData.motion = this.motionAnalyzer.analyze(hands, timestamp);
        if (hands.length === 0) {
            this.gestureData.gesture = null;
            this.gestureData.expansionFactor = 1;
            this.aiService.reset();
            return;
        }
        const landmarks = hands[0];
        const gesture = this.aiService.classify(landmarks);
        this.gestureData.gesture = gesture;
        if (gesture === 'Fist') this.gestureData.expansionFactor = 0;
        else if (gesture === 'Five') this.gestureData.expansionFactor = 1;
        this.gestureData.pointer = this.aiService.predictMotion(landmarks[8]);
    }

    dispose() {
        this.disposed = true;
        this.isReady = false;
        this.video.srcObject?.getTracks().forEach(track => track.stop());
        this.video.srcObject = null;
        this.handLandmarker?.close();
        this.handLandmarker = null;
        this.aiService.reset();
        this.motionAnalyzer.reset();
        this.gestureData.gesture = null;
        this.gestureData.expansionFactor = 1;
        this.gestureData.motion = { energy: 0, shape: null };
    }
}
