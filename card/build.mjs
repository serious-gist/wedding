/* ============================================================
   Renders invitation-mr.html to the two formats we actually send:

     pooja-nagesh-invitation.png   1080 × 1527, for WhatsApp
     pooja-nagesh-invitation.pdf   A5 portrait, for printing

   Usage:  node card/build.mjs

   Both come out of headless Chrome, so what you see when you open
   invitation-mr.html in a browser is exactly what ships.
   ============================================================ */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
const page = 'file:///' + join(here, 'invitation-mr.html').replace(/\\/g, '/');
const png = join(here, 'pooja-nagesh-invitation.png');
const pdf = join(here, 'pooja-nagesh-invitation.pdf');

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

function run(label, args) {
  process.stdout.write(`${label} … `);
  execFileSync(CHROME, [...common, ...args, page], { stdio: 'pipe' });
  console.log('done');
}

try {
  run('PNG (1080×1527)', [
    `--screenshot=${png}`,
    '--window-size=1080,1527',
    '--force-device-scale-factor=1',
  ]);
  run('PDF (A5)', [
    `--print-to-pdf=${pdf}`,
    '--no-pdf-header-footer',
  ]);
} finally {
  rmSync(profile, { recursive: true, force: true });
}

console.log(`\n  ${png}\n  ${pdf}`);
