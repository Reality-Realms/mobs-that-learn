// "Learner" mobs: zombies that have adapted to a player's tricks.
// One shared humanoid model (128x160 HD texture) with optional gear bones:
//   pack   - bundle of ladders strapped to the back (Ladder Zombie)
//   held   - the ladder it slams against walls while climbing
//   shield - plank shield on the left arm (Shield Zombie)
//   glow_* - glowing eyes and brain seams (additive material)
import { Canvas, hex, shade, rng, clamp } from './lib/png.mjs';

const S = 2;          // texture pixels per model unit
export const TEX_W = 128, TEX_H = 160;

// ------------------------------------------------------------------------------------------------
// Geometry
// ------------------------------------------------------------------------------------------------
function boxUV(u, v, w, h, d) {
  const f = (x, y, sw, sh) => ({ uv: [x * S, y * S], uv_size: [sw * S, sh * S] });
  return {
    up: f(u + d, v, w, d), down: f(u + d + w, v + d, w, -d),
    west: f(u, v + d, d, h), north: f(u + d, v + d, w, h), east: f(u + d + w, v + d, d, h), south: f(u + 2 * d + w, v + d, w, h),
  };
}
const flat = (u, v, w, h) => {
  const f = { uv: [u * S, v * S], uv_size: [w * S, h * S] };
  return { north: f, south: f, east: f, west: f, up: f, down: f };
};

// extra texture regions (64-space units, below the 64x64 skin)
const UV = {
  ladder: [0, 64],      // 6 x 14 x 1 box
  shield: [16, 64],     // 10 x 13 x 1 box
  boss: [40, 64],       // 2 x 2 x 1 box
  eye: [48, 64],        // 2x2 glow patch
  brain: [52, 64],      // 8x8 glow seams (top of head)
  black: [61, 64],      // 2x2 black (invisible when additive)
};

const BODY = [
  ['body', [-4, 12, -2], [8, 12, 4], [16, 16]], ['body', [-4, 12, -2], [8, 12, 4], [16, 32], 0.3],
  ['head', [-4, 24, -4], [8, 8, 8], [0, 0]], ['head', [-4, 24, -4], [8, 8, 8], [32, 0], 0.45],
  ['rightarm', [-8, 12, -2], [4, 12, 4], [40, 16]], ['rightarm', [-8, 12, -2], [4, 12, 4], [40, 32], 0.3],
  ['leftarm', [4, 12, -2], [4, 12, 4], [32, 48]], ['leftarm', [4, 12, -2], [4, 12, 4], [48, 48], 0.3],
  ['rightleg', [-3.9, 0, -2], [4, 12, 4], [0, 16]], ['rightleg', [-3.9, 0, -2], [4, 12, 4], [0, 32], 0.3],
  ['leftleg', [-0.1, 0, -2], [4, 12, 4], [16, 48]], ['leftleg', [-0.1, 0, -2], [4, 12, 4], [0, 48], 0.3],
];

