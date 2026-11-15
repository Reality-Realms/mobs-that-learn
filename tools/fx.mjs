// Particles, chat/title glyphs and the pack icon - all drawn procedurally.
import { Canvas, hex, shade, clamp } from './lib/png.mjs';

export const PARTICLE_TEX = 'textures/particle/mtl_particles';

// ------------------------------------------------------------------------------------------------
// Particle sheet (64x64)
// ------------------------------------------------------------------------------------------------
function drawEye(cv, ox, oy, size, iris = '#b06cff') {
  const c = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (x + 0.5 - c) / (c * 0.95), dy = (y + 0.5 - c) / (c * 0.55);
    const lid = Math.abs(dy) + dx * dx * 0.95;
    if (lid > 1) continue;
    const r = Math.hypot((x + 0.5 - c) / c, (y + 0.5 - c) / c);
    let col = lid > 0.78 ? hex('#1a0f24') : hex('#f2e9ff');
    if (r < 0.42 && lid <= 0.78) col = hex(iris);
    if (r < 0.18) col = hex('#12081c');
    if (r < 0.1 && x < c && y < c) col = hex('#ffffff');
    cv.set(ox + x, oy + y, col);
  }
}
function drawBang(cv, ox, oy, size, col = '#ff3b5c') {
  const w = Math.max(2, Math.round(size * 0.25)), x0 = ox + Math.round(size / 2 - w / 2);
  cv.rect(x0, oy + 1, w, Math.round(size * 0.6), hex(col));
  cv.rect(x0, oy + Math.round(size * 0.75), w, w, hex(col));
}

export function particleSheet() {
  const cv = new Canvas(64, 64);
  drawEye(cv, 0, 0, 16);
  { const t = new Canvas(16, 16); drawBang(t, 0, 0, 16); t.outline(hex('#2a0610')); cv.draw(t, 16, 0); }
  cv.radial(36, 4, 4, (d) => [255, 255, 255, Math.round(255 * (1 - d) ** 1.4)]);                     // spark
  for (let i = 0; i < 6; i++) { cv.set(41 + i, 6 - Math.floor(i / 2), hex(i % 2 ? '#8a5a2e' : '#b07a44')); cv.set(41 + i, 7 - Math.floor(i / 2), hex('#6b4423')); } // splinter
  cv.radial(56, 8, 7.5, (d) => (d > 0.72 ? [255, 255, 255, Math.round(255 * (1 - Math.abs(d - 0.86) / 0.14))] : null)); // ring
  cv.radial(36, 12, 4, (d) => [190, 120, 255, Math.round(255 * (1 - d) ** 1.2)]);                    // purple mote
  return cv;
}

function effect(id, material, components) {
  return {
    format_version: '1.10.0',
    particle_effect: { description: { identifier: `mtl:${id}`, basic_render_parameters: { material, texture: PARTICLE_TEX } }, components },
  };
}
const uv = (u, v, w, h) => ({ texture_width: 64, texture_height: 64, uv: [u, v], uv_size: [w, h] });
const once = (t = 0.1) => ({ 'minecraft:emitter_lifetime_once': { active_time: t } });
const burst = (n) => ({ 'minecraft:emitter_rate_instant': { num_particles: n } });
const fade = 'math.clamp((1 - v.particle_age / v.particle_lifetime) * 3, 0, 1)';

