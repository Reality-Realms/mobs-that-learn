// The Mob Brain: per-player memory of the player's tricks and the counters the mobs have learned.
// Saved on the player (dynamic property), so every player in multiplayer has their own brain
// and it survives leaving and rejoining.
import { world, system, GameMode } from '@minecraft/server';
import { TRICKS, TRICK_IDS, TUNE, G, speedMul, forgettingOn, counterOn } from './config.js';
import * as fx from './fx.js';

const KEY = 'mtl:brain';
const cache = new Map();   // player id -> { data, dirty }
const watchFx = new Map(); // player id -> tick of the last "watching" effect
const lastSave = new Map(); // player id -> tick of the last save (trick records save at most every 2 s)
const blank = () => ({ s: 0, last: 0, learned: false, hint: 0, seen: 0 });

function fresh() {
  const tricks = {};
  for (const id of TRICK_IDS) tricks[id] = blank();
  return { v: 1, play: 0, welcomed: false, tricks };
}

export function brainOf(p) {
  let entry = cache.get(p.id);
  if (!entry) {
    let data;
    try { data = JSON.parse(p.getDynamicProperty(KEY) ?? 'null'); } catch { data = null; }
    if (!data || data.v !== 1) data = fresh();
    for (const id of TRICK_IDS) { data.tricks[id] ??= blank(); data.tricks[id].seen ??= 0; }
    entry = { data, dirty: false };
    cache.set(p.id, entry);
  }
  return entry.data;
}
function markDirty(p) { const e = cache.get(p.id); if (e) e.dirty = true; }
export function save(p) {
  const e = cache.get(p.id);
  if (!e || !e.dirty) return;
  try { p.setDynamicProperty(KEY, JSON.stringify(e.data)); e.dirty = false; } catch { /* player gone */ }
}

export const knows = (p, id) => counterOn(id) && !!brainOf(p).tricks[id]?.learned;
export const progress = (p, id) => Math.min(1, (brainOf(p).tricks[id]?.s ?? 0) / TRICKS[id].threshold);
// How well the mobs have mastered a learned counter: 0 = just learned, 1 = score maxed out.
// Keep using the trick after they learned it and they send more (and sharper) counter mobs.
export function mastery(p, id) {
  const t = brainOf(p).tricks[id];
  if (!t?.learned) return 0;
  return Math.max(0, Math.min(1, (t.s / TRICKS[id].threshold - 1) / (TUNE.cap - 1)));
}
export const learnedList = (p) => TRICK_IDS.filter((id) => knows(p, id));
export const countsTricks = (p) => { const gm = p.getGameMode(); return gm === GameMode.Survival || gm === GameMode.Adventure; };

// ------------------------------------------------------------------------------------------------
// Recording tricks
// ------------------------------------------------------------------------------------------------
export function record(p, id, points = 1) {
  if (!counterOn(id) || !countsTricks(p)) return;
  const b = brainOf(p);
  const t = b.tricks[id];
  const T = TRICKS[id];
  t.s = Math.min(T.threshold * TUNE.cap, t.s + points * speedMul());
  t.last = b.play;
  t.seen++;
  markDirty(p);
  const now = system.currentTick;
  if (now - (lastSave.get(p.id) ?? -999) >= 40) { lastSave.set(p.id, now); save(p); }
  if (t.learned) return;
  const pr = t.s / T.threshold;
  if (pr >= 1) { learn(p, id); return; }
  // progress hints
  while (t.hint < TUNE.hints.length && pr >= TUNE.hints[t.hint]) {
    const msg = t.hint === 0 ? T.watch : T.study;
    t.hint++;
    fx.actionbar(p, `§5${G.eye} §7${msg}`);
    fx.playerSound(p, t.hint === 1 ? 'mtl.watch' : 'mtl.pulse', 0.8, 1);
    watching(p, true);
  }
  if (pr >= 0.15) watching(p, false);
}

// Mobs nearby open a glowing eye above their heads: they are watching you.
function watching(p, force) {
  const now = system.currentTick;
  if (!force && now - (watchFx.get(p.id) ?? -999) < 100) return;
  watchFx.set(p.id, now);
  let n = 0;
  for (const m of p.dimension.getEntities({ location: p.location, maxDistance: 22, families: ['monster'] })) {
    if (n++ >= 6) break;
    fx.particle(m.dimension, 'mtl:watch', fx.head(m, m.typeId === 'minecraft:creeper' ? 2.0 : 2.3));
  }
}

// ------------------------------------------------------------------------------------------------
// The learning moment
// ------------------------------------------------------------------------------------------------
const listeners = [];
export const onLearn = (fn) => listeners.push(fn);