export function learnerGeometry(id) {
  const ladder = (origin, rotation, pivot) => {
    const c = { origin, size: [6, 14, 1], uv: boxUV(...UV.ladder, 6, 14, 1) };
    if (rotation) { c.rotation = rotation; c.pivot = pivot; }
    return c;
  };
  const bones = [
    { name: 'root', pivot: [0, 0, 0] },
    { name: 'body', parent: 'root', pivot: [0, 24, 0], cubes: [] },
    { name: 'head', parent: 'body', pivot: [0, 24, 0], cubes: [] },
    {
      name: 'glow_head', parent: 'head', pivot: [0, 24, 0],
      cubes: [
        { origin: [-3, 27.5, -4.06], size: [2, 1, 0], uv: flat(...UV.eye, 2, 2) },
        { origin: [1, 27.5, -4.06], size: [2, 1, 0], uv: flat(...UV.eye, 2, 2) },
        {
          origin: [-4, 32.06, -4], size: [8, 0, 8],
          uv: { up: { uv: [UV.brain[0] * S, UV.brain[1] * S], uv_size: [16, 16] }, down: { uv: [UV.black[0] * S, UV.black[1] * S], uv_size: [2, 2] } },
        },
      ],
    },
    { name: 'rightarm', parent: 'body', pivot: [-5, 22, 0], cubes: [] },
    { name: 'leftarm', parent: 'body', pivot: [5, 22, 0], cubes: [] },
    { name: 'rightleg', parent: 'root', pivot: [-1.9, 12, 0], cubes: [] },
    { name: 'leftleg', parent: 'root', pivot: [1.9, 12, 0], cubes: [] },
    // Ladder Zombie gear
    { name: 'pack', parent: 'body', pivot: [0, 18, 2], cubes: [ladder([-5.5, 10, 2.3], [0, 0, 7], [-2.5, 17, 2.8]), ladder([-0.5, 11, 3.4], [0, 0, -9], [2.5, 18, 3.9])] },
    { name: 'held', parent: 'rightarm', pivot: [-6, 12, 0], cubes: [ladder([-9, -1, -0.5])] },
    // Shield Zombie gear
    {
      name: 'shield', parent: 'leftarm', pivot: [6, 13, 0],
      cubes: [
        { origin: [1, 6, -3.2], size: [10, 13, 1], uv: boxUV(...UV.shield, 10, 13, 1) },
        { origin: [5, 11.5, -4.0], size: [2, 2, 1], uv: boxUV(...UV.boss, 2, 2, 1) },
      ],
    },
  ];
  const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
  for (const [bone, origin, size, uv, inflate] of BODY) {
    const c = { origin, size, uv: boxUV(uv[0], uv[1], ...size) };
    if (inflate) c.inflate = inflate;
    byName[bone].cubes.push(c);
  }
  return {
    format_version: '1.16.0',
    'minecraft:geometry': [{
      description: { identifier: id, texture_width: TEX_W, texture_height: TEX_H, visible_bounds_width: 3, visible_bounds_height: 3.5, visible_bounds_offset: [0, 1.5, 0] },
      bones,
    }],
  };
}

// ------------------------------------------------------------------------------------------------
// Skins (procedural, original)
// ------------------------------------------------------------------------------------------------
const hash = (x, y, k) => { const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return s - Math.floor(s); };
function mix(a, b, t) { return [0, 1, 2].map((i) => clamp(Math.round(a[i] * (1 - t) + b[i] * t))).concat(255); }

function painter(cv) {
  return (u, v, w, h, d, fn) => {
    const faces = {
      up: [u + d, v, w, d], down: [u + d + w, v, w, d],
      west: [u, v + d, d, h], north: [u + d, v + d, w, h], east: [u + d + w, v + d, d, h], south: [u + 2 * d + w, v + d, w, h],
    };
    for (const [face, [fx, fy, fw, fh]] of Object.entries(faces)) {
      for (let y = 0; y < fh * S; y++) for (let x = 0; x < fw * S; x++) {
        const c = fn(face, x, y, fw * S, fh * S);
        if (c) cv.set(fx * S + x, fy * S + y, c);
      }
    }
  };
}

const KINDS = {
  climber: { tone: '#8a9a78', hair: '#3b2c20', shirt: '#7b5a35', pants: '#3f4650', strap: '#2a1d14', accent: '#c9a227' },
  shield: { tone: '#86947f', hair: '#1f1b18', shirt: '#4a4f5c', pants: '#2e2a26', strap: '#5a3a1e', accent: '#8a3fd1' },
};

