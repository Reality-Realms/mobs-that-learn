// Procedural, 100% original sound effects synthesised with ffmpeg (aevalsrc).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const N = (i = 0) => `(2*random(${i})-1)`;
const at = (a, body) => `gte(t,${a})*(${body.replaceAll('T', `(t-${a})`)})`;
const click = (a, f = 3100, amp = 1) => at(a, `${amp}*(${N(2)}*exp(-T*380)*0.8+sin(2*PI*${f}*T)*exp(-T*140)*0.6)`);
const thunk = (a, f = 170, amp = 1) => at(a, `${amp}*(sin(2*PI*${f}*T)*exp(-T*45)+${N(3)}*exp(-T*120)*0.5)`);
const knock = (a, f = 420, amp = 1) => at(a, `${amp}*(sin(2*PI*${f}*T)*exp(-T*60)+0.5*sin(2*PI*${f * 2.3}*T)*exp(-T*90)+${N(4)}*exp(-T*200)*0.5)`);
const tink = (a, f, amp = 0.6) => at(a, `${amp}*(sin(2*PI*${f}*T)*exp(-T*28)+sin(2*PI*${f * 2.7}*T)*exp(-T*45)*0.4)`);
const groan = (f, len, wob, amp = 1) => `${amp}*(sin(2*PI*(${f}*t-${f * 0.12}*t*t)+2.2*sin(2*PI*${wob}*t))+0.55*sin(2*PI*2*(${f}*t)+1.5*sin(2*PI*${wob}*t))+0.35*${N(0)})*pow(sin(PI*min(t/${len},1)),0.6)`;

export function soundRecipes() {
  const R = {};
  // --- the learning moment: sub boom, detuned minor chord swelling up, a whispery shimmer on top ---
  const chord = [110, 130.8, 164.8, 220].map((f, i) => `${0.32 - i * 0.04}*(sin(2*PI*${f}*t)+sin(2*PI*${f * 1.006}*t+1))`).join('+');
  R.learn = {
    expr: `1.1*sin(2*PI*(46*t-6*t*t))*exp(-t*2.2)+${N(0)}*exp(-t*9)*0.5+(${chord})*min(t*1.6,1)*exp(-max(t-1.6,0)*2.2)+0.18*${N(1)}*sin(PI*min(t/2.6,1))*(0.6+0.4*sin(2*PI*7*t))`,
    dur: 3.0, filters: 'highpass=f=30,lowpass=f=5200,aecho=0.8:0.6:120|260:0.35|0.22,volume=1.0',
  };
  // --- "they are watching": a breathy two-note whisper ---
  R.watch = {
    expr: `${N(0)}*0.6*sin(PI*min(t/1.2,1))*(0.5+0.5*sin(2*PI*5*t))+0.22*sin(2*PI*(330+20*sin(2*PI*3*t))*t)*sin(PI*min(t/1.2,1))`,
    dur: 1.2, filters: 'bandpass=f=1800:width_type=h:w=2400,aecho=0.7:0.5:90:0.3,volume=0.8',
  };
  // --- forgetting: a soft falling three-note chime ---
  R.forget = {
    expr: [[0, 880], [0.22, 698], [0.44, 523]].map(([a, f]) => at(a, `0.45*sin(2*PI*${f}*T)*exp(-T*3)+0.15*sin(2*PI*${f * 2}*T)*exp(-T*5)`)).join('+'),
    dur: 1.8, filters: 'lowpass=f=4000,aecho=0.8:0.5:150:0.3',
  };
  // --- progress hint: a single low heartbeat-like pulse ---
  R.pulse = { expr: `${at(0, '0.9*sin(2*PI*58*T)*exp(-T*14)')}+${at(0.22, '0.6*sin(2*PI*52*T)*exp(-T*16)')}`, dur: 0.6, filters: 'lowpass=f=600' };
  // --- ladders ---
  R.ladder_place_1 = { expr: `${knock(0, 380, 1)}+${knock(0.06, 300, 0.5)}+${click(0, 1800, 0.4)}`, dur: 0.35, filters: 'lowpass=f=3500,highpass=f=90' };
  R.ladder_place_2 = { expr: `${knock(0, 340, 1)}+${knock(0.05, 410, 0.45)}+${click(0, 1600, 0.4)}`, dur: 0.35, filters: 'lowpass=f=3500,highpass=f=90' };
  R.climb_1 = { expr: `${knock(0, 520, 0.7)}`, dur: 0.18, filters: 'lowpass=f=3000,highpass=f=150' };
  R.climb_2 = { expr: `${knock(0, 470, 0.7)}`, dur: 0.18, filters: 'lowpass=f=3000,highpass=f=150' };
  R.ladder_pull = { expr: `${N(0)}*0.5*sin(PI*min(t/0.3,1))*lt(t,0.3)+${knock(0.28, 360, 0.8)}`, dur: 0.5, filters: 'bandpass=f=1400:width_type=h:w=2400' };
  // --- shields ---
  R.shield_block_1 = { expr: `${thunk(0, 150, 1)}+${knock(0, 260, 0.6)}+${tink(0.005, 1250, 0.35)}`, dur: 0.45, filters: 'lowpass=f=5000,highpass=f=60' };
  R.shield_block_2 = { expr: `${thunk(0, 135, 1)}+${knock(0, 300, 0.6)}+${tink(0.005, 1100, 0.35)}`, dur: 0.45, filters: 'lowpass=f=5000,highpass=f=60' };
  R.shield_raise = { expr: `${N(0)}*0.4*sin(PI*min(t/0.18,1))*lt(t,0.18)+${tink(0.15, 1500, 0.25)}`, dur: 0.35, filters: 'bandpass=f=2000:width_type=h:w=3000' };
  R.shield_break = {
    expr: `${N(0)}*exp(-t*16)*0.9+${thunk(0, 110, 0.9)}+` + [0.02, 0.07, 0.11, 0.18, 0.26].map((a, i) => knock(a, 500 + i * 90, 0.5 - i * 0.06)).join('+') + `+${tink(0.01, 980, 0.3)}`,
    dur: 0.9, filters: 'lowpass=f=5000,highpass=f=60,aecho=0.6:0.4:40:0.2',
  };
  // --- learner voices ---
  R.groan_1 = { expr: groan(96, 1.3, 3.4), dur: 1.3, filters: 'bandpass=f=650:width_type=h:w=900,lowpass=f=1800,aecho=0.6:0.4:40:0.3' };
  R.groan_2 = { expr: groan(82, 1.7, 2.1), dur: 1.7, filters: 'bandpass=f=560:width_type=h:w=800,lowpass=f=1600,aecho=0.6:0.4:50:0.3' };
  R.groan_3 = { expr: groan(118, 1.0, 4.6), dur: 1.0, filters: 'bandpass=f=760:width_type=h:w=1000,lowpass=f=2000,aecho=0.6:0.4:35:0.3' };
  R.hurt = { expr: groan(150, 0.42, 9), dur: 0.42, filters: 'bandpass=f=900:width_type=h:w=1200,lowpass=f=2400' };
  R.death = { expr: `${groan(88, 1.5, 2)}*(1-t/1.5)`, dur: 1.5, filters: 'bandpass=f=500:width_type=h:w=700,lowpass=f=1500,aecho=0.6:0.5:60:0.35' };
  return R;
}

