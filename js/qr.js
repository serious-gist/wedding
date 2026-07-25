/* ============================================================
   qr.js — minimal QR Code generator (no dependencies)

   Model 2 · byte mode · error correction level L · versions 1–5.
   Versions 1–5 at level L use a single error-correction block, so no
   block interleaving is needed. That covers up to 106 bytes, which is
   ample for a folder link.

   Usage:  QR.render(canvasEl, "https://...", { margin: 4 });
   ============================================================ */

window.QR = (function () {
  'use strict';

  /* ---------- GF(256) tables, primitive polynomial 0x11d ---------- */
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
  }

  /* ---------- Reed–Solomon ---------- */
  function rsGenerator(degree) {
    var poly = [1];
    for (var i = 0; i < degree; i++) {
      var next = new Array(poly.length + 1);
      for (var k = 0; k < next.length; k++) next[k] = 0;
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];                      // × x
        next[j + 1] ^= gfMul(poly[j], EXP[i]);   // × α^i
      }
      poly = next;
    }
    return poly;
  }

  function rsRemainder(data, ecLength) {
    var gen = rsGenerator(ecLength);
    var buf = new Uint8Array(data.length + ecLength);
    buf.set(data);
    for (var i = 0; i < data.length; i++) {
      var factor = buf[i];
      if (factor === 0) continue;
      for (var j = 0; j < gen.length; j++) buf[i + j] ^= gfMul(gen[j], factor);
    }
    return buf.subarray(data.length);
  }

  /* ---------- Version tables (level L, single block) ---------- */
  // version -> [data codewords, ec codewords]
  var CAPACITY = {
    1: [19, 7], 2: [34, 10], 3: [55, 15], 4: [80, 20], 5: [108, 26]
  };
  // version -> alignment-pattern centre coordinates
  var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30] };

  var G15 = 0x537;        // BCH(15,5) generator
  var G15_MASK = 0x5412;  // format-info XOR mask
  var EC_LEVEL_L = 1;     // format-info bits for level L

  function bchDigits(value) {
    var digits = 0;
    while (value !== 0) { digits++; value >>>= 1; }
    return digits;
  }

  function formatBits(maskPattern) {
    var data = (EC_LEVEL_L << 3) | maskPattern;
    var rest = data << 10;
    while (bchDigits(rest) - bchDigits(G15) >= 0) {
      rest ^= G15 << (bchDigits(rest) - bchDigits(G15));
    }
    return ((data << 10) | rest) ^ G15_MASK;
  }

  /* ---------- Mask patterns ---------- */
  function maskAt(pattern, i, j) {
    switch (pattern) {
      case 0: return (i + j) % 2 === 0;
      case 1: return i % 2 === 0;
      case 2: return j % 3 === 0;
      case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
      case 5: return (i * j) % 2 + (i * j) % 3 === 0;
      case 6: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
      case 7: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
      default: throw new Error('bad mask ' + pattern);
    }
  }

  /* ---------- Encoding ---------- */
  function utf8Bytes(text) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text);
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return new Uint8Array(out);
  }

  function pickVersion(byteLength) {
    for (var v = 1; v <= 5; v++) {
      // 4 bits mode + 8 bits length indicator = 12 bits of overhead
      if (byteLength * 8 + 12 <= CAPACITY[v][0] * 8) return v;
    }
    throw new Error('QR: payload too long (max 106 bytes)');
  }

  function buildCodewords(bytes, version) {
    var dataCount = CAPACITY[version][0];
    var bits = [];
    function push(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }

    push(0b0100, 4);          // byte mode
    push(bytes.length, 8);    // character count (8 bits for versions 1–9)
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);

    var capacity = dataCount * 8;
    push(0, Math.min(4, capacity - bits.length));   // terminator
    while (bits.length % 8 !== 0) bits.push(0);     // byte align

    var pad = [0xec, 0x11], p = 0;
    while (bits.length < capacity) push(pad[p++ % 2], 8);

    var data = new Uint8Array(dataCount);
    for (var b = 0; b < dataCount; b++) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b * 8 + k];
      data[b] = byte;
    }

    var ec = rsRemainder(data, CAPACITY[version][1]);
    var all = new Uint8Array(data.length + ec.length);
    all.set(data);
    all.set(ec, data.length);
    return all;
  }

  /* ---------- Module placement ---------- */
  function blankModules(size) {
    var m = new Array(size);
    for (var r = 0; r < size; r++) {
      m[r] = new Array(size);
      for (var c = 0; c < size; c++) m[r][c] = null;
    }
    return m;
  }

  function placeFinder(m, row, col) {
    var size = m.length;
    for (var r = -1; r <= 7; r++) {
      if (row + r < 0 || row + r >= size) continue;
      for (var c = -1; c <= 7; c++) {
        if (col + c < 0 || col + c >= size) continue;
        m[row + r][col + c] =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      }
    }
  }

  function placeAlignment(m, version) {
    var pos = ALIGN[version];
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var row = pos[i], col = pos[j];
        if (m[row][col] !== null) continue;   // overlaps a finder pattern
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            m[row + r][col + c] =
              r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          }
        }
      }
    }
  }

  function placeTiming(m) {
    var size = m.length;
    for (var r = 8; r < size - 8; r++) {
      if (m[r][6] === null) m[r][6] = r % 2 === 0;
    }
    for (var c = 8; c < size - 8; c++) {
      if (m[6][c] === null) m[6][c] = c % 2 === 0;
    }
  }

  function reserveFormatArea(m) {
    var size = m.length;
    for (var i = 0; i < 15; i++) {
      if (i < 6) m[i][8] = false;
      else if (i < 8) m[i + 1][8] = false;
      else m[size - 15 + i][8] = false;

      if (i < 8) m[8][size - i - 1] = false;
      else if (i < 9) m[8][15 - i] = false;
      else m[8][14 - i] = false;
    }
    m[8][8] = false;
    m[size - 8][8] = true;   // fixed dark module
  }

  function writeFormat(m, maskPattern) {
    var size = m.length;
    var bits = formatBits(maskPattern);
    for (var i = 0; i < 15; i++) {
      var on = ((bits >> i) & 1) === 1;
      if (i < 6) m[i][8] = on;
      else if (i < 8) m[i + 1][8] = on;
      else m[size - 15 + i][8] = on;

      if (i < 8) m[8][size - i - 1] = on;
      else if (i < 9) m[8][15 - i] = on;
      else m[8][14 - i] = on;
    }
    m[size - 8][8] = true;
  }

  function mapData(m, codewords, maskPattern) {
    var size = m.length;
    var inc = -1, row = size - 1, bitIndex = 7, byteIndex = 0;

    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;   // skip the vertical timing column
      for (;;) {
        for (var c = 0; c < 2; c++) {
          if (m[row][col - c] !== null) continue;
          var dark = false;
          if (byteIndex < codewords.length) {
            dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
          }
          if (maskAt(maskPattern, row, col - c)) dark = !dark;
          m[row][col - c] = dark;
          bitIndex--;
          if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
        }
        row += inc;
        if (row < 0 || row >= size) { row -= inc; inc = -inc; break; }
      }
    }
  }

  /* ---------- Mask selection (ISO/IEC 18004 penalty rules) ---------- */
  function penalty(m) {
    var size = m.length, score = 0, r, c, i;

    // Rule 1 — runs of 5+ same-colour modules in a row or column
    for (r = 0; r < size; r++) {
      for (var axis = 0; axis < 2; axis++) {
        var run = 1;
        for (c = 1; c < size; c++) {
          var prev = axis === 0 ? m[r][c - 1] : m[c - 1][r];
          var cur = axis === 0 ? m[r][c] : m[c][r];
          if (cur === prev) {
            run++;
            if (run === 5) score += 3;
            else if (run > 5) score += 1;
          } else run = 1;
        }
      }
    }

    // Rule 2 — 2×2 blocks of the same colour
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }

    // Rule 3 — 1:1:3:1:1 finder-like patterns
    var A = [true, false, true, true, true, false, true, false, false, false, false];
    var B = [false, false, false, false, true, false, true, true, true, false, true];
    for (r = 0; r < size; r++) {
      for (c = 0; c <= size - 11; c++) {
        var hitA = true, hitB = true, hitAv = true, hitBv = true;
        for (i = 0; i < 11; i++) {
          if (m[r][c + i] !== A[i]) hitA = false;
          if (m[r][c + i] !== B[i]) hitB = false;
          if (m[c + i][r] !== A[i]) hitAv = false;
          if (m[c + i][r] !== B[i]) hitBv = false;
        }
        if (hitA) score += 40;
        if (hitB) score += 40;
        if (hitAv) score += 40;
        if (hitBv) score += 40;
      }
    }

    // Rule 4 — deviation from 50% dark
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c]) dark++;
    var ratio = Math.abs(dark * 100 / (size * size) - 50);
    score += Math.floor(ratio / 5) * 10;

    return score;
  }

  /* ---------- Public API ---------- */
  function matrix(text) {
    var bytes = utf8Bytes(String(text));
    var version = pickVersion(bytes.length);
    var codewords = buildCodewords(bytes, version);
    var size = version * 4 + 17;

    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var m = blankModules(size);
      placeFinder(m, 0, 0);
      placeFinder(m, size - 7, 0);
      placeFinder(m, 0, size - 7);
      placeAlignment(m, version);
      placeTiming(m);
      reserveFormatArea(m);
      mapData(m, codewords, mask);
      writeFormat(m, mask);

      var score = penalty(m);
      if (score < bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  function render(canvas, text, options) {
    var opts = options || {};
    var margin = opts.margin == null ? 4 : opts.margin;
    var dark = opts.dark || '#3b302b';
    var light = opts.light || '#ffffff';

    var m = matrix(text);
    var size = m.length + margin * 2;
    var ctx = canvas.getContext('2d');

    // One canvas pixel per module; CSS scales it up crisply.
    canvas.width = size;
    canvas.height = size;

    ctx.fillStyle = light;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = dark;
    for (var r = 0; r < m.length; r++) {
      for (var c = 0; c < m.length; c++) {
        if (m[r][c]) ctx.fillRect(c + margin, r + margin, 1, 1);
      }
    }
    return canvas;
  }

  return { matrix: matrix, render: render };
})();