export function learnerSkin(kind) {
  const K = KINDS[kind];
  const R = rng(kind === 'climber' ? 4242 : 7373);
  const cv = new Canvas(TEX_W, TEX_H);
  const paint = painter(cv);
  const tone = hex(K.tone);
  const noise = (c, a = 0.12) => shade(c, 1 + (R() - 0.5) * a);
  const skin = (x, y, k = 0) => {
    let c = noise(tone);
    const blot = hash(Math.floor(x / 3), Math.floor(y / 3), k);
    if (blot > 0.87) c = shade(mix(c, hex('#6f6a8c'), 0.35), 0.92);   // bruise (purple-ish: the "learning" taint)
    else if (blot < 0.07) c = shade(mix(c, hex('#5f7048'), 0.4), 0.95);
    if (hash(x, Math.floor(y / 2), k + 3) > 0.985) c = shade(c, 0.72);
    return c;
  };
  const cloth = (base, x, y, k) => {
    let c = noise(hex(base), 0.08);
    if (y % 2 === 0) c = shade(c, 0.96);
    if (hash(Math.floor(x / 2), Math.floor(y / 2), k + 50) > 0.82) c = shade(mix(c, hex('#3d3226'), 0.45), 0.88);
    return c;
  };
  const tear = (x, y, k) => hash(Math.floor(x / 5), Math.floor(y / 4), k + 90) > 0.84 && hash(x, y, k) > 0.3;
  const seam = hex('#3b1f52');

  // HEAD: stitched skull with purple seams where the "brain" has grown
  const brainSeam = (x, y) => {
    // jagged branching lines across the top of the head (16x16 face pixels)
    const a = Math.abs(y - (7 + Math.round(Math.sin(x * 0.9) * 1.5))) < 1;
    const b = Math.abs(x - (5 + Math.round(Math.sin(y * 1.1) * 1.2))) < 1 && y < 8;
    const c = Math.abs(x - (11 + Math.round(Math.cos(y * 0.8) * 1.2))) < 1 && y > 6;
    return a || b || c;
  };
  paint(0, 0, 8, 8, 8, (face, x, y) => {
    let c = skin(x, y, face.length);
    if (face === 'up') return brainSeam(x, y) ? seam : (hash(Math.floor(x / 2), Math.floor(y / 2), 7) > 0.65 ? noise(hex(K.hair), 0.2) : shade(c, 0.92));
    if (face !== 'down' && y < 2 && hash(Math.floor(x / 2), y, 8) > 0.4) return noise(hex(K.hair), 0.2);
    if (face === 'north') {
      for (const ex of [3, 12]) {
        if (Math.abs(x - ex + 0.5) <= 2.5 && y >= 5 && y <= 9) c = shade(mix(c, hex('#241c2c'), 0.65), 0.9);   // dark sockets
        if (y === 7 && Math.abs(x - ex + 0.5) <= 1.5) c = hex('#b06cff');                                       // eyes (glow layer adds light)
      }
      if (y === 4 && x >= 1 && x <= 14) c = shade(c, 0.75);                         // furrowed brow: thinking hard
      if (y === 3 && (x === 6 || x === 9)) c = shade(c, 0.7);
      if (y === 10 && (x === 7 || x === 8)) c = shade(c, 0.6);
      if (y === 12 && x >= 4 && x <= 11) c = (x % 2) ? hex('#d1c7a4') : hex('#1c1714');  // grimace
      if (y === 13 && x >= 5 && x <= 10) c = hex('#1c1714');
      if (x === 13 && y >= 9 && y <= 14 && y % 2 === 0) c = hex('#2a2421');           // cheek stitches
    }
    if ((face === 'east' || face === 'west') && y === 5 && x > 2 && x < 14 && x % 3 !== 0) c = seam; // temple seams
    return c;
  });
  // head overlay: sparse hair tufts only (front and top stay clear for the glow layer)
  paint(32, 0, 8, 8, 8, (face, x, y) => {
    if (face === 'down' || face === 'north' || face === 'up') return null;
    if (y < 4 && hash(x, Math.floor(y / 2), 21) > 0.5) return noise(hex(K.hair), 0.25);
    return null;
  });

  // BODY + outfit
  paint(16, 16, 8, 12, 4, (face, x, y) => skin(x, y, 31));
  paint(16, 32, 8, 12, 4, (face, x, y, fw, fh) => {
    if (face === 'up' || face === 'down') return null;
    if (tear(x, y, 41) && y > 4) return null;
    let c = cloth(K.shirt, x, y, 41);
    if (kind === 'climber') {
      // two crossed rope straps holding the ladder bundle
      const d1 = Math.abs(x - y * (fw / fh) * 0.9) < 1.6, d2 = Math.abs((fw - 1 - x) - y * (fw / fh) * 0.9) < 1.6;
      if ((face === 'north' || face === 'south') && (d1 || d2)) c = (y % 3 === 0) ? shade(hex(K.strap), 1.3) : noise(hex(K.strap), 0.15);
      if (face === 'north' && y >= 18 && y <= 19) c = noise(hex('#3a2a1a'));     // belt
      if (face === 'north' && y >= 18 && y <= 19 && x >= 7 && x <= 8) c = hex(K.accent);
    } else {
      // padded jerkin with studs and a purple sash
      if ((x + y) % 6 === 0 && y > 2) c = hex('#a7a9ad');
      if (face === 'north' && Math.abs(x - y * 0.6 - 2) < 1.5) c = noise(hex(K.accent), 0.1);
      if (y >= 20) c = noise(hex('#2b2620'));
    }
    if (y === 0 && face === 'north' && x > 4 && x < fw - 5) return null;
    return c;
  });

  // ARMS
  const armBase = (face, x, y, fw, fh) => {
    let c = skin(x, y, 60);
    if (y > fh - 5) c = kind === 'climber' ? noise(hex('#6b4a2a'), 0.1) : shade(c, 0.85); // climber gloves
    if (face === 'down') c = hex('#2e2620');
    return c;
  };
  const sleeve = (face, x, y) => {
    if (face === 'down') return null;
    const len = kind === 'climber' ? 9 : 16;          // climber: rolled-up sleeves
    if (face !== 'up' && y > len) return null;
    if (kind === 'climber' && y >= len - 1) return shade(hex(K.shirt), 0.75);
    if (tear(x, y, 70) && y > 3) return null;
    return cloth(K.shirt, x, y, 70);
  };
  paint(40, 16, 4, 12, 4, armBase); paint(40, 32, 4, 12, 4, sleeve);
  paint(32, 48, 4, 12, 4, armBase); paint(48, 48, 4, 12, 4, (face, x, y, fw, fh) => {
    // shield zombie: purple armband on the shield arm
    if (kind === 'shield' && face !== 'up' && face !== 'down' && y >= 4 && y <= 6) return noise(hex(K.accent), 0.1);
    return sleeve(face, x, y, fw, fh);
  });

  // LEGS
  const legBase = (face, x, y, fw, fh) => {
    if (y > fh - 4 || face === 'down') return noise(hex('#2b2723'), 0.15);
    let c = cloth(K.pants, x, y, 80);
    if (kind === 'climber' && face === 'north' && y > 8 && y < 13) c = shade(c, 0.8);  // knee pads
    return c;
  };
  const legOver = (face, x, y, fw, fh) => {
    if (face === 'up' || face === 'down' || y > fh - 4) return null;
    if (y > 8 && y < 16 && hash(Math.floor(x / 4), Math.floor(y / 4), 93) > 0.72) return skin(x, y, 91);
    return null;
  };
  paint(0, 16, 4, 12, 4, legBase); paint(0, 32, 4, 12, 4, legOver);
  paint(16, 48, 4, 12, 4, legBase); paint(0, 48, 4, 12, 4, legOver);

  // ---- gear ----
  // Ladder: two rails and rungs, transparent gaps (alpha-tested)
  paint(...UV.ladder, 6, 14, 1, (face, x, y, fw, fh) => {
    const wood = (k) => { let c = noise(hex('#9a6b3c'), 0.1); if (hash(x, Math.floor(y / 3), k) > 0.8) c = shade(c, 0.85); return c; };
    if (face !== 'north' && face !== 'south') return shade(wood(5), 0.85);
    const rail = x < 2 || x >= fw - 2;
    const rung = (y % 7 === 3 || y % 7 === 4) && !rail;
    if (rail) return x === 0 || x === fw - 1 ? shade(wood(1), 0.8) : wood(1);
    if (rung) return y % 7 === 4 ? shade(wood(2), 0.78) : wood(2);
    return null;
  });
  // Shield: vertical planks, iron rim, purple eye sigil (the mob's "learning" mark)
  paint(...UV.shield, 10, 13, 1, (face, x, y, fw, fh) => {
    const rim = hex('#7d8186');
    if (face !== 'north' && face !== 'south') return noise(rim, 0.08);
    if (x < 2 || y < 2 || x >= fw - 2 || y >= fh - 2) return (x + y) % 5 === 0 ? hex('#c4c7cc') : noise(rim, 0.08);
    let c = noise(hex(face === 'north' ? '#7a5532' : '#5e4128'), 0.1);
    if (x % 5 === 0) c = shade(c, 0.7);                                // plank seams
    if (hash(x, Math.floor(y / 4), 3) > 0.85) c = shade(c, 0.85);
    if (face === 'north') {
      const cx = fw / 2 - 0.5, cy = fh / 2 - 0.5, dx = (x - cx) / 7, dy = (y - cy) / 4.2;
      const e = dx * dx + dy * dy;
      if (e < 1 && e > 0.55) c = hex('#5b2a8c');                         // eye outline
      if (e < 0.25) c = hex('#c08bff');                                  // pupil
    }
    return c;
  });
  paint(...UV.boss, 2, 2, 1, () => noise(hex('#a3a7ad'), 0.1));
  // glow patches (additive: black = invisible)
  cv.rect(UV.eye[0] * S, UV.eye[1] * S, 4, 4, hex('#c58cff'));
  cv.rect(UV.black[0] * S, UV.black[1] * S, 4, 4, [0, 0, 0, 255]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    cv.set(UV.brain[0] * S + x, UV.brain[1] * S + y, brainSeam(x, y) ? hex('#7e3fd0') : [0, 0, 0, 255]);
  }
  return cv;
}

