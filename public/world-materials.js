export const SURFACE = {
  plain: 0,
  grass: 1,
  timber: 2,
  brick: 3,
  stone: 4,
  steel: 5,
  fabric: 6,
  water: 7,
  glass: 8,
  roof: 9,
  plaster: 10,
  soil: 11,
  asphalt: 12,
  foliage: 13,
  terrain: 14,
};
const mapped = { wood: 'timber', concrete: 'stone', ceramic: 'stone', metal: 'steel' };
const cache = new WeakMap();
export function surfaceForMesh(m) {
  if (cache.has(m)) return cache.get(m);
  let kind = SURFACE[m.surface || mapped[m.material] || m.material];
  if (kind === undefined) {
    const hex = (m.color || '#808080').slice(1, 7),
      r = parseInt(hex.slice(0, 2), 16) / 255,
      g = parseInt(hex.slice(2, 4), 16) / 255,
      b = parseInt(hex.slice(4, 6), 16) / 255;
    const size = m.size,
      low = m.pos[1] < 0.25 && size[1] <= 1.05;
    if (m.sky || m.device || m.emission || m.opacity < 0.15) kind = SURFACE.plain;
    else if (
      m.terrainFeature === 'river' ||
      m.terrainFeature === 'lake' ||
      m.terrainFeature === 'tributary'
    )
      kind = SURFACE.water;
    else if (m.shape === 'leaf' || m.shape === 'foliage') kind = SURFACE.foliage;
    else if (m.vegetation === 'tree') kind = SURFACE.timber;
    else if (m.shape === 'wool' || m.limb || (m.actor && m.local?.[1] === 0.8))
      kind = SURFACE.fabric;
    else if (m.actor) kind = SURFACE.plain;
    else if (
      m.landscapeGround ||
      (low && Math.max(size[0], size[2]) > 20 && g > r * 1.04 && g > b * 1.1)
    )
      kind = g > r ? SURFACE.grass : SURFACE.soil;
    else if (
      m.terrainFeature === 'mountain' ||
      m.terrainFeature === 'shore-rock' ||
      m.terrainFeature === 'river-bank' ||
      m.terrainFeature === 'foothill'
    )
      kind = SURFACE.terrain;
    else if (low && Math.max(size[0], size[2]) > 8 && r < 0.47 && Math.abs(r - g) < 0.07)
      kind = SURFACE.asphalt;
    else if (m.opacity < 0.85 && b > r && g > r && m.shape === 'box') kind = SURFACE.glass;
    else if (size[1] > 1 && Math.min(size[0], size[2]) < 0.4 && m.shape === 'box')
      kind = r > g * 1.18 && b < g * 0.86 ? SURFACE.brick : SURFACE.plaster;
    else if (r > g * 1.15 && b < g * 0.9 && m.shape === 'box') kind = SURFACE.timber;
    else if (low && size[0] > 1 && size[2] > 1)
      kind = g > r && g > b * 1.18 ? SURFACE.grass : SURFACE.stone;
    else kind = SURFACE.plain;
  }
  cache.set(m, kind);
  return kind;
}

export function prepareWorldMaterials(model) {
  for (const m of model.roofs || []) if (m.size[1] < 0.3 && !m.cutawayFacade) m.surface = 'roof';
  for (const m of model.windows || []) m.surface = 'glass';
  if (model.dynamic?.tankWater) model.dynamic.tankWater.surface = 'water';
  for (const vehicle of model.community?.vehicles || []) vehicle.glass.surface = 'glass';
  model.visualShadows = [{ x: -5.85, z: -6, w: 15.4, d: 11.2, h: 3, opacity: 0.45 }];
  for (const b of model.community?.sim.map.buildings || [])
    if (!['home', 'roads', 'parking'].includes(b.type))
      model.visualShadows.push({
        x: model.community.origin.x + b.x,
        z: b.z,
        w: b.w,
        d: b.d,
        h: b.height || (b.type === 'office' ? 6 : b.type === 'factory' ? 5 : 4),
        opacity: 0.5,
      });
  // The existing greenhouse lets most sunlight through its glazing.
  const greenhouse = model.rooms.find((r) => r[0] === 'Greenhouse');
  if (greenhouse)
    model.visualShadows.push({
      x: greenhouse[1],
      z: greenhouse[2],
      w: 4.6,
      d: 5,
      h: 3,
      opacity: 0.18,
    });
}

export function worldSunlight(state, ephemeris) {
  const useSky = state.skyMode === 'simulated' || state.weatherMode === 'live';
  let direction;
  if (useSky && ephemeris?.sun?.direction) direction = [...ephemeris.sun.direction];
  else {
    const hour = ((state.skyStartHour ?? 12) + (state.simClockMs || 0) / 3600000) % 24;
    const a = ((hour - 6) * Math.PI) / 12;
    direction = [Math.cos(a), Math.sin(a), 0.35];
  }
  const length = Math.hypot(...direction) || 1;
  direction = direction.map((v) => v / length);
  const cloud = Math.min(1, Math.max(0, (state.env.cloud || 0) / 100));
  const elevation = Math.max(0, direction[1]),
    warm = Math.min(1, Math.max(0, (0.5 - elevation) * 1.8));
  return {
    direction,
    strength: (state.env.light < 10 ? 0 : Math.min(1, elevation * 4)) * (1 - cloud * 0.72),
    color: [1, 0.97 - warm * 0.2, 0.9 - warm * 0.37],
  };
}

