// MOBS THAT LEARN - entry point.
import { world, system } from '@minecraft/server';
import { VERSION, TRICKS, TRICK_IDS, SPEEDS, G, setSetting } from './config.js';
import { brainOf, save, learn, forget, reset, statusText } from './brain.js';
import { considerClimb } from './climber.js';
import { updateShield } from './shield.js';
import { nearestPlayer, sendAdapted } from './mobs.js';
import './tricks.js';

// ------------------------------------------------------------------------------------------------
// Adapted mob brains: one scan every 4 ticks around each player.
// ------------------------------------------------------------------------------------------------
system.runInterval(() => {
  const now = system.currentTick;
  const seen = new Set();
  for (const p of world.getAllPlayers()) {
    let list;
    try { list = p.dimension.getEntities({ location: p.location, maxDistance: 40, families: ['mtl_learner'] }); } catch { continue; }
    for (const m of list) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const target = nearestPlayer(m.dimension, m.location, 40);
      try {
        if (m.typeId === 'mtl:ladder_zombie') { if (target) considerClimb(m, target, now); }
        else if (m.typeId === 'mtl:shield_zombie') updateShield(m, target, now);
      } catch (e) { console.warn(`[MTL] ${e}`); }
    }
  }
}, 4);

// ------------------------------------------------------------------------------------------------
// Welcome
// ------------------------------------------------------------------------------------------------
world.afterEvents.playerSpawn.subscribe(({ player: p, initialSpawn }) => {
  if (!initialSpawn) return;
  system.runTimeout(() => {
    if (!p.isValid) return;
    const b = brainOf(p);
    if (b.welcomed) return;
    b.welcomed = true;
    save(p);
    p.sendMessage(`§d${G.brain} §lMOBS THAT LEARN§r §8v${VERSION}`);
    p.sendMessage('§7The mobs are watching how you fight. Use the same trick too often and they will learn to counter it.');
    p.sendMessage('§8Tip: /scriptevent mtl:status shows what they know about you.');
  }, 120);
});

// ------------------------------------------------------------------------------------------------
// Commands (testing + until the settings menu arrives):
//   /scriptevent mtl:status
//   /scriptevent mtl:learn <pillar|sword|all>     /scriptevent mtl:forget <pillar|sword|all>
//   /scriptevent mtl:reset
//   /scriptevent mtl:speed <slow|normal|fast>      /scriptevent mtl:forgetting <on|off>
//   /scriptevent mtl:counter <pillar|sword> <on|off>
//   /scriptevent mtl:summon <pillar|sword>          (sends two adapted mobs at you)
// ------------------------------------------------------------------------------------------------
system.afterEvents.scriptEventReceive.subscribe(({ id, message, sourceEntity }) => {
  if (!id.startsWith('mtl:')) return;
  const cmd = id.slice(4);
  const args = message.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const players = sourceEntity?.typeId === 'minecraft:player' ? [sourceEntity] : world.getAllPlayers();
  const pick = (a) => (a === 'all' ? TRICK_IDS : TRICK_IDS.includes(a) ? [a] : []);
  const tell = (p, m) => p.sendMessage(`§d${G.brain} [Mob Brain] §r${m}`);
  for (const p of players) {
    switch (cmd) {
      case 'status': p.sendMessage(statusText(p)); break;
      case 'learn': {
        const ids = pick(args[0]);
        if (!ids.length) { tell(p, `§7Usage: /scriptevent mtl:learn <${TRICK_IDS.join('|')}|all>`); break; }
        ids.forEach((t, i) => system.runTimeout(() => p.isValid && learn(p, t), i * 120));
        break;
      }
      case 'forget': {
        const ids = pick(args[0]);
        if (!ids.length) { tell(p, `§7Usage: /scriptevent mtl:forget <${TRICK_IDS.join('|')}|all>`); break; }
        for (const t of ids) forget(p, t, ids.length > 1);
        if (ids.length > 1) tell(p, '§7The mobs forgot everything they knew about you.');
        break;
      }
      case 'reset': reset(p); tell(p, '§7All learning reset. The mobs know nothing about you... for now.'); break;
      case 'summon': {
        const t = pick(args[0])[0];
        if (!t) { tell(p, `§7Usage: /scriptevent mtl:summon <${TRICK_IDS.join('|')}>`); break; }
        const type = TRICKS[t].mob;
        const n = sendAdapted(p, type, 2);
        tell(p, n ? `§7Sent ${n} ${TRICKS[t].counter}.` : '§7No room to spawn them nearby.');
        break;
      }
      default: break;
    }
  }
  // world-wide settings
  if (cmd === 'speed' && SPEEDS[args[0]]) { setSetting('speed', args[0]); world.sendMessage(`§d${G.brain} [Mob Brain] §7Learning speed: §f${args[0]}`); }
  if (cmd === 'forgetting' && (args[0] === 'on' || args[0] === 'off')) { setSetting('forget', args[0] === 'on'); world.sendMessage(`§d${G.brain} [Mob Brain] §7Forgetting: §f${args[0]}`); }
  if (cmd === 'counter' && TRICK_IDS.includes(args[0]) && (args[1] === 'on' || args[1] === 'off')) {
    setSetting(`on:${args[0]}`, args[1] === 'on');
    world.sendMessage(`§d${G.brain} [Mob Brain] §7${TRICKS[args[0]].counter}: §f${args[1]}`);
  }
});

console.log(`[MTL] MOBS THAT LEARN v${VERSION} loaded`);