// ------------------------------------------------------------------------------------------------
// Animation: one procedural rig, Java-mod style, blended by pose weights computed in pre_animation.
//   v.cl climb · v.pl slap ladder · v.gd shield guard (crouched) · v.bs shield bash · v.st stagger
//   v.hitt shield impact · v.at attack swing (wind-up + chop) · v.hurt flinch · v.reach arms up when hunting
// Poses (mtl:pose): 0 normal, 1 climb, 2 slap ladder, 3 guard, 4 stagger, 5 bash
// ------------------------------------------------------------------------------------------------
const lerp = (a, b, t) => `math.lerp(${a}, ${b}, ${t})`;
const ease = (target, rate) => `math.lerp(v.${target[0]} ?? 0, ${target[1]}, math.min(1, q.delta_time * ${rate}))`;
export const LEARNER_PRE = [
  "v.pose = q.property('mtl:pose');",
  `v.cl = ${ease(['cl', 'v.pose == 1 ? 1 : 0'], 10)};`,
  `v.pl = ${ease(['pl', 'v.pose == 2 ? 1 : 0'], 16)};`,
  `v.gd = ${ease(['gd', '(v.pose == 3 || v.pose == 5) ? 1 : 0'], 12)};`,
  `v.bs = ${ease(['bs', 'v.pose == 5 ? 1 : 0'], 20)};`,
  `v.st = ${ease(['st', 'v.pose == 4 ? 1 : 0'], 9)};`,
  `v.reach = ${ease(['reach', 'q.has_target ? 1 : 0'], 4)};`,
  "v.hits = q.property('mtl:hits'); v.hitt = (v.hits != (v.lasthits ?? v.hits)) ? 1 : math.max(0, (v.hitt ?? 0) - q.delta_time * 5); v.lasthits = v.hits;",
  'v.hurt = math.clamp(q.hurt_time / 10, 0, 1);',
  'v.walk = q.modified_distance_moved * 38.17; v.spd = math.min(q.modified_move_speed, 1); v.t = q.life_time; v.br = math.sin(v.t * 100);',
  // attack: wind up over the head (first 35%), then chop down past the start
  'v.at = v.attack_time ?? 0;',
  'v.chop = v.at <= 0 ? 0 : (v.at < 0.35 ? -105 * (v.at / 0.35) : -105 + 150 * ((v.at - 0.35) / 0.65));',
  'v.chopb = v.at <= 0 ? 0 : (v.at < 0.35 ? -6 * (v.at / 0.35) : 14 * math.sin((v.at - 0.35) / 0.65 * 180));',
  // arms
  `v.rax = ${lerp(lerp(lerp(`${lerp('-8 + v.br * 2', '-60 + v.br * 3', 'v.reach')} + math.cos(v.walk) * 24 * v.spd + v.chop`, '-162 + math.sin(v.t * 600) * 26', 'v.cl'), '-158 + math.sin(v.t * 1500) * 5', 'v.pl'), '-25 + math.sin(v.t * 900) * 35', 'v.st')};`,
  `v.lax = ${lerp(lerp(lerp(`${lerp('-8 - v.br * 2', '-54 - v.br * 3', 'v.reach')} - math.cos(v.walk) * 24 * v.spd + (v.kind == 1 ? v.chop * 0.45 : 0)`, '-162 - math.sin(v.t * 600) * 26', 'v.cl'), '-84 + v.hitt * 30 - v.bs * 22', 'v.gd'), '-15 - math.sin(v.t * 800) * 30', 'v.st')};`,
  'v.lay = v.gd * 28 - v.bs * 12;',
];

