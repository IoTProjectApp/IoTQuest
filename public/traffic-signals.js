// Each incoming lane gets a kerbside head facing upstream, on its own driving side.
export function buildTrafficSignals({ sim, box }) {
  const signals = [];
  for (const junction of sim.map.junctions.filter((j) => j.signal)) {
    const incoming = Object.values(sim.map.roads.nodes).filter((n) =>
      n.id.endsWith('>' + junction.id + ':in'),
    );
    for (const lane of incoming) {
      const axis = Math.abs(lane.x - junction.x) > 10 ? 'EW' : 'NS';
      const facing =
        axis === 'EW' ? [Math.sign(lane.x - junction.x), 0] : [0, Math.sign(lane.z - junction.z)];
      const kerb = junction.farmAccess && axis === 'EW' ? 3.8 : 6.8;
      const x = axis === 'EW' ? lane.x : junction.x + Math.sign(lane.x - junction.x) * kerb;
      const z = axis === 'NS' ? lane.z : junction.z + Math.sign(lane.z - junction.z) * kerb;
      const yaw = Math.atan2(facing[0], facing[1]);
      const extra = { trafficSignal: junction.id, incomingLane: lane.id, surface: 'steel' };
      const pole = box(x, 1.7, z, 0.13, 3.4, 0.13, '#637474', extra);
      const housing = box(x, 3.3, z, 0.65, 1.55, 0.34, '#29383c', {
        ...extra,
        rotation: [0, yaw, 0],
      });
      const head = { junction: junction.id, incomingLane: lane.id, axis, facing, pole, housing };
      for (const [name, y, color] of [
        ['red', 3.74, '#702e2c'],
        ['amber', 3.3, '#76531e'],
        ['green', 2.86, '#285c3c'],
      ]) {
        head[name] = box(x + facing[0] * 0.23, y, z + facing[1] * 0.23, 0.3, 0.07, 0.3, color, {
          ...extra,
          shape: 'cylinder',
          surface: 'plain',
          emission: 0,
          rotation: [Math.PI / 2, yaw, 0],
        });
        box(x + facing[0] * 0.27, y + 0.19, z + facing[1] * 0.27, 0.42, 0.055, 0.3, '#29383c', {
          ...extra,
          rotation: [0, yaw, 0],
        });
      }
      // A bumper stops before the pedestrian crossing, in its own lane.
      box(
        lane.x - facing[0] * 2,
        0.17,
        lane.z - facing[1] * 2,
        axis === 'EW' ? 0.15 : 4,
        0.025,
        axis === 'NS' ? 0.15 : 4,
        '#eee9db',
        { surface: 'plain', trafficStopLine: lane.id },
      );
      signals.push(head);
    }
  }
  return signals;
}

export function trafficAspect(phase, axis, next) {
  const green = phase === axis;
  const amber = phase === 'AMBER' && axis !== next;
  return { green, amber, red: !green && !amber };
}