// Event name -> files (sound_definitions entries)
export const SOUND_EVENTS = {
  'mtl.learn': { files: ['learn'], category: 'ui' },
  'mtl.watch': { files: ['watch'], category: 'hostile' },
  'mtl.forget': { files: ['forget'], category: 'ui' },
  'mtl.pulse': { files: ['pulse'], category: 'ui' },
  'mtl.ladder.place': { files: ['ladder_place_1', 'ladder_place_2'], category: 'hostile' },
  'mtl.ladder.climb': { files: ['climb_1', 'climb_2'], category: 'hostile' },
  'mtl.ladder.pull': { files: ['ladder_pull'], category: 'hostile' },
  'mtl.shield.block': { files: ['shield_block_1', 'shield_block_2'], category: 'hostile' },
  'mtl.shield.raise': { files: ['shield_raise'], category: 'hostile' },
  'mtl.shield.break': { files: ['shield_break'], category: 'hostile' },
  'mtl.learner.groan': { files: ['groan_1', 'groan_2', 'groan_3'], category: 'hostile' },
  'mtl.learner.hurt': { files: ['hurt'], category: 'hostile' },
  'mtl.learner.death': { files: ['death'], category: 'hostile' },
};

export function buildSounds(outDir, cacheDir, ffmpeg = 'ffmpeg') {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const R = soundRecipes();
  for (const [name, r] of Object.entries(R)) {
    const filters = [r.filters || 'highpass=f=80,lowpass=f=9000', `afade=t=out:st=${Math.max(0, r.dur - 0.08)}:d=0.08`, 'alimiter=limit=0.95'].join(',');
    const key = crypto.createHash('sha1').update(r.expr + '|' + filters + '|' + r.dur).digest('hex').slice(0, 12);
    const cached = path.join(cacheDir, `${name}_${key}.ogg`);
    if (!fs.existsSync(cached)) {
      const wav = cached.replace(/\.ogg$/, '.wav');
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
        `aevalsrc='${r.expr}':s=44100:d=${r.dur}`, '-af', filters, '-ac', '1', wav]);
      const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', wav, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
      const m = /max_volume:\s*(-?[\d.]+) dB/.exec(probe.stderr || '');
      const gain = Math.min(24, -1 - (m ? parseFloat(m[1]) : -1));
      execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'libvorbis', '-q:a', '3', cached]);
      fs.rmSync(wav);
    }
    fs.copyFileSync(cached, path.join(outDir, `${name}.ogg`));
  }
  return Object.keys(R);
}