export function learnerAnimations() {
  const A = {};
  A['animation.mtl.learner.rig'] = {
    loop: true,
    bones: {
      root: {
        position: [
          0,
          'math.abs(math.sin(v.walk * 0.5)) * -0.6 * v.spd * (1 - v.cl) - v.gd * 1.4 - v.hurt * 0.4',
          'v.st * 1.5 - v.bs * 2.5 + v.hurt * 0.8',
        ],
      },
      body: {
        rotation: [
          '4 + v.br * 1.2 + v.reach * 5 + v.cl * 12 + v.pl * 6 + v.gd * 12 + v.bs * 16 - v.st * 20 - v.hitt * 8 - v.hurt * 12 + v.chopb',
          'math.sin(v.walk * 0.5) * 6 * v.spd * (1 - v.cl) - v.gd * 14 + v.st * math.sin(v.t * 500) * 6 + (v.at > 0 ? -16 * math.sin(v.at * 180) : 0)',
          'math.sin(v.walk * 0.5) * 3 * v.spd * (1 - v.cl) + v.cl * math.sin(v.t * 600) * 4',
        ],
      },
      head: {
        rotation: [
          `${lerp('q.target_x_rotation', '-38', 'v.cl')} - v.st * 15 - v.hurt * 14 - v.gd * 8 + math.sin(v.t * 60) * 1.5`,
          'q.target_y_rotation * (1 - v.cl) + v.gd * 12 + v.st * math.sin(v.t * 700) * 12',
          'math.sin(v.t * 45) * 2.5 + v.st * math.cos(v.t * 650) * 10 + v.hurt * 6',
        ],
      },
      rightarm: { rotation: ['v.rax', '-6 + v.pl * 10 + (v.at > 0 ? 12 * math.sin(v.at * 180) : 0)', '4 + v.st * 25 + v.cl * 6'] },
      leftarm: { rotation: ['v.lax', '6 + v.lay', '-4 - v.st * 25 - v.cl * 6'] },
      rightleg: { rotation: [`${lerp('math.cos(v.walk) * 40 * v.spd', '-40 + math.sin(v.t * 600 + 180) * 30', 'v.cl')} - v.gd * 24 - v.bs * 18 + v.st * 12`, '4 + v.gd * 6', '2 + v.gd * 3'] },
      leftleg: { rotation: [`${lerp('math.cos(v.walk + 180) * 40 * v.spd', '-40 + math.sin(v.t * 600) * 30', 'v.cl')} + v.gd * 20 + v.bs * 10 - v.st * 18`, '-4 - v.gd * 6', '-2 - v.gd * 3'] },
      pack: { scale: 'v.kind == 1 ? 1 : 0' },
      held: { rotation: ['20 * v.pl', 0, 0], scale: 'v.kind == 1 ? math.max(0.001, math.clamp(v.pl * 1.6 - 0.2, 0, 1)) : 0' },
      shield: {
        rotation: ['-v.lax * v.gd', '90 * (1 - v.gd) - v.lay', 'v.st * 40'],
        scale: "v.kind == 2 && q.property('mtl:shield') ? 1 : 0",
      },
    },
  };
  return A;
}

