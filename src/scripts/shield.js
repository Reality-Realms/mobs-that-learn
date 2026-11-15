// Counter to sword spam: Shield Zombies raise a shield that blocks hits from the front.
// The shield rhythm (up ~2-3 s, down ~1 s) rewards timing; hitting from behind always works;
// enough blocked hits (axes count triple) shatter the shield.
// Each Shield Zombie also learns during the fight: punish its lowered shield and it keeps the
// shield down for less time; hit it around the shield and it learns to turn and face you.
import { world, system } from '@minecraft/server';
import { heldItem } from './tricks.js';
import * as fx from './fx.js';

const SHIELD_HP = 8;
const state = new Map(); // entity id -> shield state
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// Newer game versions let us cancel a hit before it lands, so the direction of every single
// attacker is checked (fair in multiplayer). Older versions fall back to a damage_sensor switch
// aimed at the nearest player.
const HURT_BEFORE = (() => { try { return world.beforeEvents.entityHurt; } catch { return undefined; } })();
let directional = false;

function setProp(e, k, v) { try { if (e.getProperty(k) !== v) e.setProperty(k, v); } catch { /* ignore */ } }
function S(z, now) {
  let s = state.get(z.id);
  if (!s) {
    let has = true;
    try { has = z.getProperty('mtl:shield') !== false; } catch { /* ignore */ }
    s = { e: z, up: false, until: now + 10, hp: SHIELD_HP, stagger: 0, has, immune: false, timing: 0, turn: 0 };
    state.set(z.id, s);
  }
  return s;
}
function setImmune(s, v) { s.immune = v; setProp(s.e, 'mtl:immune', v); }

function inFront(z, p) {
  const v = z.getViewDirection();
  const dx = p.location.x - z.location.x, dz = p.location.z - z.location.z;
  const len = Math.hypot(dx, dz) || 1, vl = Math.hypot(v.x, v.z) || 1;
  return (v.x * dx + v.z * dz) / (len * vl) > 0.3;   // within ~72 degrees of where it is looking
}
// Turn towards p by at most `step` degrees (circling quickly still gets you behind it).
function face(z, p, step = 180) {
  const dx = p.location.x - z.location.x, dz = p.location.z - z.location.z;
  try {
    const want = (Math.atan2(-dx, dz) * 180) / Math.PI, cur = z.getRotation().y;
    const diff = ((want - cur + 540) % 360) - 180;
    z.setRotation({ x: 0, y: cur + Math.max(-step, Math.min(step, diff)) });
  } catch { /* ignore */ }
}

// Called every few ticks with the nearest target player (or undefined).
export function updateShield(z, p, now) {
  const s = S(z, now);
  if (!s.has) {
    if (s.stagger && now >= s.stagger) { s.stagger = 0; setProp(z, 'mtl:pose', 0); }
    return;
  }
  const dist = p ? Math.hypot(p.location.x - z.location.x, p.location.y - z.location.y, p.location.z - z.location.z) : Infinity;
  if (dist > 12) {
    s.up = false;
    setImmune(s, false);
    setProp(z, 'mtl:pose', 0);
    return;
  }
  if (now >= s.until && !s.bashing) {
    // The more often you punished its lowered shield, the shorter it lowers it.
    if (s.up) { s.up = false; s.until = now + Math.max(8, rand(18, 30) - s.timing * 5); }
    else { raise(s, now); }
  }
  let front = inFront(z, p);
  // A zombie that learned to turn keeps its shield pointed at you.
  if (s.up && !front && s.turn > 0 && dist < 6) { face(z, p, 35); front = inFront(z, p); }
  setImmune(s, !directional && s.up && front);
  if (s.up) {
    // Shield-walking: slower while guarding, like holding a shield up.
    try { z.addEffect('slowness', 10, { amplifier: 0, showParticles: false }); } catch { /* ignore */ }
    if (!s.bashing && front && dist < 2.4 && now >= (s.nextBash ?? 0)) bash(s, p, now);
    else if (!s.bashing && dist > 2.6 && dist < 7 && now >= (s.nextStrafe ?? 0)) strafe(s, p, now);
  }
  setProp(z, 'mtl:pose', s.bashing ? 5 : s.up ? 3 : 0);
}

// Shove forward with the shield: knocks you back and hurts a little.
function bash(s, p, now) {
  s.bashing = true;
  s.nextBash = now + rand(50, 85);
  setProp(s.e, 'mtl:pose', 5);
  fx.later(4, () => {
    const z = s.e;
    if (!z.isValid || !p.isValid || !s.has) return;
    const dx = p.location.x - z.location.x, dz = p.location.z - z.location.z, len = Math.hypot(dx, dz) || 1;
    if (len > 2.9 || Math.abs(p.location.y - z.location.y) > 1.5) return;
    try { p.applyDamage(2, { cause: 'entityAttack', damagingEntity: z }); } catch { /* ignore */ }
    try { p.applyKnockback({ x: (dx / len) * 1.1, z: (dz / len) * 1.1 }, 0.3); } catch { /* ignore */ }
    const at = shieldPoint(z);
    fx.sound(z.dimension, 'mtl.shield.bash', at, 1, 0.9 + Math.random() * 0.2);
    fx.particle(z.dimension, 'mtl:chips_small', at);
  });
  fx.later(11, () => { s.bashing = false; });
}