export function particles() {
  const P = {};
  // A watching eye that opens above a mob's head and drifts up.
  P.watch = effect('watch', 'particles_alpha', {
    ...burst(1), ...once(),
    'minecraft:emitter_shape_point': {},
    'minecraft:particle_lifetime_expression': { max_lifetime: 1.4 },
    'minecraft:particle_initial_speed': 0.35,
    'minecraft:particle_motion_dynamic': { linear_drag_coefficient: 1.2 },
    'minecraft:particle_appearance_billboard': {
      size: ['0.32', '0.32 * math.clamp(math.sin(math.min(v.particle_age / 0.25, 1) * 90), 0.05, 1) * (v.particle_age > 1.15 ? math.max(0.05, (1.4 - v.particle_age) * 4) : 1)'],
      facing_camera_mode: 'rotate_xyz', uv: uv(0, 0, 16, 16),
    },
  });
  // A red "!" that pops above each mob when it learns something.
  P.alert = effect('alert', 'particles_alpha', {
    ...burst(1), ...once(),
    'minecraft:emitter_shape_point': {},
    'minecraft:particle_lifetime_expression': { max_lifetime: 1.6 },
    'minecraft:particle_initial_speed': 0.6,
    'minecraft:particle_motion_dynamic': { linear_drag_coefficient: 3 },
    'minecraft:particle_appearance_billboard': {
      size: ['0.42 * (v.particle_age < 0.15 ? v.particle_age / 0.15 * 1.4 : (v.particle_age < 0.3 ? 1.4 - (v.particle_age - 0.15) / 0.15 * 0.4 : 1))', '0.42 * (v.particle_age < 0.15 ? v.particle_age / 0.15 * 1.4 : (v.particle_age < 0.3 ? 1.4 - (v.particle_age - 0.15) / 0.15 * 0.4 : 1))'],
      facing_camera_mode: 'rotate_xyz', uv: uv(16, 0, 16, 16),
    },
  });
  // Purple sparks bursting out of a mob's head.
  P.brain_burst = effect('brain_burst', 'particles_add', {
    ...burst(18), ...once(),
    'minecraft:emitter_shape_sphere': { radius: 0.2, direction: 'outwards' },
    'minecraft:particle_lifetime_expression': { max_lifetime: '0.6 + v.particle_random_1 * 0.5' },
    'minecraft:particle_initial_speed': 'math.random(2.5, 5)',
    'minecraft:particle_motion_dynamic': { linear_acceleration: [0, 1.5, 0], linear_drag_coefficient: 4 },
    'minecraft:particle_appearance_billboard': { size: ['0.09 * ' + fade, '0.09 * ' + fade], facing_camera_mode: 'lookat_xyz', uv: uv(32, 0, 8, 8) },
    'minecraft:particle_appearance_tinting': { color: [0.72, 0.42, 1, 1] },
  });
  // Shock-wave of light around the player at the learning moment.
  P.learn_wave = effect('learn_wave', 'particles_add', {
    ...burst(64), ...once(),
    'minecraft:emitter_shape_disc': { radius: 0.6, plane_normal: 'y', direction: 'outwards' },
    'minecraft:particle_lifetime_expression': { max_lifetime: '0.9 + v.particle_random_1 * 0.4' },
    'minecraft:particle_initial_speed': 'math.random(7, 11)',
    'minecraft:particle_motion_dynamic': { linear_acceleration: [0, 0.6, 0], linear_drag_coefficient: 3.2 },
    'minecraft:particle_appearance_billboard': { size: ['0.14 * ' + fade, '0.14 * ' + fade], facing_camera_mode: 'lookat_xyz', uv: uv(32, 8, 8, 8) },
    'minecraft:particle_appearance_tinting': { color: ['0.6 + v.particle_random_2 * 0.3', 0.35, 1, 1] },
  });
  // Purple motes drifting up while the mobs "study" you (progress hint).
  P.study = effect('study', 'particles_add', {
    ...burst(6), ...once(),
    'minecraft:emitter_shape_sphere': { radius: 0.35, direction: [0, 1, 0] },
    'minecraft:particle_lifetime_expression': { max_lifetime: '0.9 + v.particle_random_1 * 0.6' },
    'minecraft:particle_initial_speed': 'math.random(0.3, 0.8)',
    'minecraft:particle_motion_dynamic': { linear_drag_coefficient: 0.6 },
    'minecraft:particle_appearance_billboard': { size: ['0.07 * ' + fade, '0.07 * ' + fade], facing_camera_mode: 'lookat_xyz', uv: uv(32, 8, 8, 8) },
  });
  // Shield block: hot sparks + a few wood chips.
  P.shield_sparks = effect('shield_sparks', 'particles_add', {
    ...burst(10), ...once(),
    'minecraft:emitter_shape_sphere': { radius: 0.1, direction: 'outwards' },
    'minecraft:particle_lifetime_expression': { max_lifetime: '0.25 + v.particle_random_1 * 0.25' },
    'minecraft:particle_initial_speed': 'math.random(3, 6)',
    'minecraft:particle_motion_dynamic': { linear_acceleration: [0, -12, 0], linear_drag_coefficient: 2 },
    'minecraft:particle_appearance_billboard': { size: ['0.06 * ' + fade, '0.06 * ' + fade], facing_camera_mode: 'lookat_xyz', uv: uv(32, 0, 8, 8) },
    'minecraft:particle_appearance_tinting': { color: [1, '0.8 + v.particle_random_2 * 0.2', 0.45, 1] },
  });
  const chips = (id, n, speed) => effect(id, 'particles_alpha', {
    ...burst(n), ...once(),
    'minecraft:emitter_shape_sphere': { radius: 0.25, direction: 'outwards' },
    'minecraft:particle_lifetime_expression': { max_lifetime: '1 + v.particle_random_1 * 0.8' },
    'minecraft:particle_initial_speed': `math.random(${speed[0]}, ${speed[1]})`,
    'minecraft:particle_initial_spin': { rotation: 'math.random(0, 360)', rotation_rate: 'math.random(-720, 720)' },
    'minecraft:particle_motion_dynamic': { linear_acceleration: [0, -16, 0], linear_drag_coefficient: 0.6 },
    'minecraft:particle_motion_collision': { enabled: 1, collision_drag: 6, coefficient_of_restitution: 0.25, collision_radius: 0.04 },
    'minecraft:particle_appearance_billboard': { size: [0.09, 0.09], facing_camera_mode: 'lookat_xyz', uv: uv(40, 0, 8, 8) },
    'minecraft:particle_appearance_lighting': {},
  });
  P.chips_small = chips('chips_small', 5, [1.5, 3]);
  P.chips_big = chips('chips_big', 26, [2.5, 5.5]);
  P.ladder_dust = chips('ladder_dust', 4, [0.6, 1.4]);
  return P;
}

