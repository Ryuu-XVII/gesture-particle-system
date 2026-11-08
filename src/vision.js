import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { AIService } from './ai-service.js';
import { MotionAnalyzer } from './motion-analyzer.js';
import { validHand, distance2D, palmSize } from './hand-geometry.js';

export class VisionManager {
    constructor() {
        this.video = document.getElementById('webcam');
        this.handLandmarker = null;
        this.lastVideoTime = -1;
        this.isReady = false;
        this.disposed = false;
        this.primaryWrist = null;
        this.lastTrackingTime = null;
        this.aiService = new AIService();
        this.motionAnalyzer = new MotionAnalyzer();
        this.gestureData = {
            expansionFactor: 1,
            gesture: null,
            candidate: null,
            confidence: 0,
            handCount: 0,
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
        if (!this.isReady) return this.gestureData;
        if (this.lastTrackingTime !== null && timestamp - this.lastTrackingTime > 250) this.processGestures([], timestamp);
        if (this.video.readyState < 2) return this.gestureData;
        if (this.video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.video.currentTime;
            const results = this.handLandmarker.detectForVideo(this.video, timestamp);
            this.processGestures(results.landmarks ?? [], timestamp, results.worldLandmarks ?? []);
        }
        return this.gestureData;
    }

    processGestures(hands, timestamp, worldHands = []) {
        const tracked = hands.map((landmarks, index) => ({ landmarks, world: worldHands[index] }))
            .filter(item => validHand(item.landmarks) && palmSize(item.landmarks) >= 1e-4);
        hands = tracked.map(item => item.landmarks);
        this.gestureData.handCount = hands.length;
        this.gestureData.motion = this.motionAnalyzer.analyze(hands, timestamp);
        if (hands.length === 0) {
            this.gestureData.gesture = null;
            this.gestureData.expansionFactor = 1;
            this.gestureData.confidence = 0;
            this.gestureData.candidate = null;
            this.primaryWrist = null;
            this.lastTrackingTime = null;
            this.aiService.reset();
            return;
        }
        // Keep control with the nearest wrist when MediaPipe changes hand order.
        const landmarks = this.primaryWrist
            ? hands.reduce((best, hand) => distance2D(hand[0], this.primaryWrist) < distance2D(best[0], this.primaryWrist) ? hand : best)
            : hands[0];
        if (this.primaryWrist && (distance2D(landmarks[0], this.primaryWrist) / palmSize(landmarks) > 2 || timestamp - this.lastTrackingTime > 250)) {
            this.aiService.reset();
        }
        this.primaryWrist = { ...landmarks[0] };
        this.lastTrackingTime = timestamp;
        const world = tracked[hands.indexOf(landmarks)].world;
        // World landmarks have consistent 3D units; fall back to image landmarks.
        const poseLandmarks = validHand(world) && palmSize(world) >= 1e-4 ? world : landmarks;
        const result = this.aiService.update(poseLandmarks, timestamp);
        this.gestureData.gesture = result.gesture;
        this.gestureData.candidate = result.candidate;
        this.gestureData.confidence = result.confidence;
        // Pointing and color commands preserve scale; otherwise curling is continuous.
        if (!this.gestureData.motion.shape && !this.gestureData.motion.candidateShape && ![result.candidate, result.gesture].some(pose => ['Point', 'Peace'].includes(pose))) {
            this.gestureData.expansionFactor = result.openness;
        }
        this.gestureData.pointer = this.aiService.predictMotion(landmarks[8], timestamp);
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
        this.primaryWrist = null;
        this.lastTrackingTime = null;
        this.gestureData.gesture = null;
        this.gestureData.candidate = null;
        this.gestureData.confidence = 0;
        this.gestureData.handCount = 0;
        this.gestureData.expansionFactor = 1;
        this.gestureData.motion = { energy: 0, shape: null };
    }
}
