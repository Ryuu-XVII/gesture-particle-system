import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AIService } from '../src/ai-service.js';
import { MotionAnalyzer } from '../src/motion-analyzer.js';

// Inject hardware adapters while exercising the actual source methods.
function loadClass(file, name, dependencies = {}) {
    let source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/export class /g, 'class ');
    if (name === 'App') source = source.replace(/window.addEventListener\('DOMContentLoaded'.*\);/, '');
    return new Function(...Object.keys(dependencies), `${source}\nreturn ${name};`)(...Object.values(dependencies));
}
const hand = x => Array.from({ length: 21 }, () => ({ x, y: 0, z: 0 }));

test('all reference poses match exactly, including Peace', () => {
    const ai = new AIService();
    for (const [expected, features] of Object.entries(ai.referenceGestures)) {
        ai.getFeatures = () => features;
        assert.equal(ai.classify(hand(0)), expected);
    }
    ai.getFeatures = () => [0, 0, 1, 0, 0]; // Equally close to Fist and Peace.
    assert.equal(ai.classify(hand(0)), null);
    assert.equal(ai.classify([]), null);
});

test('landmark geometry generates the expected binary finger features', () => {
    const ai = new AIService();
    for (const [expected, features] of Object.entries(ai.referenceGestures)) {
        const points = hand(0);
        [2, 5, 9, 13, 17].forEach(i => { points[i].x = 0.1; });
        [4, 8, 12, 16, 20].forEach((i, f) => { points[i].x = features[f] ? 0.2 : 0.05; });
        assert.equal(ai.classify(points), expected);
    }
});

test('speed uses elapsed time, and lost tracking clears history', () => {
    const speed = interval => {
        const analyzer = new MotionAnalyzer();
        analyzer.analyze([hand(0)], 1000);
        return analyzer.analyze([hand(0.005)], 1000 + interval).speed;
    };
    assert.ok(Math.abs(speed(16) / speed(100) - 6.25) < 1e-10);
    const analyzer = new MotionAnalyzer();
    analyzer.analyze([hand(0)], 0);
    analyzer.analyze([hand(0.5)], 50);
    analyzer.analyze([], 100);
    assert.equal(analyzer.analyze([hand(0.9)], 150).energy, 0);
});

test('equal physical motion has equal energy at different sample rates', () => {
    function energy(fps) {
        const analyzer = new MotionAnalyzer();
        let result;
        for (let i = 0; i <= fps; i++) result = analyzer.analyze([hand(i / fps * 0.5)], i / fps * 1000);
        return result.energy;
    }
    assert.ok(Math.abs(energy(30) - energy(60)) < 1e-10);
});

function makeVision(extra = {}) {
    const video = { readyState: 4, currentTime: 1, srcObject: null, play: async () => {} };
    const Vision = loadClass('vision.js', 'VisionManager', {
        AIService, MotionAnalyzer, document: { getElementById: () => video },
        navigator: {}, FilesetResolver: {}, HandLandmarker: {}, ...extra
    });
    return { vision: new Vision(), video };
}

test('duplicate video frames do not run detection, classification, or motion analysis again', () => {
    const { vision, video } = makeVision();
    let calls = 0;
    vision.isReady = true;
    vision.handLandmarker = { detectForVideo: () => { calls++; return { landmarks: [hand(0)] }; } };
    vision.detect(10);
    vision.detect(20);
    assert.equal(calls, 1);
    assert.equal(vision.motionAnalyzer.history.length, 1);
    video.currentTime = 2;
    vision.detect(30);
    assert.equal(calls, 2);
});

test('losing a hand resets collapse and pointer history', () => {
    const { vision } = makeVision();
    vision.gestureData.expansionFactor = 0;
    vision.aiService.predictMotion({ x: 0, y: 0 });
    vision.processGestures([], 100);
    assert.equal(vision.gestureData.expansionFactor, 1);
    assert.equal(vision.gestureData.gesture, null);
    assert.equal(vision.aiService.history.length, 0);
});

test('GPU initialization falls back to CPU and camera denial propagates', async () => {
    const delegates = [];
    let closed = false;
    const { vision } = makeVision({
        FilesetResolver: { forVisionTasks: async () => ({}) },
        HandLandmarker: { createFromOptions: async (_files, options) => {
            delegates.push(options.baseOptions.delegate);
            if (delegates.length === 1) throw new Error('GPU unavailable');
            return { close() { closed = true; } };
        } },
        navigator: { mediaDevices: { getUserMedia: async () => { throw new Error('Camera denied'); } } }
    });
    await assert.rejects(vision.init(), /Camera denied/);
    assert.deepEqual(delegates, ['GPU', 'CPU']);
    assert.equal(vision.isReady, false);
    assert.equal(closed, true);
});

test('late camera permission after disposal stops the new stream', async () => {
    let grant;
    let stopped = false;
    const { vision } = makeVision({ navigator: { mediaDevices: { getUserMedia: () => new Promise(resolve => { grant = resolve; }) } } });
    const pending = vision.startWebcam();
    vision.dispose();
    grant({ getTracks: () => [{ stop() { stopped = true; } }] });
    await assert.rejects(pending, /cancelled/);
    assert.equal(stopped, true);
});

