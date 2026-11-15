// MOBS THAT LEARN build: generates the behavior + resource packs and packages a .mcaddon.
// Usage: .tools/node.exe tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas } from './lib/png.mjs';
import { makeZip } from './lib/zip.mjs';
import { buildSounds, SOUND_EVENTS } from './sounds.mjs';
import { particleSheet, particles, glyphSheet, packIcon, PARTICLE_TEX } from './fx.mjs';
import { learnerGeometry, learnerSkin, learnerAnimations, LEARNERS, learnerBehavior, learnerClient, LOOT } from './learners.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = [1, 0, 0];
const VSTR = VERSION.join('.');
const OUT = path.join(ROOT, 'build');
const BP = path.join(OUT, 'MOBS_THAT_LEARN_BP');
const RP = path.join(OUT, 'MOBS_THAT_LEARN_RP');
const UUID = {
  bp: '0a78af87-8b7a-496f-9703-c7bbfc2fd189',
  bpData: '26bfe77e-1e86-470b-9978-dddba757aae2',
  bpScript: '8755f5f5-3188-44bf-947b-192f6855eb2f',
  rp: 'ea715918-fdbd-4e3f-a642-47f2b37ba3ce',
  rpRes: '62dbfce2-8fc2-4820-94bc-0bae4b7970e9',
};

const written = [];
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  written.push(file);
}
const json = (file, obj) => write(file, JSON.stringify(obj, null, 2));
const lang = [];
const L = (k, v) => lang.push(`${k}=${v}`);

for (const d of [BP, RP]) fs.rmSync(d, { recursive: true, force: true });

// ------------------------------------------------------------------------------------------------
// Sounds
// ------------------------------------------------------------------------------------------------
buildSounds(path.join(RP, 'sounds/mtl'), path.join(ROOT, '.cache/sounds'));
const SD = {};
for (const [ev, { files, category }] of Object.entries(SOUND_EVENTS)) {
  SD[ev] = { category, sounds: files.map((f) => ({ name: `sounds/mtl/${f}` })) };
}
json(path.join(RP, 'sounds/sound_definitions.json'), { format_version: '1.20.20', sound_definitions: SD });

// ------------------------------------------------------------------------------------------------
// Textures, font glyphs, particles
// ------------------------------------------------------------------------------------------------
const skins = {};
for (const [key, m] of Object.entries(LEARNERS)) {
  skins[key] = learnerSkin(m.kind);
  write(path.join(RP, `textures/entity/mtl/${key}.png`), skins[key].encode());
}
write(path.join(RP, `${PARTICLE_TEX}.png`), particleSheet().encode());
write(path.join(RP, 'font/glyph_E9.png'), glyphSheet().encode());
const icon = packIcon(skins.ladder_zombie).encode();
write(path.join(RP, 'pack_icon.png'), icon);
write(path.join(BP, 'pack_icon.png'), icon);
for (const [id, p] of Object.entries(particles())) json(path.join(RP, `particles/mtl_${id}.particle.json`), p);

// ------------------------------------------------------------------------------------------------
// Learner mobs
// ------------------------------------------------------------------------------------------------
json(path.join(RP, 'models/entity/mtl/learner.geo.json'), learnerGeometry('geometry.mtl.learner'));
json(path.join(RP, 'animations/mtl_learner.animation.json'), { format_version: '1.10.0', animations: learnerAnimations() });
json(path.join(RP, 'render_controllers/mtl.render_controllers.json'), {
  format_version: '1.10.0',
  render_controllers: {
    'controller.render.mtl.learner': {
      geometry: 'Geometry.default',
      materials: [{ '*': 'Material.default' }, { 'glow_*': 'Material.glow' }],
      textures: ['Texture.default'],
    },
  },
});
const entitySounds = {};
for (const [key, m] of Object.entries(LEARNERS)) {
  json(path.join(BP, `entities/mtl_${key}.json`), learnerBehavior(key, m));
  json(path.join(RP, `entity/mtl_${key}.entity.json`), learnerClient(key, m));
  json(path.join(BP, `loot_tables/mtl/${m.loot}.json`), LOOT[m.loot]);
  L(`entity.mtl:${key}.name`, m.name);
  L(`item.spawn_egg.entity.mtl:${key}.name`, `Spawn ${m.name}`);
  entitySounds[`mtl:${key}`] = {
    volume: 1, pitch: [0.85, 1.05],
    events: {
      ambient: 'mtl.learner.groan', hurt: 'mtl.learner.hurt', death: 'mtl.learner.death',
      step: { sound: 'mob.zombie.step', volume: 0.15, pitch: 1 },
    },
  };
}
json(path.join(RP, 'sounds.json'), { entity_sounds: { entities: entitySounds } });

