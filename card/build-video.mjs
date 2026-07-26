/* ============================================================
   Builds the WhatsApp invitation video.

     card/pooja-nagesh-invitation.mp4   1080 × 1920, ~32s

   Usage:  node card/build-video.mjs

   How it works, and why:

     1. Chrome screenshots each scene of video-scenes.html as a still.
        Rendering every animation frame through Chrome would mean ~800
        browser launches; ffmpeg can do the motion far better.
     2. audio.mjs synthesises the sanai-chaughada to a WAV.
     3. ffmpeg gives each still a slow push-in, crossfades between
        them, and lays the audio underneath.

   Requires ffmpeg on PATH (or edit FFMPEG below).
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { renderWav } from './audio.mjs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

if (!CHROME) {
  console.error('No Chrome or Edge found.');
  process.exit(1);
}

function findFfmpeg() {
  try {
    return execFileSync('where', ['ffmpeg'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
  } catch {
    return null;
  }
}
const FFMPEG = findFfmpeg();
if (!FFMPEG) {
  console.error('ffmpeg not found on PATH. Install it, or set FFMPEG in this script.');
  process.exit(1);
}

const W = 1080;
const H = 1920;
const SCENES = 8;
const HOLD = 3.6;        // seconds each scene is on screen
const FADE = 0.9;        // crossfade length
const here = resolve(import.meta.dirname);
const work = mkdtempSync(join(tmpdir(), 'vid-'));
const profile = mkdtempSync(join(tmpdir(), 'vidprof-'));
const out = join(here, 'pooja-nagesh-invitation.mp4');

const pageUrl = (query) =>
  'file:///' + join(here, 'video-scenes.html').replace(/\\/g, '/') + query;

const chromeArgs = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--hide-scrollbars', '--allow-file-access-from-files',
  '--virtual-time-budget=8000', `--user-data-dir=${profile}`,
];

try {
  /* ---- 1 · the stills ---- */
  const frames = [];
  for (let i = 1; i <= SCENES; i++) {
    const file = join(work, `scene${String(i).padStart(2, '0')}.png`);
    process.stdout.write(`scene ${i}/${SCENES} … `);
    execFileSync(CHROME, [
      ...chromeArgs,
      `--screenshot=${file}`,
      `--window-size=${W},${H}`,
      '--force-device-scale-factor=1',
      pageUrl(`?scene=${i}`),
    ], { stdio: 'pipe' });
    frames.push(file);
    console.log('ok');
  }

  /* ---- 2 · the soundtrack ---- */
  const total = SCENES * HOLD - (SCENES - 1) * FADE;
  process.stdout.write('soundtrack … ');
  const wavFile = join(work, 'track.wav');
  writeFileSync(wavFile, renderWav(total + 1));
  console.log(`ok (${(statSync(wavFile).size / 1024 / 1024).toFixed(1)} MB)`);

  /* ---- 3 · assemble ---- */
  // Each still gets a slow push-in, then they crossfade into one another.
  const inputs = [];
  frames.forEach((f) => {
    inputs.push('-loop', '1', '-t', String(HOLD), '-i', f);
  });
  inputs.push('-i', wavFile);

  const filters = [];
  frames.forEach((_, i) => {
    // zoompan needs a per-frame zoom expression; 'on' is the output frame index.
    filters.push(
      `[${i}:v]scale=${W * 2}:-1,` +
      `zoompan=z='1+0.06*on/(${HOLD}*25)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
      `d=${Math.round(HOLD * 25)}:s=${W}x${H}:fps=25,setsar=1[v${i}]`
    );
  });

  // Chain the crossfades: v0+v1 -> x1, x1+v2 -> x2, …
  let last = 'v0';
  for (let i = 1; i < frames.length; i++) {
    const offset = (HOLD - FADE) * i;
    const label = i === frames.length - 1 ? 'vout' : `x${i}`;
    filters.push(`[${last}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset}[${label}]`);
    last = label;
  }

  process.stdout.write('encoding … ');
  execFileSync(FFMPEG, [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    '-map', `${frames.length}:a`,
    '-t', String(total),
    '-af', `afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, total - 2)}:d=2`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '23',
    '-pix_fmt', 'yuv420p',          // required for WhatsApp / QuickTime
    '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '128k',
    out,
  ], { stdio: 'pipe' });
  console.log('ok');

  console.log(`\n  ${out}  (${(statSync(out).size / 1024 / 1024).toFixed(1)} MB, ~${total.toFixed(0)}s)`);
} finally {
  rmSync(work, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
}
