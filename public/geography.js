export const radians = (d) => (d * Math.PI) / 180;
export function latLonPoint(latitude, longitude, radius = 1.8) {
  const lat = radians(latitude),
    lon = radians(longitude);
  return [
    radius * Math.cos(lat) * Math.sin(lon),
    radius * Math.sin(lat),
    radius * Math.cos(lat) * Math.cos(lon),
  ];
}
export function pointLatLon(p) {
  const r = Math.hypot(...p);
  return {
    latitude: (Math.asin(p[1] / r) * 180) / Math.PI,
    longitude: (Math.atan2(p[0], p[2]) * 180) / Math.PI,
  };
}
function insideRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function countryAt(features, latitude, longitude) {
  return (
    features.find((f) => {
      const polygons =
        f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      return polygons.some(
        (rings) =>
          insideRing(longitude, latitude, rings[0]) &&
          !rings.slice(1).some((r) => insideRing(longitude, latitude, r)),
      );
    }) || null
  );
}
export function globePick(x, y, width, height, yaw, pitch, distance, radius = 1.8) {
  const eye = [
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    ],
    forward = eye.map((v) => -v / distance),
    right = [Math.cos(yaw), 0, -Math.sin(yaw)],
    up = [-Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), -Math.sin(pitch) * Math.cos(yaw)],
    nx = (((x / width) * 2 - 1) * Math.tan(0.65 / 2) * width) / height,
    ny = (1 - (y / height) * 2) * Math.tan(0.65 / 2),
    d = forward.map((v, i) => v + right[i] * nx + up[i] * ny),
    length = Math.hypot(...d),
    dir = d.map((v) => v / length),
    b = eye.reduce((s, v, i) => s + v * dir[i], 0),
    c = distance * distance - radius * radius,
    disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t < 0) return null;
  return pointLatLon(eye.map((v, i) => v + dir[i] * t));
}
export function countryCentre(feature) {
  const polys =
    feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
  const ring = polys.reduce((a, b) => (b[0].length > a.length ? b[0] : a), []);
  return {
    latitude: ring.reduce((s, p) => s + p[1], 0) / ring.length,
    longitude: ring.reduce((s, p) => s + p[0], 0) / ring.length,
  };
}