test('app preserves initialization errors instead of displaying Ready', async () => {
    const App = loadClass('main.js', 'App');
    const app = Object.create(App.prototype);
    const statuses = [];
    app.visionManager = { init: async () => { throw new Error('Camera denied'); } };
    app.uiManager = { setStatus: text => statuses.push(text), updateBackend() {} };
    await app.init();
    assert.ok(statuses.at(-1).includes('Camera denied'));
    assert.ok(!statuses.includes('Ready!'));
});

function makeVoice(supported = true) {
    const timers = [];
    class Recognition {
        starts = 0;
        start() { this.starts++; }
        stop() {}
        abort() {}
    }
    const Voice = loadClass('voice-service.js', 'VoiceService', {
        window: supported ? { SpeechRecognition: Recognition } : {},
        setTimeout: callback => { timers.push(callback); return timers.length; },
        clearTimeout() {}
    });
    return { voice: new Voice(), timers };
}

test('voice becomes listening only on actual start; permission denial does not restart', () => {
    const { voice, timers } = makeVoice();
    const states = [];
    voice.start(() => {}, () => {}, state => states.push(state));
    assert.equal(voice.isListening, false);
    assert.equal(states.at(-1), 'starting');
    voice.recognition.onstart();
    assert.equal(voice.isListening, true);
    voice.recognition.onerror({ error: 'not-allowed' });
    voice.recognition.onend();
    assert.equal(voice.shouldListen, false);
    assert.equal(states.at(-1), 'off');
    assert.equal(timers.length, 0);
});

test('unsupported voice stays off, and substring matches do not trigger commands', () => {
    const { voice } = makeVoice(false);
    assert.equal(voice.start(() => {}, () => {}, () => {}), false);
    const commands = [];
    voice.onCommand = command => commands.push(command);
    voice.processCommand('start hearing something');
    assert.deepEqual(commands, []);
    voice.processCommand('show me a star');
    assert.deepEqual(commands, ['star']);
});

test('voice retries are bounded and stopping cancels a pending restart', () => {
    const { voice, timers } = makeVoice();
    voice.start(() => {}, () => {}, () => {});
    for (let i = 0; i < 4; i++) {
        voice.recognition.onend();
        timers.at(-1)?.();
    }
    assert.equal(voice.shouldListen, false);
    assert.equal(voice.recognition.starts, 4);
    voice.start(() => {}, () => {}, () => {});
    voice.recognition.onend();
    voice.stop();
    const starts = voice.recognition.starts;
    timers.at(-1)();
    assert.equal(voice.recognition.starts, starts);
});

const generators = {
    getHeartPoints: () => [{ x: 1, y: 2, z: 3 }],
    getStarPoints: () => [{ x: 4, y: 5, z: 6 }],
    getFlowerPoints: () => [{ x: 7, y: 8, z: 9 }], PARTICLE_COUNT: 1
};

test('procedural effects reuse buffers across frames and switch cached shapes correctly', () => {
    const Reality = loadClass('reality-service.js', 'RealityService', generators);
    const reality = new Reality();
    const buffer = reality.generate({ energy: 1 });
    assert.equal(reality.generate({ energy: 1 }), buffer);
    assert.equal(reality.generate({ energy: 0 }), buffer);
    reality.generate({ shape: 'HEART_HANDS' });
    assert.deepEqual([...buffer], [1, 2, 3]);
    reality.generate({ shape: 'STAR_HANDS' });
    reality.generate({ shape: 'HEART_HANDS' });
    assert.deepEqual([...buffer], [1, 2, 3]);
});

function sceneStub() {
    const Scene = loadClass('scene.js', 'SceneManager', { PARTICLE_COUNT: 1 });
    const scene = Object.create(Scene.prototype);
    scene.geometry = { attributes: { position: { array: new Float32Array(3) } } };
    scene.expansion = 0.1;
    scene.currentShape = 'reality';
    return scene;
}

test('Reality mode applies expansion to its reused particle buffer', () => {
    const scene = sceneStub();
    scene.lerpParticles(new Float32Array([10, 20, 30]), 1 / 60);
    const positions = scene.geometry.attributes.position.array;
    assert.ok(Math.abs(positions[0] - 0.08) < 1e-6);
    assert.ok(Math.abs(positions[1] - 0.16) < 1e-6);
});

test('particle interpolation has the same result over equal time at 30 and 60 FPS', () => {
    function run(fps) {
        const scene = sceneStub();
        scene.currentShape = 'heart';
        scene.targetPositions = [{ x: 10, y: 20, z: 30 }];
        for (let i = 0; i < fps; i++) scene.lerpParticles(null, 1 / fps);
        return scene.geometry.attributes.position.array;
    }
    const a = run(30), b = run(60);
    a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) < 1e-6));
});