// ------------------------------------------------------------------------------------------------
// Entities
// ------------------------------------------------------------------------------------------------
export const LEARNERS = {
  ladder_zombie: {
    kind: 'climber', kindIndex: 1, name: 'Ladder Zombie', hp: 22, speed: 0.24, dmg: 3, kb: 0,
    egg: ['#4f6a3c', '#9a6b3c'], families: ['mtl_climber'], loot: 'ladder_zombie',
  },
  shield_zombie: {
    kind: 'shield', kindIndex: 2, name: 'Shield Zombie', hp: 26, speed: 0.22, dmg: 3, kb: 0.35,
    egg: ['#4f6a3c', '#8a3fd1'], families: ['mtl_shield'], loot: 'shield_zombie', shield: true,
  },
};

export function learnerBehavior(key, m) {
  const sensor = [
    { cause: 'fall', deals_damage: 'yes', damage_multiplier: key === 'ladder_zombie' ? 0.5 : 1 },
  ];
  if (m.shield) {
    // Hits from the front while the shield is raised are blocked (the script keeps mtl:immune updated).
    for (const cause of ['entity_attack', 'projectile']) {
      sensor.unshift({ cause, deals_damage: 'no', on_damage: { filters: { test: 'bool_property', subject: 'self', domain: 'mtl:immune', value: true } } });
    }
  }
  return {
    format_version: '1.21.60',
    'minecraft:entity': {
      description: {
        identifier: `mtl:${key}`, is_spawnable: true, is_summonable: true,
        properties: {
          'mtl:pose': { type: 'int', range: [0, 5], default: 0, client_sync: true },
          'mtl:hits': { type: 'int', range: [0, 7], default: 0, client_sync: true },
          'mtl:shield': { type: 'bool', default: !!m.shield, client_sync: true },
          'mtl:immune': { type: 'bool', default: false },
        },
      },
      component_groups: {
        'mtl:natural': {
          // No filters here: in minecraft:despawn the filters are the despawn condition itself, so a filter that
          // is true right away (like has_nametag == false) makes the mob vanish the moment it spawns.
          'minecraft:despawn': { despawn_from_distance: { min_distance: 54, max_distance: 128 } },
        },
      },
      events: {
        'minecraft:entity_spawned': { add: { component_groups: ['mtl:natural'] } },
      },
      components: {
        'minecraft:type_family': { family: ['zombie', 'undead', 'monster', 'mob', 'mtl_learner', ...m.families] },
        'minecraft:collision_box': { width: 0.6, height: 1.9 },
        'minecraft:health': { value: m.hp, max: m.hp },
        'minecraft:attack': { damage: m.dmg },
        'minecraft:movement': { value: m.speed },
        'minecraft:follow_range': { value: 40, max: 40 },
        'minecraft:navigation.walk': { is_amphibious: true, can_pass_doors: true, can_open_doors: false, avoid_damage_blocks: true, avoid_portals: false, can_walk_in_lava: false },
        'minecraft:movement.basic': {},
        'minecraft:jump.static': {},
        'minecraft:can_climb': {},
        'minecraft:physics': {},
        'minecraft:nameable': {},
        'minecraft:burns_in_daylight': {},
        'minecraft:knockback_resistance': { value: m.kb },
        'minecraft:breathable': { total_supply: 15, suffocate_time: 0, breathes_air: true, breathes_water: false },
        'minecraft:damage_sensor': { triggers: sensor },
        'minecraft:behavior.hurt_by_target': { priority: 1 },
        'minecraft:behavior.nearest_attackable_target': {
          priority: 2, must_see: true, reselect_targets: true, within_radius: 35,
          entity_types: [
            { filters: { test: 'is_family', subject: 'other', value: 'player' }, max_dist: 35 },
            { filters: { test: 'is_family', subject: 'other', value: 'irongolem' }, max_dist: 35 },
            { filters: { all_of: [{ test: 'is_family', subject: 'other', value: 'villager' }, { test: 'is_family', subject: 'other', value: 'baby', operator: '!=' }] }, max_dist: 35 },
          ],
        },
        'minecraft:behavior.melee_attack': { priority: 3, speed_multiplier: 1.0, track_target: true },
        'minecraft:behavior.random_stroll': { priority: 7, speed_multiplier: 1 },
        'minecraft:behavior.look_at_player': { priority: 8, look_distance: 8 },
        'minecraft:behavior.random_look_around': { priority: 9 },
        'minecraft:loot': { table: `loot_tables/mtl/${m.loot}.json` },
        'minecraft:experience_reward': { on_death: 'query.last_hit_by_player ? 8 : 0' },
        'minecraft:conditional_bandwidth_optimization': {},
      },
    },
  };
}

