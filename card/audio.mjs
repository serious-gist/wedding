/* ============================================================
   सनई-चौघडा — the soundtrack for the invitation video, synthesised.

   This is the same piece the website plays: an original melody in the
   Yaman idiom over a tanpura drone, with the chaughada underneath.
   Written rather than sampled because every well-known Marathi wedding
   song is under copyright and cannot ship in a public repository.

   Synthesised here in plain Node rather than in the browser: the first
   attempt used OfflineAudioContext, but its rendering is genuinely
   asynchronous and headless Chrome's --virtual-time-budget does not
   wait for it, so the page was dumped before the audio existed.

   Exports renderWav(seconds) -> Buffer (16-bit stereo WAV).
   ============================================================ */

const RATE = 44100;

const SA = 261.63;                                          // C4
const YAMAN = [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 27 / 16, 15 / 8, 2];
const PHRASES = [
  [[0, 2], [1, 1], [2, 1], [3, 2], [2, 2], [-1, 1]],
  [[4, 2], [3, 1], [2, 1], [1, 2], [0, 3], [-1, 1]],
  [[4, 1], [5, 1], [6, 2], [7, 3], [6, 2], [-1, 1]],
  [[6, 1], [5, 1], [4, 2], [3, 1], [2, 1], [1, 1], [0, 3]],
];
const BEAT = 0.52;

/* A shehnai is a double reed: bright and buzzy, strong upper harmonics.
   Adding them directly is cheaper and steadier than filtering a sawtooth,
   and the roll-off is what actually decides the timbre. */
const REED = [1, 0.72, 0.55, 0.42, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05];

function envelope(t, duration) {
  const attack = 0.1;
  const release = 0.34;
  if (t < attack) return t / attack;
  if (t > duration - release) return Math.max(0, (duration - t) / release);
  return 1;
}

function addShehnai(buf, freq, start, duration, gain) {
  const from = Math.floor(start * RATE);
  const to = Math.min(buf.length, Math.floor((start + duration) * RATE));

  for (let i = from; i < to; i++) {
    const t = (i - from) / RATE;
    // Breath: the pitch is never perfectly steady.
    const vibrato = 1 + 0.011 * Math.sin(2 * Math.PI * 5.4 * t);
    const phase = 2 * Math.PI * freq * vibrato * t;

    let sample = 0;
    for (let h = 0; h < REED.length; h++) {
      sample += REED[h] * Math.sin(phase * (h + 1));
    }
    buf[i] += (sample / 4.2) * envelope(t, duration) * gain;
  }
}

function addDrone(buf, freq, seconds, gain) {
  const to = Math.min(buf.length, Math.floor(seconds * RATE));
  for (let i = 0; i < to; i++) {
    const t = i / RATE;
    const phase = 2 * Math.PI * freq * t;
    // Odd harmonics only, falling off fast — a soft, hollow tone.
    const sample = Math.sin(phase) + Math.sin(3 * phase) / 9 + Math.sin(5 * phase) / 25;
    // Fade in over the first two seconds, out over the last two.
    const fade = Math.min(1, t / 2, Math.max(0, (seconds - t) / 2));
    buf[i] += sample * gain * fade;
  }
}

function addDrum(buf, freq, start, gain) {
  const from = Math.floor(start * RATE);
  const length = Math.floor(0.45 * RATE);

  for (let i = 0; i < length; i++) {
    const index = from + i;
    if (index < 0 || index >= buf.length) continue;
    const t = i / RATE;

    // The skin: pitch collapses from the strike to the body note.
    const pitch = freq * (1 + 1.4 * Math.exp(-t * 26));
    const body = Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * 7.5);

    // The stick: a very short noise transient on top.
    const stick = t < 0.05 ? (Math.random() * 2 - 1) * Math.exp(-t * 90) * 0.35 : 0;

    buf[index] += (body + stick) * gain;
  }
}

/* A long feedback delay, for the hall the shehnai is playing in. */
function addHall(buf, time = 0.42, feedback = 0.3, wet = 0.4) {
  const step = Math.floor(time * RATE);
  for (let i = step; i < buf.length; i++) {
    buf[i] += buf[i - step] * feedback * wet;
  }
}

export function renderWav(seconds) {
  const frames = Math.ceil(seconds * RATE);
  const buf = new Float64Array(frames);

  // Tanpura drone underneath the whole piece.
  addDrone(buf, SA / 2, seconds, 0.05);
  addDrone(buf, (SA / 2) * 1.5, seconds, 0.045);
  addDrone(buf, SA, seconds, 0.022);

  // Phrases laid end to end until the piece is long enough.
  let at = 0.5;
  let phrase = 0;
  while (at < seconds - 1.5) {
    const notes = PHRASES[phrase % PHRASES.length];
    const beats = notes.reduce((sum, note) => sum + note[1], 0);

    for (let b = 0; b < beats; b++) {
      if (b % 4 === 0) addDrum(buf, 74, at + b * BEAT, 0.5);
      else if (b % 4 === 2) addDrum(buf, 112, at + b * BEAT, 0.3);
    }

    let offset = 0;
    for (const [degree, length] of notes) {
      const span = length * BEAT;
      if (degree >= 0) {
        // The third phrase is the one that climbs.
        const octave = phrase % PHRASES.length === 2 ? 2 : 1;
        addShehnai(buf, SA * YAMAN[degree] * octave, at + offset, span * 0.92, 0.5);
      }
      offset += span;
    }

    at += offset + BEAT;
    phrase++;
  }

  addHall(buf);

  // Normalise to a comfortable level rather than trusting the sum.
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(buf[i]));
  const scale = peak > 0 ? 0.82 / peak : 1;

  // 16-bit stereo WAV.
  const bytes = frames * 2 * 2;
  const out = Buffer.alloc(44 + bytes);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + bytes, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(2, 22);
  out.writeUInt32LE(RATE, 24);
  out.writeUInt32LE(RATE * 4, 28);
  out.writeUInt16LE(4, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(bytes, 40);

  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const value = Math.max(-1, Math.min(1, buf[i] * scale));
    const sample = Math.round(value * 32767);
    out.writeInt16LE(sample, offset);
    out.writeInt16LE(sample, offset + 2);
    offset += 4;
  }
  return out;
}
