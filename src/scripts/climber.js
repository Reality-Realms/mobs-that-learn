// Counter to pillaring: Ladder Zombies slap ladders onto walls/pillars and climb up after you.
import { world, system, BlockPermutation } from '@minecraft/server';
import { isSolid, isOpen, blockAt, mobGriefing } from './blocks.js';
import * as fx from './fx.js';

const climbing = new Map(); // entity id -> climb state
const cooldown = new Map(); // entity id -> tick it may try again
const DIRS = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
// Ladder facing_direction = the side the ladder faces (away from the wall): 2 north, 3 south, 4 west, 5 east.
const facingAway = (d) => (d.x === 1 ? 4 : d.x === -1 ? 5 : d.z === 1 ? 2 : 3);
const yawOf = (d) => (Math.atan2(-d.x, d.z) * 180) / Math.PI;
const SPEED = 0.12;      // blocks per tick (a bit faster than a player on a ladder)
const PULL_TICKS = 9;    // pulling a ladder off its back before climbing
const MAX_CLIMB = 32;

function setPose(z, v) { try { if (z.getProperty('mtl:pose') !== v) z.setProperty('mtl:pose', v); } catch { /* ignore */ } }

// Called every few ticks for each Ladder Zombie with its nearest target player.
export function considerClimb(z, p, now) {
  if (climbing.has(z.id) || (cooldown.get(z.id) ?? 0) > now) return;
  const zl = z.location, pl = p.location;
  if (pl.y - zl.y < 1.9) return;
  const dx = pl.x - zl.x, dz = pl.z - zl.z;
  if (Math.hypot(dx, dz) > 3.4 || !z.isOnGround) return;
  const dim = z.dimension;
  const bx = Math.floor(zl.x), bz = Math.floor(zl.z), by = Math.floor(zl.y + 0.01);
  if (!isOpen(blockAt(dim, bx, by, bz)) || !isOpen(blockAt(dim, bx, by + 1, bz))) return;
  const order = [...DIRS].sort((a, b) => (b.x * dx + b.z * dz) - (a.x * dx + a.z * dz));
  for (const d of order) {
    if (d.x * dx + d.z * dz < -0.2) continue;                       // never climb away from the player
    if (!isSolid(blockAt(dim, bx + d.x, by + 1, bz + d.z))) continue; // needs a wall at least 2 high
    climbing.set(z.id, { e: z, x: bx, z: bz, d, y: zl.y, y0: zl.y, placed: by - 1, t: 0, phase: 'pull', step: 0, slap: 0 });
    setPose(z, 2);
    fx.sound(dim, 'mtl.ladder.pull', zl, 1, 0.9 + Math.random() * 0.2);
    return;
  }
}

function stop(id, s, now, cd) {
  climbing.delete(id);
  cooldown.set(id, now + cd);
  if (s.e.isValid) setPose(s.e, 0);
}

// Slap ladders on the wall up to the given level.
function placeUpTo(s, level) {
  const z = s.e, dim = z.dimension;
  while (s.placed < level) {
    const l = ++s.placed;
    if (!isSolid(blockAt(dim, s.x + s.d.x, l, s.z + s.d.z))) continue;
    const b = blockAt(dim, s.x, l, s.z);
    if (!b || !b.isAir || !mobGriefing()) continue;
    try { b.setPermutation(BlockPermutation.resolve('minecraft:ladder', { facing_direction: facingAway(s.d) })); } catch { continue; }
    const at = { x: s.x + 0.5 + s.d.x * 0.4, y: l + 0.5, z: s.z + 0.5 + s.d.z * 0.4 };
    fx.sound(dim, 'mtl.ladder.place', at, 1, 0.9 + Math.random() * 0.2);
    fx.particle(dim, 'mtl:ladder_dust', at);
    s.slap = 5;
    setPose(z, 2);
  }
}

function tick() {
  if (!climbing.size) return;
  const now = system.currentTick;
  for (const [id, s] of climbing) {
    const z = s.e;
    if (!z.isValid) { climbing.delete(id); continue; }
    const dim = z.dimension, cx = s.x + 0.5, cz = s.z + 0.5, yaw = yawOf(s.d);
    const loc = z.location;
    if (Math.hypot(loc.x - cx, loc.z - cz) > 0.9 || Math.abs(loc.y - s.y) > 1.2) { stop(id, s, now, 40); continue; }
    try {
      if (s.phase === 'pull') {
        z.teleport({ x: cx, y: s.y, z: cz }, { rotation: { x: 0, y: yaw } });
        if (++s.t === 5) placeUpTo(s, Math.floor(s.y) + 1);
        if (s.t >= PULL_TICKS) { s.phase = 'climb'; setPose(z, 1); }
        continue;
      }
      const ny = s.y + SPEED;
      const next = Math.floor(s.y) + 1;
      // Reached the top of the wall: hop over the edge.
      if (ny >= next && !isSolid(blockAt(dim, s.x + s.d.x, next, s.z + s.d.z))) {
        z.teleport({ x: cx + s.d.x * 0.75, y: next + 0.02, z: cz + s.d.z * 0.75 }, { rotation: { x: 0, y: yaw } });
        try { z.applyImpulse({ x: s.d.x * 0.18, y: 0.1, z: s.d.z * 0.18 }); } catch { /* ignore */ }
        fx.sound(dim, 'mtl.ladder.climb', z.location, 1, 0.8);
        stop(id, s, now, 30);
        continue;
      }
      const headLevel = Math.floor(ny + 1.9);
      if (!isOpen(blockAt(dim, s.x, headLevel, s.z)) || ny - s.y0 > MAX_CLIMB) { stop(id, s, now, 80); continue; }
      placeUpTo(s, headLevel);
      s.y = ny;
      z.teleport({ x: cx, y: ny, z: cz }, { rotation: { x: 0, y: yaw } });
      if (s.slap > 0 && --s.slap === 0) setPose(z, 1);
      if (++s.step % 6 === 0) fx.sound(dim, 'mtl.ladder.climb', z.location, 0.7, 0.9 + Math.random() * 0.25);
    } catch {
      stop(id, s, now, 40);
    }
  }
}
system.runInterval(tick, 1);

// Hitting a climbing zombie knocks it off the wall.
world.afterEvents.entityHurt.subscribe(({ hurtEntity: z }) => {
  const s = climbing.get(z.id);
  if (s) stop(z.id, s, system.currentTick, 50);
});

system.runInterval(() => {
  const now = system.currentTick;
  for (const [id, t] of cooldown) if (t < now) cooldown.delete(id);
}, 200);