export function learnerClient(key, m) {
  return {
    format_version: '1.10.0',
    'minecraft:client_entity': {
      description: {
        identifier: `mtl:${key}`,
        materials: { default: 'entity_alphatest', glow: 'entity_beam_additive' },
        textures: { default: `textures/entity/mtl/${key}` },
        geometry: { default: 'geometry.mtl.learner' },
        animations: { rig: 'animation.mtl.learner.rig' },
        scripts: {
          initialize: [`v.kind = ${m.kindIndex};`],
          pre_animation: LEARNER_PRE,
          animate: ['rig'],
        },
        render_controllers: ['controller.render.mtl.learner'],
        spawn_egg: { base_color: m.egg[0], overlay_color: m.egg[1] },
      },
    },
  };
}

export const LOOT = {
  ladder_zombie: {
    pools: [
      { rolls: 1, entries: [{ type: 'item', name: 'minecraft:rotten_flesh', weight: 1, functions: [{ function: 'set_count', count: { min: 0, max: 2 } }] }] },
      { rolls: 1, entries: [{ type: 'empty', weight: 4 }, { type: 'item', name: 'minecraft:ladder', weight: 6, functions: [{ function: 'set_count', count: { min: 1, max: 4 } }] }] },
    ],
  },
  shield_zombie: {
    pools: [
      { rolls: 1, entries: [{ type: 'item', name: 'minecraft:rotten_flesh', weight: 1, functions: [{ function: 'set_count', count: { min: 0, max: 2 } }] }] },
      { rolls: 1, entries: [{ type: 'empty', weight: 12 }, { type: 'item', name: 'minecraft:iron_nugget', weight: 6, functions: [{ function: 'set_count', count: { min: 1, max: 3 } }] }, { type: 'item', name: 'minecraft:shield', weight: 1 }] },
    ],
  },
};