// ------------------------------------------------------------------------------------------------
// Font glyphs: font/glyph_E9.png -> U+E900.. (16x16 cells on a 256x256 sheet)
// ------------------------------------------------------------------------------------------------
export const GLYPHS = { warn: '', brain: '', eye: '' };
function drawBrain(cv, ox, oy, s) {
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const dx = (x + 0.5 - s / 2) / (s * 0.48), dy = (y + 0.5 - s * 0.47) / (s * 0.4);
    if (dx * dx + dy * dy > 1) continue;
    let c = hex('#d58cff');
    const fold = Math.sin(x * 1.3 + Math.sin(y * 0.9) * 2) + Math.cos(y * 1.5 + x * 0.3);
    if (fold > 1.25) c = hex('#8e3fd6');
    if (Math.abs(x + 0.5 - s / 2) < 0.6 && y > 1) c = hex('#6a2aa8');
    cv.set(ox + x, oy + y, c);
  }
}
export function glyphSheet() {
  const cv = new Canvas(256, 256);
  // E900: warning triangle
  {
    const t = new Canvas(16, 16);
    for (let y = 1; y < 15; y++) {
      const half = (y - 1) * 0.5 + 0.5;
      for (let x = 0; x < 16; x++) if (Math.abs(x + 0.5 - 8) <= half) t.set(x, y, hex(y > 12 ? '#c81e3c' : '#ff3b5c'));
    }
    t.rect(7, 5, 2, 5, hex('#1a0610')); t.rect(7, 11, 2, 2, hex('#1a0610'));
    cv.draw(t, 0, 0);
  }
  { const t = new Canvas(16, 16); drawBrain(t, 0, 1, 15); t.outline(hex('#2b0f45')); cv.draw(t, 16, 0); }
  { const t = new Canvas(16, 16); drawEye(t, 0, 0, 16); cv.draw(t, 32, 0); }
  return cv;
}

// ------------------------------------------------------------------------------------------------
// Pack icon: a learner's head with glowing seams on a purple aura
// ------------------------------------------------------------------------------------------------
export function packIcon(skin) {
  const cv = new Canvas(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const d = Math.hypot(x - 128, y - 120) / 180;
    cv.set(x, y, [clamp(Math.round(40 + 70 * (1 - d))), clamp(Math.round(14 + 20 * (1 - d))), clamp(Math.round(60 + 110 * (1 - d))), 255]);
  }
  // face (north face of the head = skin pixels 16..32, 16..32) scaled x10
  const F = 10, ox = 48, oy = 44;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = skin.get(16 + x, 16 + y);
    cv.rect(ox + x * F, oy + y * F, F, F, c);
  }
  // glowing eyes + brow seam
  for (const ex of [2, 11]) cv.radial(ox + (ex + 1.5) * F, oy + 7.5 * F, 26, (d) => [200, 140, 255, Math.round(160 * (1 - d) ** 2)]);
  for (const ex of [2, 11]) cv.rect(ox + ex * F, oy + 7 * F, 3 * F, F, hex('#e2c4ff'));
  // brain seams on the top edge
  for (let x = 0; x < 160; x++) {
    const y = oy + 8 + Math.round(Math.sin(x * 0.11) * 4 + Math.sin(x * 0.37) * 2);
    for (let k = -2; k <= 2; k++) cv.blend(ox + x, y + k, [190, 110, 255, k === 0 ? 255 : 150]);
  }
  // shadow outline
  for (let i = 0; i < 4; i++) {
    cv.blendRect(ox - 4 + i, oy - 4 + i, 168 - 2 * i, 4 - i, [0, 0, 0, 40]);
  }
  // warning badge bottom-right
  const g = glyphSheet();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = g.get(x, y);
    if (c[3]) cv.rect(176 + x * 4, 180 + y * 4, 4, 4, c);
  }
  return cv;
}
