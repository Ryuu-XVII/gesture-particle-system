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
- Open your hand to expand; make a fist to collapse.
- Point to move the particles; use a peace sign to change colors.
- In Motion Mode, touch index fingertips for a star, thumbs and index fingertips for a heart, or bring wrists together for a flower. Fast movement creates a chaotic cloud; slower movement produces a gentle flowing cloud. Expansion and pointing also work here.
- Enable voice and say a shape name, or “motion magic” to select Motion Mode. Browser speech-recognition support varies. The button indicates when recognition has actually started.

## Architecture and dependencies

`main.js` coordinates rendering and controls. `vision.js` runs MediaPipe once per new video frame. `ai-service.js` classifies five finger features with JavaScript; `motion-analyzer.js` measures time-based motion and two-hand poses. `scene.js` renders particles, and `reality-service.js` reuses typed buffers for procedural effects.

Hand tracking uses a pretrained MediaPipe model. Gesture classification and motion effects use rules and procedural geometry, rather than a separately trained generative model.

The app requires internet access to load Three.js 0.160.0, MediaPipe Tasks Vision 0.10.9, its WASM runtime, and the hand-landmarker model. It is not currently an offline bundle. Voice recognition may use a browser-provided remote service; it is not guaranteed to run locally. Webcam frames are passed to MediaPipe in the browser; this app has no frame-upload endpoint.

## Validation

```sh
npm test
```

Regression tests cover matching, motion timing, duplicate camera frames, startup failure, voice lifecycle, buffer reuse, and expansion in both rendering modes. Hardware-dependent camera, microphone, and GPU behavior still requires a browser smoke test.
