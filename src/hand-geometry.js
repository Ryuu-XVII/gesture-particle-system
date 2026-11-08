export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
export const distance2D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function validHand(hand) {
    return Array.isArray(hand) && hand.length === 21 && hand.every(point =>
        point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
        (point.z === undefined || Number.isFinite(point.z)));
}

export function palmSize(hand) {
    return (distance(hand[0], hand[9]) + distance(hand[5], hand[17])) / 2;
}

function jointAngle(a, b, c) {
    const ab = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
    const cb = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
    const length = Math.hypot(...ab) * Math.hypot(...cb);
    if (length < 1e-12) return 0;
    return Math.acos(clamp(ab.reduce((sum, value, i) => sum + value * cb[i], 0) / length, -1, 1));
}

// Continuous openness combines finger straightness and reach, without relying on
// the fingers pointing up or on a fixed distance from the camera.
export function fingerFeatures(hand) {
    const scale = palmSize(hand);
    if (scale < 1e-6) return [0, 0, 0, 0, 0];
    const thumbBend = Math.min(jointAngle(hand[1], hand[2], hand[3]), jointAngle(hand[2], hand[3], hand[4]));
    const thumbStraight = clamp((thumbBend - 1.25) / 1.45);
    const thumbSpread = clamp((distance(hand[4], hand[5]) / scale - 0.35) / 0.65);
    const features = [0.6 * thumbStraight + 0.4 * thumbSpread];
    for (const mcp of [5, 9, 13, 17]) {
        const bend = Math.min(jointAngle(hand[mcp], hand[mcp + 1], hand[mcp + 2]), jointAngle(hand[mcp + 1], hand[mcp + 2], hand[mcp + 3]));
        const straight = clamp((bend - 1.25) / 1.45);
        const reach = clamp((distance(hand[0], hand[mcp + 3]) / Math.max(distance(hand[0], hand[mcp]), 1e-6) - 0.9) / 0.7);
        features.push(0.75 * straight + 0.25 * reach);
    }
    return features;
}
