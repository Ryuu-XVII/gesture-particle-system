# Gesture Particles

A browser-based Three.js experience with 25,000 particles, MediaPipe hand tracking, procedural motion effects, and optional voice commands.

## Run locally

Install Node.js 20 or later, then run:

```sh
npm run dev
```

Open http://127.0.0.1:8080. On Windows, `./start-server.ps1` starts the same server. No npm dependencies need installing: version-pinned Three.js and MediaPipe modules load through the import map in `index.html`.

Use localhost for development or HTTPS when hosting. Allow camera access for hand tracking. If permission is denied or tracking fails, shape buttons and the color picker continue working. Camera permission is requested at startup; microphone permission is requested only after clicking the voice button.

## Controls

- Select Heart, Star, Fireworks, Flower, or Saturn with the buttons.
- Curl or open your fingers to resize smoothly; a fist collapses the shape. Point and Peace preserve the current size.
- Hold Point briefly to move the particles; hold Peace to change colors. Basic poses take about 90 ms to confirm, and two-hand shapes take about 120 ms.
- In Motion Mode, touch index fingertips for a star, thumbs and index fingertips for a heart, or bring wrists together for a flower. Fast movement creates a chaotic cloud; slower movement produces a gentle flowing cloud. Separate entry and exit thresholds keep noisy movement from rapidly switching effects. Expansion and pointing also work here.
- Enable voice and say a shape name, or “motion magic” to select Motion Mode. Browser speech-recognition support varies. The button indicates when recognition has actually started.

## Architecture and dependencies

`main.js` coordinates rendering and controls. `vision.js` runs MediaPipe once per new video frame. `ai-service.js` matches continuous 3D finger-bend and reach features with JavaScript; `pose-filter.js` confirms poses over elapsed time. `motion-analyzer.js` measures palm-relative speed, matches hands between frames, and detects held two-hand poses. `scene.js` renders particles, and `reality-service.js` reuses typed buffers for procedural effects.

Hand tracking uses a pretrained MediaPipe model. Gesture classification and motion effects use rules and procedural geometry, rather than a separately trained generative model.

The app requires internet access to load Three.js 0.160.0, MediaPipe Tasks Vision 0.10.9, its WASM runtime, and the hand-landmarker model. It is not currently an offline bundle. Voice recognition may use a browser-provided remote service; it is not guaranteed to run locally. Webcam frames are passed to MediaPipe in the browser; this app has no frame-upload endpoint.

## Validation

```sh
npm test
```

Regression tests cover pose geometry, scale/rotation/mirror invariance, ambiguity and temporal filtering, continuous openness, smoothing, hand-order changes, frame stalls, motion timing, camera failure, voice lifecycle, buffer reuse, and expansion in both rendering modes. Geometry tests use synthetic landmarks rather than a recorded hand dataset. Hardware-dependent camera, microphone, and GPU behavior still requires a browser smoke test.

## Gesture assistance

The recognizer prefers MediaPipe world landmarks for consistent 3D geometry, falling back to image landmarks when needed. Finger angles and palm-relative distances are designed to handle changes in orientation and camera distance. Ambiguous poses do not start a new command. Brief uncertainty holds the last confirmed pose for up to 120 ms; absent or invalid hands clear controls immediately, and stalled frames clear them after 250 ms.

Pointer smoothing adapts to movement speed: steadier when resting, quicker during deliberate motion. The primary controller follows the closest wrist across detections. Two-hand motion matching handles a reversal in detection order, and contact thresholds scale with palm size. These heuristics can still be confused by occlusion or crossing hands.

The header shows contextual hints and the current gesture's **fit score**. This is similarity to hand-written pose references, not a calibrated probability or a newly trained model. Thresholds still need testing with real users, lighting conditions, and cameras.