// ------------------------------------------------------------------------------------------------
// Scripts
// ------------------------------------------------------------------------------------------------
for (const f of fs.readdirSync(path.join(ROOT, 'src/scripts'))) {
  let src = fs.readFileSync(path.join(ROOT, 'src/scripts', f), 'utf8');
  src = src.replaceAll('__VERSION__', VSTR);
  write(path.join(BP, 'scripts', f), src);
}

// ------------------------------------------------------------------------------------------------
// Text + manifests
// ------------------------------------------------------------------------------------------------
L('pack.name', 'MOBS THAT LEARN');
L('pack.description', 'The mobs watch how you fight and learn to counter your favourite tricks.');
const langText = lang.join('\n') + '\n';
for (const p of [BP, RP]) {
  write(path.join(p, 'texts/en_US.lang'), langText);
  json(path.join(p, 'texts/languages.json'), ['en_US']);
}
json(path.join(BP, 'manifest.json'), {
  format_version: 2,
  header: { name: 'pack.name', description: 'pack.description', uuid: UUID.bp, version: VERSION, min_engine_version: [1, 21, 130] },
  modules: [
    { type: 'data', uuid: UUID.bpData, version: VERSION },
    { type: 'script', language: 'javascript', entry: 'scripts/main.js', uuid: UUID.bpScript, version: VERSION },
  ],
  dependencies: [
    { uuid: UUID.rp, version: VERSION },
    { module_name: '@minecraft/server', version: '2.5.0' },
  ],
});
json(path.join(RP, 'manifest.json'), {
  format_version: 2,
  header: { name: 'pack.name', description: 'pack.description', uuid: UUID.rp, version: VERSION, min_engine_version: [1, 21, 130] },
  modules: [{ type: 'resources', uuid: UUID.rpRes, version: VERSION }],
  dependencies: [{ uuid: UUID.bp, version: VERSION }],
});

// ------------------------------------------------------------------------------------------------
// Validate JSON + package
// ------------------------------------------------------------------------------------------------
for (const f of written) if (f.endsWith('.json')) JSON.parse(fs.readFileSync(f, 'utf8'));
function collect(dir, prefix) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...collect(full, `${prefix}/${e.name}`));
    else out.push({ name: `${prefix}/${e.name}`, data: fs.readFileSync(full) });
  }
  return out;
}
const dist = path.join(ROOT, 'dist');
fs.mkdirSync(dist, { recursive: true });
const name = `MOBS_THAT_LEARN_v${VSTR}.mcaddon`;
const zip = makeZip([...collect(BP, 'MOBS_THAT_LEARN_BP'), ...collect(RP, 'MOBS_THAT_LEARN_RP')]);
fs.writeFileSync(path.join(dist, name), zip);

// Review sheet (not shipped): skins, particle sheet, glyphs, icon.
{
  const sheet = new Canvas(128 * 2 * 2 + 256 + 64 * 4 + 40, 320);
  sheet.rect(0, 0, sheet.w, sheet.h, [60, 60, 70, 255]);
  let x = 0;
  for (const s of Object.values(skins)) {
    for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) { const c = s.get(xx, yy); if (c[3]) sheet.rect(x + xx * 2, yy * 2, 2, 2, c); }
    x += s.w * 2 + 8;
  }
  const iconCv = packIcon(skins.ladder_zombie); sheet.draw(iconCv, x, 0); x += 264;
  const ps = particleSheet();
  for (let yy = 0; yy < 64; yy++) for (let xx = 0; xx < 64; xx++) { const c = ps.get(xx, yy); if (c[3]) sheet.rect(x + xx * 4, yy * 4, 4, 4, c); }
  const gs = glyphSheet();
  for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 48; xx++) { const c = gs.get(xx, yy); if (c[3]) sheet.rect(x + xx * 4, 260 + yy * 4 - 4, 4, 4, c); }
  fs.writeFileSync(path.join(OUT, 'review.png'), sheet.encode());
}
console.log(`Built ${name}: ${(zip.length / 1024).toFixed(0)} KB`);
