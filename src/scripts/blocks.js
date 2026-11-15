// Block helpers.
import { world } from '@minecraft/server';

const SOFT = new Set([
  'minecraft:short_grass', 'minecraft:tall_grass', 'minecraft:grass', 'minecraft:fern', 'minecraft:large_fern', 'minecraft:deadbush',
  'minecraft:dead_bush', 'minecraft:vine', 'minecraft:ladder', 'minecraft:snow_layer', 'minecraft:fire', 'minecraft:soul_fire', 'minecraft:web',
  'minecraft:cobweb', 'minecraft:lever', 'minecraft:rail', 'minecraft:redstone_wire', 'minecraft:tripwire', 'minecraft:tripwire_hook',
  'minecraft:scaffolding', 'minecraft:seagrass', 'minecraft:kelp', 'minecraft:sweet_berry_bush', 'minecraft:wheat', 'minecraft:carrots',
  'minecraft:potatoes', 'minecraft:beetroot', 'minecraft:sugar_cane', 'minecraft:reeds', 'minecraft:light_block', 'minecraft:structure_void',
  'minecraft:brown_mushroom', 'minecraft:red_mushroom', 'minecraft:poppy', 'minecraft:dandelion', 'minecraft:red_flower', 'minecraft:yellow_flower',
  'minecraft:glow_lichen', 'minecraft:hanging_roots', 'minecraft:cave_vines', 'minecraft:twisting_vines', 'minecraft:weeping_vines', 'minecraft:pink_petals',
]);
const SOFT_END = ['_sapling', '_button', '_pressure_plate', '_sign', '_banner', '_carpet', 'torch', '_rail', '_tulip', '_flower', '_coral_fan', 'candle', '_bud'];

export function isSolid(b) {
  if (!b || b.isAir || b.isLiquid) return false;
  const id = b.typeId;
  if (SOFT.has(id)) return false;
  for (const s of SOFT_END) if (id.endsWith(s)) return false;
  return true;
}
export const isOpen = (b) => !!b && !isSolid(b) && !b.isLiquid;

export function blockAt(dim, x, y, z) {
  try { return dim.getBlock({ x, y, z }); } catch { return undefined; }
}

export function mobGriefing() {
  try { return world.gameRules.mobGriefing; } catch { return true; }
}