export function learn(p, id, quiet = false) {
  const b = brainOf(p);
  const t = b.tricks[id];
  const T = TRICKS[id];
  t.learned = true;
  t.s = Math.max(t.s, T.threshold);
  t.last = b.play;
  t.hint = TUNE.hints.length;
  markDirty(p);
  save(p);
  if (quiet) return;
  // 1) a deep boom, a purple flash and a shock-wave of light
  fx.playerSound(p, 'mtl.learn', 1, 1);
  fx.flash(p, { red: 0.22, green: 0.02, blue: 0.32 }, 0.1, 0.08, 1.1);
  fx.particle(p.dimension, 'mtl:learn_wave', { x: p.location.x, y: p.location.y + 0.2, z: p.location.z });
  // 2) the headline
  fx.later(6, () => {
    if (!p.isValid) return;
    fx.title(p, '§l§dTHEY LEARNED', `§c${G.warn} §f${T.learn}`, 80);
    p.sendMessage(`§d${G.brain} [Mob Brain] §c${G.warn} §f${T.learn} §7(${T.name} -> ${T.counter}${t.seen ? `, after watching you ${t.seen} times` : ''})`);
  });
  // 3) every mob around you "gets it" at the same moment
  fx.later(10, () => {
    if (!p.isValid) return;
    let n = 0;
    for (const m of p.dimension.getEntities({ location: p.location, maxDistance: 32, families: ['monster'] })) {
      if (n++ >= 14) break;
      const up = m.typeId === 'minecraft:creeper' ? 2.0 : 2.3;
      fx.particle(m.dimension, 'mtl:alert', fx.head(m, up + 0.3));
      fx.particle(m.dimension, 'mtl:brain_burst', fx.head(m, up - 0.4));
    }
  });
  // 4) the tip
  fx.later(96, () => { if (p.isValid) fx.actionbar(p, `§7${T.tip}`); });
  for (const fn of listeners) fx.later(40, () => p.isValid && fn(p, id));
}

export function forget(p, id, quiet = false) {
  const t = brainOf(p).tricks[id];
  const T = TRICKS[id];
  t.learned = false;
  t.s = Math.min(t.s, T.threshold * TUNE.forgetBelow * 0.9);
  t.hint = 0;
  markDirty(p);
  save(p);
  if (quiet) return;
  fx.playerSound(p, 'mtl.forget', 0.9, 1);
  fx.title(p, '§8 ', `§7${G.brain} ${T.forget}`, 50);
  p.sendMessage(`§d${G.brain} [Mob Brain] §7${T.forget}`);
}

export function reset(p) {
  const e = cache.get(p.id);
  const data = fresh();
  data.welcomed = true;
  data.play = e?.data.play ?? 0;
  cache.set(p.id, { data, dirty: true });
  save(p);
}

// ------------------------------------------------------------------------------------------------
// Clock: play time, forgetting, saving
// ------------------------------------------------------------------------------------------------
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const b = brainOf(p);
    b.play += 20;
    markDirty(p);
    if (b.play % TUNE.decayEvery === 0 && forgettingOn()) {
      for (const id of TRICK_IDS) {
        const t = b.tricks[id];
        if (t.s <= 0 || b.play - t.last < TUNE.forgetAfter) continue;
        t.s = Math.max(0, t.s - TRICKS[id].threshold * TUNE.decayAmount);
        if (!t.learned && t.hint > 0 && t.s / TRICKS[id].threshold < TUNE.hints[t.hint - 1] * 0.6) t.hint--;
        if (t.learned && t.s < TRICKS[id].threshold * TUNE.forgetBelow) forget(p, id);
      }
    }
    if (b.play % 200 === 0) save(p);
  }
}, 20);

world.afterEvents.playerLeave.subscribe((e) => { cache.delete(e.playerId); watchFx.delete(e.playerId); lastSave.delete(e.playerId); });

export function statusText(p) {
  const lines = [`§d${G.brain} §lMOB BRAIN§r §7- what the mobs know about you`];
  for (const id of TRICK_IDS) {
    const T = TRICKS[id];
    const pr = progress(p, id);
    const bars = Math.round(pr * 20);
    const learned = brainOf(p).tricks[id].learned;
    const state = !counterOn(id) ? '§8OFF' : learned ? `§cLEARNED §7-> ${T.counter} §8(mastery ${Math.round(mastery(p, id) * 100)}%)` : `§7${Math.floor(pr * 100)}%`;
    lines.push(`§f${T.name}: §d${'|'.repeat(bars)}§8${'|'.repeat(20 - bars)} ${state}`);
  }
  return lines.join('\n');
}
