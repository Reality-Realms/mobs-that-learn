// Visual + audio helpers.
import { system } from '@minecraft/server';

export function particle(dim, id, loc) {
  try { dim.spawnParticle(id, loc); } catch { /* unloaded chunk */ }
}
export function sound(dim, id, loc, volume = 1, pitch = 1) {
  try { dim.playSound(id, loc, { volume, pitch }); } catch { /* ignore */ }
}
export function playerSound(p, id, volume = 1, pitch = 1) {
  try { p.playSound(id, { volume, pitch }); } catch { /* ignore */ }
}
export function actionbar(p, text) {
  try { p.onScreenDisplay.setActionBar(text); } catch { /* ignore */ }
}
export function title(p, text, subtitle, stay = 70) {
  try { p.onScreenDisplay.setTitle(text, { subtitle, fadeInDuration: 6, stayDuration: stay, fadeOutDuration: 20 }); } catch { /* ignore */ }
}
export function flash(p, color, inT = 0.12, hold = 0.12, out = 0.9) {
  try { p.camera.fade({ fadeColor: color, fadeTime: { fadeInTime: inT, holdTime: hold, fadeOutTime: out } }); } catch { /* ignore */ }
}
export const later = (ticks, fn) => system.runTimeout(() => { try { fn(); } catch (e) { console.warn(`[MTL] ${e}`); } }, ticks);
export const head = (e, up = 2.25) => ({ x: e.location.x, y: e.location.y + up, z: e.location.z });
