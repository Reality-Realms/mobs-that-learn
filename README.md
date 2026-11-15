# MOBS THAT LEARN (Bedrock add-on)

The mobs watch how each player fights and learn counters to their favourite tricks.
Namespace: `mtl:`. No vanilla files are replaced: the adapted mobs are custom entities, and the rest is done with scripts.

Build: `.tools/node.exe tools/build.mjs` → `dist/MOBS_THAT_LEARN_v<version>.mcaddon`
(needs ffmpeg on PATH for the procedural sounds; results are cached in `.cache/sounds`).

## Layout
- `tools/learners.mjs` – adapted mob model, skins, animation rig, entity JSON, loot
- `tools/fx.mjs` – particles, font glyphs (`font/glyph_E9.png`, U+E900..), pack icon
- `tools/sounds.mjs` – synthesised sounds + sound event table
- `src/scripts/` – gameplay
  - `config.js` tricks, tuning, world settings · `brain.js` per-player learning, learn/forget moments
  - `tricks.js` trick detection · `climber.js` Ladder Zombie climbing · `shield.js` Shield Zombie blocking
  - `mobs.js` swaps zombie spawns for adapted ones, spawns arrivals · `main.js` scan loop + commands

## How the mobs learn
- Tricks only count when hostile mobs are around to see them (pillaring needs a monster within 24 blocks and counts more when one is close; bridging does not count).
- Mobs also learn from their deaths: a kill from the top of a 1-block pillar, or one made during sword spam, gives extra points.
- Keep using a trick after they've learned it and their mastery goes up. Higher mastery means counter mobs replace zombie spawns more often (30% up to 65%).
- Counter mobs keep learning during the fight:
  - A Ladder Zombie that gets knocked off a wall climbs faster next time. It also steps around to reach your pillar from a diagonal.
  - A Shield Zombie lowers its shield for less time if you keep hitting it while the shield is down. If you hit it around the shield, it learns to turn towards you (circling fast still works).
- On game versions that support it, every attacker's direction is checked against the shield separately, so multiplayer is fair.

## Roadmap
1. ✅ Learning system, on-screen messages, Ladder Zombies (pillaring), Shield Zombies (sword spam)
2. Remaining counters (bow, holes, water, walls, running, night)
3. Mob Brain book + settings menu
4. The Mimic boss
5. Polish + in-game guide

## Test commands (until the settings menu exists)
```
/scriptevent mtl:status
/scriptevent mtl:learn pillar|sword|all
/scriptevent mtl:forget pillar|sword|all
/scriptevent mtl:reset
/scriptevent mtl:summon pillar|sword
/scriptevent mtl:speed slow|normal|fast
/scriptevent mtl:forgetting on|off
/scriptevent mtl:counter pillar|sword on|off
```