// These patterns are evaluated in the existing fragment shader; no texture downloads or
// additional scene geometry are needed. Fine detail fades at distance to prevent shimmer.
export const MATERIAL_GLSL = `
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash2(i),hash2(i+vec2(1.0,0.0)),f.x),mix(hash2(i+vec2(0.0,1.0)),hash2(i+vec2(1.0,1.0)),f.x),f.y);
}
vec3 materialColor(vec3 base, vec3 normal) {
  if(uSurface<0.5 || (uSurface>6.5 && uSurface<8.5)) return base;
  vec3 axis=abs(vLocalNormal);
  vec2 uv=axis.y>axis.x && axis.y>axis.z ? vLocal.xz : axis.x>axis.z ? vLocal.zy : vLocal.xy;
  float close=1.0-smoothstep(18.0,65.0,distance(vWorld,uEye));
  float coarse=noise2(vWorld.xz*1.3), grain=close>0.001 ? noise2(uv*34.0) : 0.5;
  if(uSurface>0.5 && uSurface<1.5) {
    float patch=noise2(vWorld.xz*0.24);
    return base*mix(0.88,1.05,patch)*(0.96+0.09*coarse)*(1.0+(grain-0.5)*0.11*close);
  }
  if(uSurface>1.5 && uSurface<2.5) {
    float streak=sin(uv.y*85.0+noise2(uv*vec2(2.2,0.8))*13.0);
    float joint=1.0-smoothstep(0.004,0.018,min(fract(uv.x/0.23),1.0-fract(uv.x/0.23)));
    return base*(0.94+streak*0.055*close)*(1.0-joint*0.17*close);
  }
  if(uSurface>2.5 && uSurface<3.5) {
    float row=floor(uv.y/0.095); vec2 tile=vec2(uv.x/0.29+mod(row,2.0)*0.5,uv.y/0.095);
    vec2 edge=min(fract(tile),1.0-fract(tile));
    float mortar=1.0-smoothstep(0.035,0.075,min(edge.x,edge.y));
    vec3 brick=base*(0.83+hash2(floor(tile))*0.24);
    return mix(base,mix(brick,vec3(0.52,0.51,0.46),mortar*0.64),close);
  }
  if(uSurface>3.5 && uSurface<4.5) return base*(0.9+noise2(uv*4.0)*0.15+(grain-0.5)*0.075*close);
  if(uSurface>4.5 && uSurface<5.5) return base*(0.96+sin(uv.x*140.0)*0.027*close);
  if(uSurface>5.5 && uSurface<6.5) return base*(0.97+sin(uv.x*170.0)*sin(uv.y*170.0)*0.035*close);
  if(uSurface>8.5 && uSurface<9.5) {
    float seam=pow(abs(sin(uv.y*13.0)),16.0);
    return base*(0.94+noise2(uv*3.0)*0.08-seam*0.18*close);
  }
  if(uSurface>9.5 && uSurface<10.5) return base*(0.97+(grain-0.5)*0.055*close);
  if(uSurface>10.5 && uSurface<11.5) return base*(0.78+coarse*0.25+(grain-0.5)*0.16*close);
  if(uSurface>11.5 && uSurface<12.5) return base*(0.91+noise2(vWorld.xz*40.0)*0.16*close+coarse*0.05);
  if(uSurface>13.5) {
    float strata=sin(vWorld.y*0.8+noise2(vWorld.xz*0.17)*4.0);
    vec3 exposed=mix(base,vec3(dot(base,vec3(0.3,0.4,0.3))),0.22*(1.0-normal.y));
    return exposed*(0.93+strata*0.055+(grain-0.5)*0.1*close);
  }
  if(uSurface>12.5) return base*(0.91+noise2(uv*12.0)*0.14);
  return base;
}
float groundShadow(vec3 n) {
  if(vWorld.y>0.42 || n.y<0.5 || uSun.y<0.08) return 0.0;
  float shadow=0.0;
  for(int i=0;i<12;i++) {
    vec4 b=uShadowBoxes[i]; vec4 info=uShadowInfo[i];
    vec2 p=vWorld.xz-b.xy;
    // Cutaway interiors remain readable; only cast onto the surrounding ground.
    if(info.y>0.0 && (abs(p.x)>b.z || abs(p.y)>b.w)) {
      vec2 ray=uSun.xz*(info.x-vWorld.y)/max(0.18,uSun.y);
      float t=clamp(dot(-p,ray)/max(0.001,dot(ray,ray)),0.0,1.0);
      float dist=length(max(abs(p+ray*t)-b.zw,vec2(0.0)));
      shadow=max(shadow,(1.0-smoothstep(0.05,0.28+info.x*0.045,dist))*info.y);
    }
  }
  return shadow*uSunStrength;
}
vec3 filmic(vec3 x) { return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
`;
