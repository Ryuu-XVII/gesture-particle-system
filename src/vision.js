import { FilesetResolver, HandLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/+esm";
import { AIService } from './ai-service.js';
import { MotionAnalyzer } from './motion-analyzer.js';

export class VisionManager {
    constructor() {
        this.video = document.getElementById('webcam');
        this.handLandmarker = null;
        this.lastVideoTime = -1;
        this.results = undefined;
        this.isReady = false;

        this.aiService = new AIService();
        this.motionAnalyzer = new MotionAnalyzer();

        this.lastGesture = null;

        // Gesture outputs
        this.gestureData = {
            expansionFactor: 1.0,
            gesture: null, // 'Peace', 'Point', 'Five', 'Fist'
            pointer: { x: 0, y: 0 },
            motion: { energy: 0, shape: null }
        };
    }

    async init(statusFn) {
        try {
            await this.aiService.init(statusFn);

            const vision = await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
            );

            this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                    delegate: "GPU"
                },
                runningMode: "VIDEO",
                numHands: 2 // Enable multi-hand for Heart shape
            });

            await this.startWebcam();
            this.isReady = true;
            console.log("Vision Manager Ready");
        } catch (e) {
            console.error("MediaPipe Init Error:", e);
            alert("Failed to initialize webcam or gesture tracking: " + e.message);
        }
    }

    async startWebcam() {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480
            }
        });
        this.video.srcObject = stream;
        return new Promise((resolve) => {
            this.video.onloadeddata = () => {
                this.video.play();
                resolve();
            };
        });
    }

    detect() {
        if (!this.isReady || !this.video) return this.gestureData;

        let nowInMs = Date.now();
        if (this.video.currentTime !== this.lastVideoTime) {
            this.lastVideoTime = this.video.currentTime;
            this.results = this.handLandmarker.detectForVideo(this.video, nowInMs);
        }

        this.processGestures(nowInMs);
        return this.gestureData;
    }

    processGestures(timestamp) {
        if (!this.results || !this.results.landmarks) {
            return;
        }

        // 1. Motion Analysis (Energy / Complex Shapes)
        // Pass ALL landmarks (multi-hand)
        const motion = this.motionAnalyzer.analyze(this.results.landmarks, timestamp);
        this.gestureData.motion = motion;

        // If no hands detected, clear gesture but keep decaying motion?
        if (this.results.landmarks.length === 0) {
            this.gestureData.gesture = null;
            return;
        }

        const landmarks = this.results.landmarks[0]; // Primary hand for basic gestures

        // 2. AI Classification (Basic)
        const gesture = this.aiService.classify(landmarks);
        this.gestureData.gesture = gesture;

        // 3. Expansion Logic
        if (gesture === 'Fist') this.gestureData.expansionFactor = 0.0;
        else if (gesture === 'Five') this.gestureData.expansionFactor = 1.0;

        // 4. Pointer Prediction
        const indexTip = landmarks[8];
        const rawPos = { x: indexTip.x, y: indexTip.y };
        this.gestureData.pointer = this.aiService.predictMotion(rawPos);
    }
}
