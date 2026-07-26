/* ============================================================
   Renders invitation-mr.html to the two formats we actually send:

     pooja-nagesh-invitation.png   1080 × 1527, for WhatsApp
     pooja-nagesh-invitation.pdf   A5 portrait, for printing

   Usage:  node card/build.mjs

   Both come out of headless Chrome, so what you see when you open
   invitation-mr.html in a browser is exactly what ships.
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);

if (!CHROME) {
  console.error('No Chrome or Edge found — install either, or edit the CHROME list.');
  process.exit(1);
}

const here = resolve(import.meta.dirname);
const url = (file) => 'file:///' + join(here, file).replace(/\\/g, '/');

const card = url('invitation-mr.html');
const share = url('share-card.html');
const png = join(here, 'pooja-nagesh-invitation.png');
const pdf = join(here, 'pooja-nagesh-invitation.pdf');
const og = join(here, '..', 'images', 'og-cover.jpg');
// Scratch file: Chrome screenshots PNG, we ship JPEG.
const ogPng = join(tmpdir(), 'og-cover-raw.png');

// A throwaway profile keeps this from touching the user's real Chrome.
const profile = mkdtempSync(join(tmpdir(), 'card-'));

const common = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--hide-scrollbars',
  '--allow-file-access-from-files',   // the card pulls in ../js/qr.js
  '--virtual-time-budget=8000',       // let fonts and the QR settle
  `--user-data-dir=${profile}`,
];

function run(label, target, args) {
  process.stdout.write(`${label} … `);
  execFileSync(CHROME, [...common, ...args, target], { stdio: 'pipe' });
  console.log('done');
}

try {
  run('PNG (1080×1527)', card, [
    `--screenshot=${png}`,
    '--window-size=1080,1527',
    '--force-device-scale-factor=1',
  ]);
  run('PDF (A5)', card, [
    `--print-to-pdf=${pdf}`,
    '--no-pdf-header-footer',
  ]);
  // Screenshot to a scratch PNG, then re-encode as JPEG — see png-to-jpeg.html.
  run('OG image (1200×630)', share, [
    `--screenshot=${ogPng}`,
    '--window-size=1200,630',
    '--force-device-scale-factor=1',
  ]);

  process.stdout.write('OG image → jpeg … ');
  const converter = url('png-to-jpeg.html') +
    '?q=0.86&src=' + encodeURIComponent('file:///' + ogPng.replace(/\\/g, '/'));
  const dom = execFileSync(CHROME, [...common, '--dump-dom', converter],
    { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

  const encoded = dom.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/);
  if (!encoded) {
    throw new Error('JPEG conversion failed: ' + (dom.match(/ERROR: [^<]*/) || ['no data URI'])[0]);
  }
  writeFileSync(og, Buffer.from(encoded[1], 'base64'));
  rmSync(ogPng, { force: true });
  console.log('done');
} finally {
  rmSync(profile, { recursive: true, force: true });
}

for (const file of [png, pdf, og]) {
  console.log(`  ${file}  (${(statSync(file).size / 1024).toFixed(0)} KB)`);
}
