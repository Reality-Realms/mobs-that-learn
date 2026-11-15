// Detects the player's tricks and feeds them to the Mob Brain.
import { world, system, EquipmentSlot } from '@minecraft/server';
import { record } from './brain.js';

// --- Pillaring up: placing a block directly under your own feet --------------------------------
world.afterEvents.playerPlaceBlock.subscribe(({ player: p, block: b }) => {
  const l = p.location;
  if (Math.floor(l.x) !== b.x || Math.floor(l.z) !== b.z) return;
  const dy = l.y - b.y;
  if (dy <= 0.5 || dy > 2.3) return;
  record(p, 'pillar', 1);
});

// --- Sword spam: hitting a hostile mob again less than 0.6 s after the last sword hit -----------
const lastHit = new Map();
export function isSword(item) {
  if (!item) return false;
  if (item.typeId.endsWith('_sword')) return true;
  try { return item.hasTag('minecraft:is_sword'); } catch { return false; }
}
export function heldItem(p) {
  try { return p.getComponent('minecraft:equippable')?.getEquipment(EquipmentSlot.Mainhand); } catch { return undefined; }
}
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity: p, hitEntity: target }) => {
  if (p?.typeId !== 'minecraft:player' || !target?.isValid) return;
  if (!isSword(heldItem(p))) return;
  let hostile = false;
  try { hostile = target.matches({ families: ['monster'] }); } catch { /* ignore */ }
  if (!hostile) return;
  const now = system.currentTick;
  const prev = lastHit.get(p.id) ?? -999;
  lastHit.set(p.id, now);
  if (now - prev <= 12) record(p, 'sword', 1);
});
world.afterEvents.playerLeave.subscribe((e) => lastHit.delete(e.playerId));
