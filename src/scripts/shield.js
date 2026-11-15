// Counter to sword spam: Shield Zombies raise a shield that blocks hits from the front.
// The shield rhythm (up ~2-3 s, down ~1 s) rewards timing; hitting from behind always works;
// enough blocked hits (axes count triple) shatter the shield.
import { world, system } from '@minecraft/server';
import { heldItem } from './tricks.js';
import * as fx from './fx.js';

const SHIELD_HP = 8;
const state = new Map(); // entity id -> shield state
const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function setProp(e, k, v) { try { if (e.getProperty(k) !== v) e.setProperty(k, v); } catch { /* ignore */ } }
function S(z, now) {
  let s = state.get(z.id);
  if (!s) {
    let has = true;
    try { has = z.getProperty('mtl:shield') !== false; } catch { /* ignore */ }
    s = { e: z, up: false, until: now + 10, hp: SHIELD_HP, stagger: 0, has, immune: false };
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
  if (now >= s.until) {
    if (s.up) { s.up = false; s.until = now + rand(18, 30); }
    else { raise(s, now); }
  }
  setImmune(s, s.up && inFront(z, p));
  setProp(z, 'mtl:pose', s.up ? 3 : 0);
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
  const z = s.e, now = system.currentTick, dim = z.dimension, at = shieldPoint(z);
  s.hp -= isAxe ? 3 : 1;
  try { z.setProperty('mtl:hits', ((z.getProperty('mtl:hits') ?? 0) + 1) % 8); } catch { /* ignore */ }
  fx.sound(dim, 'mtl.shield.block', at, 1, 0.9 + Math.random() * 0.2);
  fx.particle(dim, 'mtl:shield_sparks', at);
  fx.particle(dim, 'mtl:chips_small', at);
  if (attacker?.typeId === 'minecraft:player') {
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

// Melee hits against a raised shield.
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: a, hitEntity: z }) => {
  if (z?.typeId !== 'mtl:shield_zombie') return;
  const s = state.get(z.id);
  if (!s || !s.immune) return;
  const item = a?.typeId === 'minecraft:player' ? heldItem(a) : undefined;
  block(s, a, !!item && item.typeId.endsWith('_axe'));
});
// Arrows and other projectiles bounce off too.
world.afterEvents.projectileHitEntity.subscribe((e) => {
  const z = e.getEntityHit()?.entity;
  if (z?.typeId !== 'mtl:shield_zombie') return;
  const s = state.get(z.id);
  if (s?.immune) block(s, e.source, false);
});
// A hit that gets through makes it snap the shield back up.
world.afterEvents.entityHurt.subscribe(({ hurtEntity: z, damage }) => {
  if (z.typeId !== 'mtl:shield_zombie' || damage <= 0) return;
  const s = state.get(z.id);
  if (s && s.has && !s.up && !s.stagger) fx.later(5, () => { if (z.isValid && s.has && !s.up) raise(s, system.currentTick); });
});

system.runInterval(() => {
  for (const [id, s] of state) if (!s.e.isValid) state.delete(id);
}, 100);
