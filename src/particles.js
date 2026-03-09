import * as THREE from 'three';

export const PARTICLE_COUNT = 25000;

function randomPointInSphere(radius) {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = Math.cbrt(Math.random()) * radius;
  const sinPhi = Math.sin(phi);
  return new THREE.Vector3(
    r * sinPhi * Math.cos(theta),
    r * sinPhi * Math.sin(theta),
    r * Math.cos(phi)
  );
}

// Heart Shape
export function getHeartPoints(count = PARTICLE_COUNT) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = Math.random() * Math.PI * 2;
    // Heart parametric equation
    // 16sin^3(t)
    // 13cos(t) - 5cos(2t) - 2cos(3t) - cos(4t)
    // Spread them out a bit with randomness
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const z = (Math.random() - 0.5) * 5; // Thickness

    // Add some random noise inside the volume
    const p = new THREE.Vector3(x, y, z).multiplyScalar(0.7); // Scale down
    p.add(randomPointInSphere(0.5)); // jitter
    points.push(p);
  }
  return points;
}

// Star Shape
export function getStarPoints(count = PARTICLE_COUNT) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * Math.PI;
    const r = 10 * Math.pow(Math.sin(u * 2.5) * Math.sin(v * 2.5), 2) + (Math.random() * 2);

    const x = r * Math.sin(v) * Math.cos(u);
    const y = r * Math.sin(v) * Math.sin(u);
    const z = (Math.random() - 0.5) * 2;

    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

// Fireworks (Sphere burst)
export function getFireworksPoints(count = PARTICLE_COUNT) {
  const points = [];
  for (let i = 0; i < count; i++) {
    points.push(randomPointInSphere(15));
  }
  return points;
}

// Flower
export function getFlowerPoints(count = PARTICLE_COUNT) {
  const points = [];
  for (let i = 0; i < count; i++) {
    // Rose curve/Rhodonea
    const k = 4; // number of petals
    const theta = Math.random() * Math.PI * 2;
    const rBase = 15 * Math.cos(k * theta);
    const r = rBase + (Math.random() - 0.5) * 2;

    const x = r * Math.cos(theta);
    const y = r * Math.sin(theta);
    const z = (Math.sin(rBase) * 5) + (Math.random() - 0.5); // some depth curve

    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

// Saturn
export function getSaturnPoints(count = PARTICLE_COUNT) {
  const points = [];
  const ringCount = Math.floor(count * 0.7);
  const sphereCount = count - ringCount;

  // Planet
  for (let i = 0; i < sphereCount; i++) {
    points.push(randomPointInSphere(6));
  }

  // Ring
  for (let i = 0; i < ringCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const innerRadius = 9;
    const outerRadius = 18;
    const r = innerRadius + Math.random() * (outerRadius - innerRadius);
    const x = r * Math.cos(theta);
    const z = r * Math.sin(theta);
    const y = (Math.random() - 0.5) * 0.5; // Thin ring

    // Tilt the ring
    const v = new THREE.Vector3(x, y, z);
    v.applyAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 6); // 30 deg tilt
    points.push(v);
  }
  return points;
}