// Side-step around the player instead of walking straight into their sword.
function strafe(s, p, now) {
  const z = s.e;
  s.nextStrafe = now + rand(18, 40);
  if (Math.random() < 0.35) s.side = -(s.side ?? 1);
  s.side ??= Math.random() < 0.5 ? 1 : -1;
  if (!z.isOnGround) return;
  const dx = p.location.x - z.location.x, dz = p.location.z - z.location.z, len = Math.hypot(dx, dz) || 1;
  try { z.applyImpulse({ x: (-dz / len) * 0.32 * s.side, y: 0, z: (dx / len) * 0.32 * s.side }); } catch { /* ignore */ }
}

function raise(s, now) {
  s.up = true;
  s.until = now + rand(40, 75);
  setProp(s.e, 'mtl:pose', 3);
  fx.sound(s.e.dimension, 'mtl.shield.raise', s.e.location, 0.8, 0.9 + Math.random() * 0.2);
}

function shieldPoint(z) {
  const v = z.getViewDirection(), l = z.location, len = Math.hypot(v.x, v.z) || 1;
  return { x: l.x + (v.x / len) * 0.55, y: l.y + 1.2, z: l.z + (v.z / len) * 0.55 };
}

function block(s, attacker, isAxe) {
  const z = s.e, now = system.currentTick;
  if (!z.isValid || !s.has) return;
  const dim = z.dimension, at = shieldPoint(z);
  s.hp -= isAxe ? 3 : 1;
  try { z.setProperty('mtl:hits', ((z.getProperty('mtl:hits') ?? 0) + 1) % 8); } catch { /* ignore */ }
  fx.sound(dim, 'mtl.shield.block', at, 1, 0.9 + Math.random() * 0.2);
  fx.particle(dim, 'mtl:shield_sparks', at);
  fx.particle(dim, 'mtl:chips_small', at);
  if (attacker?.typeId === 'minecraft:player' && attacker.isValid) {
    const dx = attacker.location.x - z.location.x, dz = attacker.location.z - z.location.z, len = Math.hypot(dx, dz) || 1;
    try { attacker.applyKnockback({ x: (dx / len) * 0.55, z: (dz / len) * 0.55 }, 0.12); } catch { /* ignore */ }
  }
  if (s.hp > 0) { s.until = Math.max(s.until, now + 20); return; }
  // The shield shatters: the zombie staggers and fights on without it.
  s.has = false;
  s.up = false;
  setImmune(s, false);
  setProp(z, 'mtl:shield', false);
  setProp(z, 'mtl:pose', 4);
  s.stagger = now + 50;
  fx.sound(dim, 'mtl.shield.break', at, 1.2, 1);
  fx.particle(dim, 'mtl:chips_big', at);
  try { z.addEffect('slowness', 50, { amplifier: 3, showParticles: false }); } catch { /* ignore */ }
  if (attacker?.typeId === 'minecraft:player') fx.actionbar(attacker, '§eYou shattered its shield!');
}

function isAxeHolder(a) {
  if (a?.typeId !== 'minecraft:player') return false;
  const item = heldItem(a);
  return !!item && item.typeId.endsWith('_axe');
}

if (HURT_BEFORE) {
  try {
    HURT_BEFORE.subscribe((e) => {
      const z = e.hurtEntity;
      if (z.typeId !== 'mtl:shield_zombie') return;
      const s = state.get(z.id);
      if (!s || !s.up || !s.has) return;
      const src = e.damageSource;
      if (src.cause !== 'entityAttack' && src.cause !== 'projectile') return;
      const a = src.damagingEntity;
      if (!a || !inFront(z, a)) return;
      e.cancel = true;
      const axe = src.cause === 'entityAttack' && isAxeHolder(a);
      system.run(() => block(s, a, axe));
    });
    directional = true;
  } catch { directional = false; }
}

if (!directional) {
  // Melee hits against a raised shield.
  world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: a, hitEntity: z }) => {
    if (z?.typeId !== 'mtl:shield_zombie') return;
    const s = state.get(z.id);
    if (s?.immune) block(s, a, isAxeHolder(a));
  });
  // Arrows and other projectiles bounce off too.
  world.afterEvents.projectileHitEntity.subscribe((e) => {
    const z = e.getEntityHit()?.entity;
    if (z?.typeId !== 'mtl:shield_zombie') return;
    const s = state.get(z.id);
    if (s?.immune) block(s, e.source, false);
  });
}

// A hit that gets through teaches it something.
world.afterEvents.entityHurt.subscribe(({ hurtEntity: z, damage, damageSource }) => {
  if (z.typeId !== 'mtl:shield_zombie' || damage <= 0) return;
  const s = state.get(z.id);
  if (!s || !s.has || s.stagger) return;
  const a = damageSource?.damagingEntity;
  if (s.up) {
    // Hit around the shield: it learns to turn towards you.
    if (a?.isValid) {
      if (!s.turn) { s.turn = 1; fx.particle(z.dimension, 'mtl:study', fx.head(z, 2.3)); }
      face(z, a, 70);
    }
    return;
  }
  // Hit while the shield was down: it learns your timing and snaps the shield back up.
  if (s.timing < 3) { s.timing++; fx.particle(z.dimension, 'mtl:study', fx.head(z, 2.3)); }
  fx.later(Math.max(2, 6 - s.timing), () => { if (z.isValid && s.has && !s.up) raise(s, system.currentTick); });
});

system.runInterval(() => {
  for (const [id, s] of state) if (!s.e.isValid) state.delete(id);
}, 100);
