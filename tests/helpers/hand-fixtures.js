// Anatomically ordered synthetic landmarks: straight or curled phalanges.
export function makeHand(features = [1, 1, 1, 1, 1]) {
    const points = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    points[1] = { x: -0.3, y: 0.15, z: 0 };
    points[2] = { x: -0.6, y: 0.4, z: 0 };
    points[3] = features[0] ? { x: -0.9, y: 0.65, z: 0 } : { x: -0.2, y: 0.65, z: 0.2 };
    points[4] = features[0] ? { x: -1.2, y: 0.9, z: 0 } : { x: 0.15, y: 0.55, z: 0.2 };
    const bases = [[-0.45, 1], [0, 1.1], [0.4, 1], [0.75, 0.85]];
    [5, 9, 13, 17].forEach((mcp, i) => {
        const [x, y] = bases[i];
        points[mcp] = { x, y, z: 0 };
        points[mcp + 1] = { x, y: y + 0.45, z: 0 };
        points[mcp + 2] = features[i + 1] ? { x, y: y + 0.9, z: 0 } : { x, y: y + 0.25, z: 0.28 };
        points[mcp + 3] = features[i + 1] ? { x, y: y + 1.2, z: 0 } : { x, y: y - 0.05, z: 0.25 };
    });
    return points;
}

export function transformHand(hand, { scale = 1, x = 0, y = 0, z = 0, roll = 0, yaw = 0, mirror = 1 } = {}) {
    return hand.map(point => {
        const px = point.x * mirror;
        const rx = px * Math.cos(roll) - point.y * Math.sin(roll);
        const ry = px * Math.sin(roll) + point.y * Math.cos(roll);
        return {
            x: (rx * Math.cos(yaw) + point.z * Math.sin(yaw)) * scale + x,
            y: ry * scale + y,
            z: (-rx * Math.sin(yaw) + point.z * Math.cos(yaw)) * scale + z
        };
    });
}
