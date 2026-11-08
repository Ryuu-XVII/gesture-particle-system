import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AIService } from '../src/ai-service.js';
import { MotionAnalyzer } from '../src/motion-analyzer.js';
import * as geometry from '../src/hand-geometry.js';
import { PoseFilter } from '../src/pose-filter.js';
import { makeHand, transformHand } from './helpers/hand-fixtures.js';

// Inject hardware adapters while exercising the actual source methods.
function loadClass(file, name, dependencies = {}) {
    let source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/export class /g, 'class ');
    if (name === 'App') source = source.replace(/window.addEventListener\('DOMContentLoaded'.*\);/, '');
    dependencies = { ...geometry, PoseFilter, ...dependencies };
    return new Function(...Object.keys(dependencies), `${source}\nreturn ${name};`)(...Object.values(dependencies));
}
const hand = x => transformHand(makeHand(), { scale: 0.1, x, y: 0.2 });

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

test('landmark angles recognize the four intended poses', () => {
    const ai = new AIService();
    for (const [expected, features] of Object.entries(ai.referenceGestures)) {
        assert.equal(ai.classify(makeHand(features)), expected);
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
    assert.equal(vision.motionAnalyzer.previous.time, 10);
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
    assert.equal(vision.aiService.pointer, null);
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

test('pose matching tolerates scale, roll, yaw and mirrored hands', () => {
    const ai = new AIService();
    for (const [name, features] of Object.entries(ai.referenceGestures)) {
        for (const scale of [0.025, 0.1, 0.3]) {
            for (const mirror of [-1, 1]) {
                const points = transformHand(makeHand(features), { scale, mirror, roll: 1.2, yaw: 0.65, x: 0.5, y: 0.6 });
                assert.equal(ai.classify(points), name, `${name} at scale ${scale}, mirror ${mirror}`);
            }
        }
    }
});

test('invalid and degenerate landmarks do not issue commands', () => {
    const ai = new AIService();
    const bad = makeHand();
    bad[8].x = NaN;
    assert.equal(ai.classify(bad), null);
    assert.equal(ai.classify(Array.from({length:21},()=>({x:0,y:0,z:0}))), null);
    const analyzer = new MotionAnalyzer();
    assert.equal(analyzer.analyze([bad], 0).shape, null);
});

test('gesture confirmation is time-based and resists isolated misdetections', () => {
    const ai = new AIService();
    const peace = makeHand(ai.referenceGestures.Peace);
    const point = makeHand(ai.referenceGestures.Point);
    assert.equal(ai.update(peace, 0).gesture, null);
    assert.equal(ai.update(peace, 50).gesture, null);
    assert.equal(ai.update(peace, 100).gesture, 'Peace');
    assert.equal(ai.update(point, 130).gesture, 'Peace');
    assert.equal(ai.update(peace, 160).gesture, 'Peace');
    ai.update(point, 190);
    assert.equal(ai.update(point, 290).gesture, 'Point');
    assert.equal(ai.update(peace, 600).gesture, null); // Long gaps need confirmation again.
});

test('sustained ambiguity releases a confirmed pose', () => {
    const filter = new PoseFilter();
    filter.update('Peace', 0);
    assert.equal(filter.update('Peace', 100), 'Peace');
    assert.equal(filter.update(null, 130), 'Peace');
    assert.equal(filter.update(null, 240), 'Peace');
    assert.equal(filter.update(null, 260), null);
});

test('curling produces intermediate openness rather than a binary jump', () => {
    const ai = new AIService();
    const open = makeHand();
    const closed = makeHand([0,0,0,0,0]);
    const midway = open.map((point,i) => ({
        x:(point.x+closed[i].x)/2, y:(point.y+closed[i].y)/2, z:(point.z+closed[i].z)/2
    }));
    const openness = ai.classifyDetailed(midway).openness;
    assert.ok(openness > 0.15 && openness < 0.85, `openness ${openness}`);
    assert.ok(ai.classifyDetailed(open).openness > openness);
    assert.ok(ai.classifyDetailed(closed).openness < openness);
});

test('pointer smoothing is time-based and follows deliberate movement', () => {
    const ai = new AIService();
    assert.deepEqual(ai.predictMotion({x:0,y:0},0), {x:0,y:0});
    const first = ai.predictMotion({x:0.3,y:0.3},30);
    assert.ok(first.x > 0 && first.x < 0.3);
    const settled = ai.predictMotion({x:0.3,y:0.3},60);
    assert.ok(settled.x > first.x && settled.x < 0.3);
    // A resumed stream must not interpolate from a stale pointer.
    assert.deepEqual(ai.predictMotion({x:0.8,y:0.9},1000), {x:0.8,y:0.9});
});

test('two-hand order swaps do not create false motion energy', () => {
    const analyzer = new MotionAnalyzer();
    const a = transformHand(makeHand(), {scale:0.1,x:0.2,y:0.3});
    const b = transformHand(makeHand(), {scale:0.1,x:0.7,y:0.3});
    analyzer.analyze([a,b], 0);
    const motion = analyzer.analyze([b,a], 33);
    assert.equal(motion.speed, 0);
    assert.equal(motion.energy, 0);
});

test('motion speed scales with palm size rather than camera distance', () => {
    function run(scale) {
        const analyzer = new MotionAnalyzer();
        analyzer.analyze([transformHand(makeHand(),{scale})],0);
        return analyzer.analyze([transformHand(makeHand(),{scale,x:scale * 0.2})],100).speed;
    }
    assert.ok(Math.abs(run(0.05) - run(0.2)) < 1e-10);
});

function starHands(scale = 0.1) {
    const left = transformHand(makeHand(), {scale,x:0.3,y:0.3});
    const right = transformHand(makeHand(), {scale,x:0.3+scale*2,y:0.3});
    right[8] = {...left[8], x:left[8].x + scale*0.1};
    return [left,right];
}

test('two-hand contact thresholds scale with hands and require a held pose', () => {
    for (const scale of [0.025, 0.1, 0.2]) {
        const analyzer = new MotionAnalyzer();
        const hands = starHands(scale);
        assert.equal(analyzer.analyze(hands,0).shape, null);
        assert.equal(analyzer.analyze(hands,60).shape, null);
        assert.equal(analyzer.analyze(hands,130).shape, 'STAR_HANDS');
    }
});

test('a stationary primary hand stays in control when detection order changes', () => {
    const { vision } = makeVision();
    const left = transformHand(makeHand([0,1,0,0,0]),{scale:0.1,x:0.2,y:0.3});
    const right = transformHand(makeHand(),{scale:0.1,x:0.7,y:0.3});
    vision.processGestures([left,right],0);
    vision.processGestures([left,right],100);
    const pointer = {...vision.gestureData.pointer};
    vision.processGestures([right,left],133);
    assert.deepEqual(vision.gestureData.pointer,pointer);
    assert.equal(vision.gestureData.gesture,'Point');
});

test('world landmarks drive pose classification while image landmarks drive pointing', () => {
    const { vision } = makeVision();
    const image = transformHand(makeHand(),{scale:0.1,x:0.4,y:0.2});
    const world = makeHand([0,1,1,0,0]);
    vision.processGestures([image],0,[world]);
    vision.processGestures([image],100,[world]);
    assert.equal(vision.gestureData.gesture,'Peace');
    assert.deepEqual(vision.gestureData.pointer, {x:image[8].x,y:image[8].y});
});

test('camera-frame stalls release stale commands', () => {
    const { vision } = makeVision();
    vision.isReady = true;
    vision.handLandmarker = {detectForVideo:()=>({landmarks:[hand(0)]})};
    vision.detect(10);
    vision.gestureData.gesture = 'Point';
    vision.detect(400); // Same video frame; no fresh tracking data.
    assert.equal(vision.gestureData.gesture,null);
    assert.equal(vision.gestureData.handCount,0);
});

test('Motion mode uses separate entry/exit thresholds to avoid flicker', () => {
    const Reality = loadClass('reality-service.js','RealityService',generators);
    const reality = new Reality();
    reality.generate({energy:0.81});
    assert.equal(reality.currentMode,'CHAOS');
    reality.generate({energy:0.7});
    assert.equal(reality.currentMode,'CHAOS');
    reality.generate({energy:0.5});
    assert.equal(reality.currentMode,'FLUID');
    reality.generate({energy:0.7});
    assert.equal(reality.currentMode,'FLUID');
});

test('heart topology follows palm direction rather than screen-up', () => {
    const a = makeHand(), b = transformHand(makeHand(),{x:2});
    a[4] = {x:0.95,y:1.4,z:0}; b[4] = {x:1.05,y:1.4,z:0};
    a[8] = {x:0.95,y:2,z:0}; b[8] = {x:1.05,y:2,z:0};
    for (const roll of [0, Math.PI/2, Math.PI]) {
        const hands = [a,b].map(hand => transformHand(hand,{scale:0.1,roll}));
        assert.equal(new MotionAnalyzer().detectShape(hands),'HEART_HANDS');
    }
});

test('flower needs open hands rather than only close wrists', () => {
    const open = [
        transformHand(makeHand(),{scale:0.1,roll:1.2}),
        transformHand(makeHand(),{scale:0.1,roll:-1.2,x:0.04})
    ];
    const analyzer = new MotionAnalyzer();
    assert.equal(analyzer.detectShape(open),'FLOWER_HANDS');
    const closed = [
        transformHand(makeHand([0,0,0,0,0]),{scale:0.1,roll:1.2}),
        transformHand(makeHand([0,0,0,0,0]),{scale:0.1,roll:-1.2,x:0.04})
    ];
    assert.notEqual(analyzer.detectShape(closed),'FLOWER_HANDS');
});

test('vision uses continuous curl expansion while pointing preserves size', () => {
    const { vision } = makeVision();
    const closed = transformHand(makeHand([0,0,0,0,0]),{scale:0.1});
    const open = transformHand(makeHand(),{scale:0.1});
    const halfway = open.map((point,i)=>({x:(point.x+closed[i].x)/2,y:(point.y+closed[i].y)/2,z:(point.z+closed[i].z)/2}));
    vision.processGestures([halfway],0);
    const size = vision.gestureData.expansionFactor;
    assert.ok(size > 0.15 && size < 0.85);
    const point = transformHand(makeHand([0,1,0,0,0]),{scale:0.1});
    vision.processGestures([point],100);
    vision.processGestures([point],200);
    assert.equal(vision.gestureData.gesture,'Point');
    assert.equal(vision.gestureData.expansionFactor,size);
});
