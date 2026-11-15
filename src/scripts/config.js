// MOBS THAT LEARN - shared constants and world settings.
import { world } from '@minecraft/server';

export const VERSION = '__VERSION__';

export const G = { warn: '', brain: '', eye: '' };

// Every trick the mobs can learn. `threshold` = points needed at normal learning speed.
// Step 1 ships pillar + sword; the rest arrive in step 2.
export const TRICKS = {
  pillar: {
    name: 'Pillaring up', counter: 'Ladder Zombies', threshold: 30, mob: 'mtl:ladder_zombie',
    watch: 'The zombies are watching you pillar up...',
    study: 'The zombies are working out how to reach you up there...',
    learn: 'The zombies have learned to climb!',
    tip: 'Pillaring up won\'t keep you safe anymore. Watch out for ladders!',
    forget: 'The zombies have forgotten how to climb.',
  },
  sword: {
    name: 'Sword spam', counter: 'Shield Zombies', threshold: 50, mob: 'mtl:shield_zombie',
    watch: 'The zombies are watching your sword swings...',
    study: 'The zombies are studying how you spam your sword...',
    learn: 'The zombies have learned to block!',
    tip: 'Shields block hits from the front. Strike when the shield drops, or hit them from behind!',
    forget: 'The zombies have forgotten how to block.',
  },
};
export const TRICK_IDS = Object.keys(TRICKS);

// Learning tuning (ticks are counted only while the player is online).
export const TUNE = {
  cap: 1.5,               // score can bank up to 150% of the threshold
  forgetAfter: 12000,     // 10 minutes without using a trick before the mobs start forgetting
  decayEvery: 1200,       // then every minute...
  decayAmount: 0.06,      // ...lose 6% of the threshold
  forgetBelow: 0.5,       // forgotten once the score drops under 50% of the threshold
  hints: [0.4, 0.75],     // "watching" and "studying" messages
};

export const SPEEDS = { slow: 0.5, normal: 1, fast: 2 };

export function getSetting(key, def) {
  const v = world.getDynamicProperty(`mtl:set:${key}`);
  return v === undefined ? def : v;
}
export function setSetting(key, value) {
  world.setDynamicProperty(`mtl:set:${key}`, value);
}
export const speedMul = () => SPEEDS[getSetting('speed', 'normal')] ?? 1;
export const forgettingOn = () => getSetting('forget', true);
export const counterOn = (id) => getSetting(`on:${id}`, true);
