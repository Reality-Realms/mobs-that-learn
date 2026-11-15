// Turns the counters a player's mobs have learned into actual mobs:
// - natural zombie spawns near that player can be swapped for adapted versions
// - at the learning moment, a couple of adapted mobs come looking for the player (at night / underground)
import { world, system, EntityInitializationCause, Difficulty, GameMode } from '@minecraft/server';
import { TRICKS } from './config.js';
import { learnedList, onLearn, countsTricks, mastery } from './brain.js';
import { isSolid, isOpen, blockAt } from './blocks.js';
import * as fx from './fx.js';

// Chance a zombie spawn near you becomes a counter mob: 30% when just learned, up to 65% at full mastery.
const CONVERT_MIN = 0.3, CONVERT_MAX = 0.65;
const BASE = new Set(['minecraft:zombie', 'minecraft:husk']);

export function nearestPlayer(dim, location, maxDistance = 48) {
  try {
    return dim.getPlayers({ location, maxDistance, closest: 1, excludeGameModes: [GameMode.Creative, GameMode.Spectator] })[0];
  } catch { return undefined; }
}

world.afterEvents.entitySpawn.subscribe(({ entity: e, cause }) => {
  if (cause !== EntityInitializationCause.Spawned || !BASE.has(e.typeId)) return;
  system.run(() => convert(e));
});

function convert(e) {
  if (!e.isValid || e.nameTag) return;
  try { if (e.getComponent('minecraft:is_baby')) return; } catch { /* ignore */ }
  const p = nearestPlayer(e.dimension, e.location, 64);
  if (!p) return;
  const ids = learnedList(p).filter((id) => TRICKS[id].mob);
  if (!ids.length) return;
  // Counters they have mastered better turn up more often.
  const w = ids.map((id) => 1 + mastery(p, id));
  let r = Math.random() * w.reduce((a, b) => a + b, 0), id = ids[ids.length - 1];
  for (let i = 0; i < ids.length; i++) { if ((r -= w[i]) <= 0) { id = ids[i]; break; } }
  if (Math.random() > CONVERT_MIN + (CONVERT_MAX - CONVERT_MIN) * mastery(p, id)) return;
  const type = TRICKS[id].mob;
  const dim = e.dimension, loc = e.location, rot = e.getRotation();
  e.remove();
  try { dim.spawnEntity(type, loc).setRotation(rot); } catch { /* unloaded */ }
}

const isNight = () => { const t = world.getTimeOfDay(); return t >= 12800 && t <= 23200; };
function covered(dim, loc) {
  try { return !!dim.getBlockFromRay({ x: loc.x, y: loc.y + 2, z: loc.z }, { x: 0, y: 1, z: 0 }, { maxDistance: 48 }); } catch { return false; }
}
function findSpot(p, needCover) {
  const dim = p.dimension, pl = p.location;
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, r = 11 + Math.random() * 8;
    const x = Math.floor(pl.x + Math.cos(a) * r), z = Math.floor(pl.z + Math.sin(a) * r);
    for (let dy = 4; dy >= -6; dy--) {
      const y = Math.floor(pl.y) + dy;
      if (!isSolid(blockAt(dim, x, y, z))) continue;
      const a1 = blockAt(dim, x, y + 1, z), a2 = blockAt(dim, x, y + 2, z);
      if (!isOpen(a1) || !isOpen(a2) || a1.isLiquid) continue;
      const loc = { x: x + 0.5, y: y + 1, z: z + 0.5 };
      if (needCover && !covered(dim, loc)) break;
      return loc;
    }
  }
  return undefined;
}

export function sendAdapted(p, type, count) {
  const night = isNight();
  let n = 0;
  for (let i = 0; i < count; i++) {
    const loc = findSpot(p, !night);
    if (!loc) continue;
    try {
      const m = p.dimension.spawnEntity(type, loc);
      fx.particle(p.dimension, 'mtl:brain_burst', fx.head(m, 1.9));
      n++;
    } catch { /* ignore */ }
  }
  return n;
}

// The learning moment: a couple of the new mobs come for you right away (if it is dark enough).
onLearn((p, id) => {
  const type = TRICKS[id].mob;
  if (!type || !countsTricks(p) || world.getDifficulty() === Difficulty.Peaceful) return;
  if (p.dimension.id !== 'minecraft:overworld') return;
  if (!isNight() && !covered(p.dimension, p.location)) return;
  if (sendAdapted(p, type, 2) > 0) fx.later(30, () => p.isValid && fx.actionbar(p, '§5Something is coming for you...'));
});
