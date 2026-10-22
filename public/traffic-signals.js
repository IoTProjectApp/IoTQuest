import { alongRoad } from './street-network.js';
// Each incoming lane gets a kerbside head facing upstream, on its own driving side.
export function buildTrafficSignals({ sim, box }) {
  const signals = [];
  for (const junction of sim.map.junctions.filter((j) => j.signal)) {
    const incoming = Object.values(sim.map.roads.nodes).filter((n) =>
      n.id.endsWith('>' + junction.id + ':in'),
    );
    for (const lane of incoming) {
      // The phase this lane moves in (street-network.js pairs an angled road's arms), and the
      // direction back up it, towards oncoming traffic.
      const axis =
        sim.map.roads.edges[lane.id]?.find((e) => e.junction)?.axis ??
        (Math.abs(lane.x - junction.x) > 10 ? 'EW' : 'NS');
      const from = sim.map.junctions.find((j) => j.id === lane.id.split('>')[0]),
        length = from && Math.hypot(from.x - junction.x, from.z - junction.z),
        // Lanes from driveways rather than junctions face straight up their own axis.
        facing = from
          ? [(from.x - junction.x) / length, (from.z - junction.z) / length]
          : axis === 'EW'
            ? [Math.sign(lane.x - junction.x), 0]
            : [0, Math.sign(lane.z - junction.z)];
      const square = Math.abs(facing[0]) < 1e-9 || Math.abs(facing[1]) < 1e-9;
      const kerb = junction.farmAccess && axis === 'EW' ? 3.8 : 6.8;
      // Beside the stop line, on the lane's own side of the road.
      const normal = [-facing[1], facing[0]],
        side = Math.sign((lane.x - junction.x) * normal[0] + (lane.z - junction.z) * normal[1]),
        along = (lane.x - junction.x) * facing[0] + (lane.z - junction.z) * facing[1];
      const x = !square
        ? junction.x + facing[0] * along + normal[0] * side * kerb
        : Math.abs(facing[1]) < 1e-9
          ? lane.x
          : junction.x + Math.sign(lane.x - junction.x) * kerb;
      const z = !square
        ? junction.z + facing[1] * along + normal[1] * side * kerb
        : Math.abs(facing[0]) < 1e-9
          ? lane.z
          : junction.z + Math.sign(lane.z - junction.z) * kerb;
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
      const line = alongRoad(facing, 0.15, 0.025, 4);
      box(lane.x - facing[0] * 2, 0.17, lane.z - facing[1] * 2, ...line.size, '#eee9db', {
        surface: 'plain',
        trafficStopLine: lane.id,
        rotation: line.rotation,
      });
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
