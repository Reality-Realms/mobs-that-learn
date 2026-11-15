// Detects the player's tricks and feeds them to the Mob Brain.
// Mobs only learn what they actually witness: a trick counts when hostile mobs are around to see it,
// and counts extra when they are close by. They also learn from their own deaths.
import { world, system, EquipmentSlot } from '@minecraft/server';
import { record } from './brain.js';

function hostilesNear(p, radius) {
  try { return p.dimension.getEntities({ location: p.location, maxDistance: radius, families: ['monster'], closest: 1 }).length > 0; } catch { return false; }
}

// --- Pillaring up: jumping and placing a block directly under your own feet ---------------------
// (Bridging also puts blocks under your feet, but you are standing on the ground when you do it.)
const pillarRun = new Map(); // player id -> { n, tick } blocks in the current tower
world.afterEvents.playerPlaceBlock.subscribe(({ player: p, block: b }) => {
  const l = p.location;
  if (Math.floor(l.x) !== b.x || Math.floor(l.z) !== b.z) return;
  const dy = l.y - b.y;
  if (dy <= 0.5 || dy > 2.3 || p.isOnGround) return;
  const now = system.currentTick;
  const run = pillarRun.get(p.id);
  const n = run && now - run.tick < 60 ? run.n + 1 : 1;
  pillarRun.set(p.id, { n, tick: now });
  if (!hostilesNear(p, 24)) return;                   // nobody saw it
  let pts = 1;
  if (hostilesNear(p, 10)) pts += 0.5;                // escaping from a mob right next to you
  if (n >= 3) pts += 0.25;                            // a proper tower, not a single step up
  record(p, 'pillar', pts);
});

// --- Sword spam: landing sword hits on hostile mobs back to back ------------------------------
// A mob ignores hits for 10 ticks after being hurt, so even frantic clicking only lands a hit every
// 10-16 ticks. Hits less than 1 s apart count as spamming.
const SPAM_WINDOW = 20;
const lastHit = new Map();
export function isSword(item) {
  if (!item) return false;
  if (item.typeId.endsWith('_sword')) return true;
  try { return item.hasTag('minecraft:is_sword'); } catch { return false; }
}
export function heldItem(p) {
  try { return p.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Mainhand); } catch { return undefined; }
}
const isMonster = (e) => { try { return e.matches({ families: ['monster'] }); } catch { return false; } };
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: p, hitEntity: target }) => {
  if (p?.typeId !== 'minecraft:player' || !target?.isValid) return;
  if (!isSword(heldItem(p)) || !isMonster(target)) return;
  const now = system.currentTick;
  const prev = lastHit.get(p.id) ?? -999;
  lastHit.set(p.id, now);
  if (now - prev <= SPAM_WINDOW) record(p, 'sword', 1);
});

// --- Learning from their mistakes: a mob killed by a trick teaches the others extra -------------
world.afterEvents.entityDie.subscribe(({ deadEntity: m, damageSource: src }) => {
  const p = src?.damagingEntity;
  if (p?.typeId !== 'minecraft:player' || !p.isValid) return;
  let loc;
  try { if (!isMonster(m)) return; loc = m.location; } catch { return; }
  const pl = p.location;
  // Killed by someone standing on top of a pillar out of reach.
  if (pl.y - loc.y >= 2.5 && Math.hypot(pl.x - loc.x, pl.z - loc.z) < 8) {
    const under = Math.floor(pl.y) - 1;
    let narrow = true;
    try {
      // Standing on a 1-block column: the blocks around the one under the player are open.
      const dim = p.dimension, bx = Math.floor(pl.x), bz = Math.floor(pl.z);
      for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nb = dim.getBlock({ x: bx + x, y: under, z: bz + z });
        if (nb && !nb.isAir && !nb.isLiquid) { narrow = false; break; }
      }
    } catch { /* ignore */ }
    if (narrow) record(p, 'pillar', 2);
  }
  // Killed during a sword-spam flurry.
  if (system.currentTick - (lastHit.get(p.id) ?? -999) <= SPAM_WINDOW && isSword(heldItem(p))) record(p, 'sword', 1);
});

world.afterEvents.playerLeave.subscribe((e) => { lastHit.delete(e.playerId); pillarRun.delete(e.playerId); });
