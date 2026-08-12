/* ============================================================
   Pooja & Sagar — Wedding Invitation
   Vanilla JS, no dependencies. Progressive enhancement:
   without JS the invitation is still readable (see the no-JS
   fallback in index.html).
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     CONFIG — edit this block to personalise the invitation
     ============================================================ */
  var CONFIG = {
    // Saturday, 12 December 2026, ceremony at 4:30 PM IST.
    // Written with the +05:30 offset rather than as local components: this is
    // one absolute moment, so the countdown and the calendar file agree for a
    // guest reading from anywhere in the world.
    weddingDate: new Date('2026-12-12T16:30:00+05:30'),
    weddingEnd: new Date('2026-12-12T23:00:00+05:30'),

    // Venue used for the embedded map and the "Open in Google Maps" button.
    venueQuery: '36 Gun Lawns, Gut No. 118, Highway, opp. Southcity, near AS Club Bridge, ' +
                'CIDCO Waluj Mahanagar 2, Waluj, Tisgaon, Chhatrapati Sambhajinagar, Maharashtra 431136',

    // Shared folder where guests upload their photos and videos from the
    // ceremonies. Encoded into the QR code in the "Share Your Photos" section.
    // REPLACE THIS with your own Google Drive (or Photos) folder link, shared
    // with "Anyone with the link can add/upload".
    // Keep it short — a link over ~100 characters will not fit in the QR, and
    // the section falls back to showing just the link.
    photoDriveUrl: 'https://drive.google.com/drive/folders/REPLACE-WITH-FOLDER-ID',

    // Optional: drop an mp3 you have the rights to at this path and it will
    // be used as the background music. If the file is missing, a shehnai
    // mangalvadya piece is synthesised instead — see Music() below for why
    // it is synthesised rather than a recording.
    musicSrc: 'audio/ambience.mp3',

    // Optional: a form endpoint (Formspree, Getform, your own API…).
    // Leave null to store RSVPs in localStorage only.
    rsvpEndpoint: null
  };

  /* ============================================================
     Helpers
     ============================================================ */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ============================================================
     0 · Language
     ============================================================ */
  var LANGS = ['en', 'mr'];
  var lang = 'en';

  // Marathi convention is Devanagari numerals; the countdown is generated at
  // runtime, so its digits are transliterated rather than translated.
  var DEV_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

  function digits(value) {
    if (lang !== 'mr') return String(value);
    return String(value).replace(/[0-9]/g, function (d) { return DEV_DIGITS[+d]; });
  }

  // Look up a string, with {placeholder} substitution.
  function t(key, vars) {
    var table = (window.I18N && window.I18N[lang]) || {};
    var fallback = (window.I18N && window.I18N.en) || {};
    var str = table[key] != null ? table[key] : fallback[key];
    if (str == null) return '';
    if (vars) {
      str = str.replace(/\{(\w+)\}/g, function (whole, name) {
        return vars[name] != null ? vars[name] : whole;
      });
    }
    return str;
  }

  function detectLang() {
    try {
      var saved = localStorage.getItem('lang');
      if (LANGS.indexOf(saved) > -1) return saved;
    } catch (err) { /* private mode */ }

    // Offer Marathi first to guests whose browser is already set to it.
    var prefs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < prefs.length; i++) {
      if (/^mr\b/i.test(prefs[i])) return 'mr';
    }
    return 'en';
  }

  var ATTR_MAP = {
    'i18nPlaceholder': 'placeholder',
    'i18nAriaLabel': 'aria-label',
    'i18nAlt': 'alt',
    'i18nCaption': 'data-caption'
  };

  /* Split text into per-character spans for the staggered name reveal.

     Devanagari must be split by grapheme cluster, not by code unit: "पूजा" is
     प + ू + ज + ा, and separating a matra from its consonant renders nonsense.
     Without Intl.Segmenter there is no safe way to do that, so the text is
     simply left whole and the animation is skipped. */
  function splitLetters(el) {
    if (typeof Intl === 'undefined' || !Intl.Segmenter) return;

    var text = el.textContent;
    var segmenter = new Intl.Segmenter(lang, { granularity: 'grapheme' });
    var frag = document.createDocumentFragment();
    var i = 0;

    Array.from(segmenter.segment(text)).forEach(function (part) {
      var span = document.createElement('span');
      span.className = 'letter';
      span.textContent = part.segment;
      span.style.transitionDelay = (0.24 + i * 0.055).toFixed(3) + 's';
      frag.appendChild(span);
      i++;
    });

    el.textContent = '';
    el.appendChild(frag);
  }

  /* Split text into per-word spans so a line arrives a word at a time.

     Unlike splitLetters this is safe in both scripts: Devanagari separates
     words with ordinary spaces, and nothing inside a word is touched. */
  function splitWords(el) {
    var parts = el.textContent.split(/(\s+)/);
    var frag = document.createDocumentFragment();
    var i = 0;

    parts.forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
        return;
      }
      var span = document.createElement('span');
      span.className = 'word';
      span.textContent = part;
      span.style.transitionDelay = (0.12 + i * 0.06).toFixed(3) + 's';
      frag.appendChild(span);
      i++;
    });

    el.textContent = '';
    el.appendChild(frag);
  }

  function applyTranslations(root) {
    var scope = root || document;

    $$('[data-i18n]', scope).forEach(function (el) {
      el.textContent = t(el.dataset.i18n);
      if (el.hasAttribute('data-letters')) splitLetters(el);
      else if (el.hasAttribute('data-words')) splitWords(el);
    });
    $$('[data-i18n-html]', scope).forEach(function (el) {
      el.innerHTML = t(el.dataset.i18nHtml);
    });

    Object.keys(ATTR_MAP).forEach(function (dataKey) {
      var selector = '[data-' + dataKey.replace(/[A-Z]/g, function (c) {
        return '-' + c.toLowerCase();
      }) + ']';
      $$(selector, scope).forEach(function (el) {
        el.setAttribute(ATTR_MAP[dataKey], t(el.dataset[dataKey]));
      });
    });
  }

  function setLang(code, opts) {
    if (LANGS.indexOf(code) === -1) code = 'en';
    lang = code;

    document.documentElement.lang = code;
    document.documentElement.setAttribute('data-lang', code);

    applyTranslations();

    document.title = t('meta.title');
    var desc = $('meta[name="description"]');
    if (desc) desc.setAttribute('content', t('meta.description'));

    // Buttons whose label depends on both language and device / state.
    setRevealLabel();
    refreshMusicLabel();
    langHooks.forEach(function (fn) { fn(); });

    $$('.langswitch__btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.dataset.lang === code ? 'true' : 'false');
    });

    if (!opts || opts.persist !== false) {
      try { localStorage.setItem('lang', code); } catch (err) { /* private mode */ }
    }
  }

  function setupLangSwitch() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.langswitch__btn');
      if (!btn) return;
      setLang(btn.dataset.lang);
    });
  }

  /* ============================================================
     0b · Language gate — the first screen a new guest sees
     ============================================================ */
  function setupLangGate() {
    var gate = $('#langGate');
    if (!gate) return;

    var chosen = null;
    try { chosen = localStorage.getItem('lang'); } catch (err) { /* private mode */ }

    // A returning guest already told us; don't ask again.
    if (LANGS.indexOf(chosen) > -1) {
      gate.hidden = true;
      return;
    }

    function close(code) {
      setLang(code);
      gate.classList.add('is-closing');
      setTimeout(function () {
        gate.hidden = true;
        var reveal = $('#revealBtn');
        if (reveal) reveal.focus({ preventScroll: true });
      }, reducedMotion ? 0 : 700);
    }

    $$('.langgate__btn', gate).forEach(function (btn) {
      btn.addEventListener('click', function () { close(btn.dataset.lang); });
    });

    // Keep focus inside the gate — it is the only thing on screen.
    gate.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var focusable = $$('.langgate__btn', gate);
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // Focus the dialog itself, not a language button — focusing a button
    // would make that language look pre-selected.
    var panel = $('.langgate__panel', gate);
    if (panel) {
      panel.setAttribute('tabindex', '-1');
      panel.focus({ preventScroll: true });
    }
  }

  // Hooks registered by sections that render text at runtime, or whose
  // layout depends on the length of translated labels.
  var langHooks = [];
  function onLang(fn) { langHooks.push(fn); }
  var refreshMusicLabel = function () {};

  function toast(message) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-shown');
    clearTimeout(el._timer);
    el._timer = setTimeout(function () { el.classList.remove('is-shown'); }, 2400);
  }

  /* ============================================================
     1 · Device detection for the reveal button label
     ============================================================ */
  function isTouchDevice() {
    var coarse = window.matchMedia('(pointer: coarse)').matches;
    var noHover = window.matchMedia('(hover: none)').matches;
    var narrow = window.innerWidth <= 820;
    return (coarse && noHover) || (narrow && 'ontouchstart' in window);
  }

  function setRevealLabel() {
    var label = $('#revealBtnLabel');
    if (label) label.textContent = t(isTouchDevice() ? 'hero.reveal.tap' : 'hero.reveal.click');
  }

  /* ============================================================
     2 · Floating petals (hero canvas)
     ============================================================ */
  function Petals(canvas) {
    var ctx = canvas.getContext('2d');
    var petals = [];
    var raf = null;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;
    // Blush rose petals plus marigold — the flower of an Indian wedding.
    var KINDS = [
      { color: 'rgba(232,200,196,', shape: 'petal' },
      { color: 'rgba(213,154,149,', shape: 'petal' },
      { color: 'rgba(255,250,244,', shape: 'petal' },
      { color: 'rgba(231,154,46,',  shape: 'marigold' },
      { color: 'rgba(243,183,87,',  shape: 'marigold' },
      { color: 'rgba(226,205,164,', shape: 'marigold' }
    ];

    /* Akshata — whole rice grains coloured with haldi and kunku, thrown over
       the couple on "शुभमंगल सावधान". Plain rice, turmeric and vermilion,
       with a few petals carried along in the same handful. */
    var AKSHATA = [
      { color: 'rgba(255,252,246,', shape: 'grain' },
      { color: 'rgba(250,244,230,', shape: 'grain' },
      { color: 'rgba(229,177,37,',  shape: 'grain' },
      { color: 'rgba(242,217,138,', shape: 'grain' },
      { color: 'rgba(180,35,42,',   shape: 'grain' },
      { color: 'rgba(212,105,107,', shape: 'grain' },
      { color: 'rgba(232,200,196,', shape: 'petal' }
    ];

    function resize() {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seed() {
      var count = Math.round(Math.min(34, Math.max(14, w / 46)));
      petals = [];
      for (var i = 0; i < count; i++) petals.push(make(true));
    }

    function make(anywhere) {
      var kind = KINDS[(Math.random() * KINDS.length) | 0];
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : -30,
        size: 6 + Math.random() * 12,
        speed: 0.18 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.5,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.012,
        sway: 0.4 + Math.random() * 1.1,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.35 + Math.random() * 0.45,
        color: kind.color,
        shape: kind.shape,
        vx: 0,
        vy: 0,
        temp: false
      };
    }

    /* The akshata thrown as the seal breaks. These carry an extra
       velocity that decays into the ambient fall, and are discarded rather
       than recycled once they drop away. */
    function burst(originX, originY, count) {
      for (var i = 0; i < count; i++) {
        var p = make(true);
        var kind = AKSHATA[(Math.random() * AKSHATA.length) | 0];
        p.color = kind.color;
        p.shape = kind.shape;

        // Rice is thrown, not dropped: a wider, faster spread than a petal.
        var angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.8;
        var power = 5 + Math.random() * 11;
        p.x = originX + (Math.random() - 0.5) * 40;
        p.y = originY + (Math.random() - 0.5) * 24;
        p.vx = Math.cos(angle) * power;
        p.vy = Math.sin(angle) * power;
        p.size = 7 + Math.random() * 13;
        p.spin = (Math.random() - 0.5) * 0.06;
        p.alpha = 0.55 + Math.random() * 0.45;
        p.temp = true;
        petals.push(p);
      }
    }

    function drawPetal(p) {
      var s = p.size;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color + '1)';

      if (p.shape === 'grain') {
        // A rice grain: a short, blunt-ended ellipse.
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.19, s * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'marigold') {
        // A ring of small blobs reads as a marigold once it is in motion.
        var r = s * 0.34;
        for (var i = 0; i < 7; i++) {
          var a = (i / 7) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(Math.cos(a) * r, Math.sin(a) * r, s * 0.26, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -s / 2);
        ctx.bezierCurveTo(s / 2, -s / 2, s / 2, s / 2, 0, s / 2);
        ctx.bezierCurveTo(-s / 2, s / 2, -s / 2, -s / 2, 0, -s / 2);
        ctx.fill();
      }
      ctx.restore();
    }

    var last = 0;
    function frame(time) {
      var dt = Math.min(2.5, (time - last) / 16.67) || 1;
      last = time;
      ctx.clearRect(0, 0, w, h);

      for (var i = 0; i < petals.length; i++) {
        var p = petals[i];
        p.y += p.speed * dt;
        p.phase += 0.012 * dt;
        p.x += (p.drift + Math.sin(p.phase) * p.sway * 0.4) * dt;
        p.angle += p.spin * dt;

        if (p.vx || p.vy) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          var drag = Math.pow(0.955, dt);
          p.vx *= drag;
          p.vy = p.vy * drag + 0.16 * dt;      // gravity pulls it back into the fall
          if (Math.abs(p.vx) < 0.05) p.vx = 0;
          if (Math.abs(p.vy) < 0.05) p.vy = 0;
        }

        if (p.y - p.size > h) {
          if (p.temp) { petals.splice(i, 1); i--; continue; }
          petals[i] = make(false);
        } else if (p.x < -40) p.x = w + 30;
        else if (p.x > w + 40) p.x = -30;
        drawPetal(p);
      }
      raf = requestAnimationFrame(frame);
    }

    return {
      start: function () {
        if (reducedMotion || raf !== null) return;
        resize();
        seed();
        raf = requestAnimationFrame(frame);
      },
      burst: function (clientX, clientY, count) {
        if (reducedMotion || raf === null) return;
        var box = canvas.getBoundingClientRect();
        burst(clientX - box.left, clientY - box.top, count || 60);
      },
      stop: function () {
        if (raf !== null) cancelAnimationFrame(raf);
        raf = null;
        ctx.clearRect(0, 0, w, h);
      },
      resize: function () {
        if (raf === null) return;
        resize();
        seed();
      },
      running: function () { return raf !== null; }
    };
  }

  /* ============================================================
     3 · Background music — audio file with synthesised fallback
     ============================================================ */
  function Music() {
    var element = null;
    var audioCtx = null;
    var master = null;
    var timer = null;
    var muted = false;
    var started = false;

    /* ------------------------------------------------------------
       Mangalvadya — the shehnai piece that plays when no audio file
       is present.

       This is synthesised rather than a recording on purpose: every
       well-known Marathi wedding song is under copyright, and one
       cannot be shipped in a public repository. So the melody here is
       an original phrase written in the Yaman idiom — the bright,
       auspicious evening raga a shehnai player would open with at a
       Maharashtrian wedding — over a tanpura drone.

       To use a real song instead, drop a file you have the rights to
       at CONFIG.musicSrc and it takes priority automatically.
       ------------------------------------------------------------ */

    var SA = 261.63;                     // C4, the tonic

    // Yaman: S R G M(tivra) P D N S'. Just intonation, so it rings.
    var YAMAN = [1, 9 / 8, 5 / 4, 45 / 32, 3 / 2, 27 / 16, 15 / 8, 2];

    // [scale degree, beats]. -1 rests. Four phrases, each resolving home.
    var PHRASES = [
      [[0, 2], [1, 1], [2, 1], [3, 2], [2, 2], [-1, 1]],
      [[4, 2], [3, 1], [2, 1], [1, 2], [0, 3], [-1, 1]],
      [[4, 1], [5, 1], [6, 2], [7, 3], [6, 2], [-1, 1]],
      [[6, 1], [5, 1], [4, 2], [3, 1], [2, 1], [1, 1], [0, 3]]
    ];

    var BEAT = 0.52;                     // seconds — an unhurried tempo

    /* A shehnai is a double-reed pipe: bright, nasal, and never quite
       steady. Two detuned saws through a resonant band-pass get the reed;
       the vibrato and the slow attack get the breath. */
    function shehnai(freq, when, duration, gainValue) {
      var reed = audioCtx.createOscillator();
      var reed2 = audioCtx.createOscillator();
      var vibrato = audioCtx.createOscillator();
      var vibratoDepth = audioCtx.createGain();
      var body = audioCtx.createBiquadFilter();
      var tame = audioCtx.createBiquadFilter();
      var gain = audioCtx.createGain();

      reed.type = 'sawtooth';
      reed.frequency.value = freq;
      reed2.type = 'sawtooth';
      reed2.frequency.value = freq * 1.006;      // a slow beat between the two

      vibrato.frequency.value = 5.4;
      vibratoDepth.gain.value = freq * 0.011;
      vibrato.connect(vibratoDepth);
      vibratoDepth.connect(reed.frequency);
      vibratoDepth.connect(reed2.frequency);

      body.type = 'bandpass';                    // the reed's formant
      body.frequency.value = freq * 2.4;
      body.Q.value = 3.2;
      tame.type = 'lowpass';                     // keep it soft on speakers
      tame.frequency.value = 2600;

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.12);
      gain.gain.setValueAtTime(gainValue, when + duration * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

      reed.connect(body);
      reed2.connect(body);
      body.connect(tame).connect(gain).connect(master);

      vibrato.start(when);
      reed.start(when);
      reed2.start(when);
      vibrato.stop(when + duration + 0.1);
      reed.stop(when + duration + 0.1);
      reed2.stop(when + duration + 0.1);
    }

    /* Chaughada — the kettledrums that answer the shehnai. The pair is
       called सनई-चौघडा for a reason: the reed alone is only half of it.

       A drum is a pitched thud: a sine whose frequency collapses fast, plus
       a short noise transient for the stick hitting the skin. */
    function drum(freq, when, gainValue) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * 2.4, when);
      osc.frequency.exponentialRampToValueAtTime(freq, when + 0.08);

      gain.gain.setValueAtTime(gainValue, when);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.42);

      osc.connect(gain).connect(master);
      osc.start(when);
      osc.stop(when + 0.45);

      // The stick.
      var noise = audioCtx.createBufferSource();
      var buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.05, audioCtx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      }
      noise.buffer = buffer;

      var band = audioCtx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1800;
      var noiseGain = audioCtx.createGain();
      noiseGain.gain.value = gainValue * 0.35;

      noise.connect(band).connect(noiseGain).connect(master);
      noise.start(when);
    }

    // Tanpura-ish drone on Sa and Pa, held under everything.
    function startDrone() {
      [SA / 2, (SA / 2) * 1.5, SA].forEach(function (freq, i) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        var soft = audioCtx.createBiquadFilter();

        osc.type = 'triangle';
        osc.frequency.value = freq;
        soft.type = 'lowpass';
        soft.frequency.value = 900;
        gain.gain.value = i === 2 ? 0.018 : 0.035;

        osc.connect(soft).connect(gain).connect(master);
        osc.start();
      });
    }

    function startSynth() {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;

      audioCtx = new Ctx();
      master = audioCtx.createGain();
      master.gain.value = 0;

      // A long feedback delay gives it a soft, hall-like tail.
      var delay = audioCtx.createDelay(2);
      delay.delayTime.value = 0.42;
      var feedback = audioCtx.createGain();
      feedback.gain.value = 0.32;
      var wet = audioCtx.createGain();
      wet.gain.value = 0.5;

      master.connect(audioCtx.destination);
      master.connect(delay);
      delay.connect(feedback).connect(delay);
      delay.connect(wet).connect(audioCtx.destination);

      master.gain.linearRampToValueAtTime(0.16, audioCtx.currentTime + 3);

      startDrone();

      /* One phrase is queued at a time, a phrase ahead of the playhead, so
         the notes land on an exact clock rather than on setInterval drift. */
      var phrase = 0;

      function queuePhrase() {
        var notes = PHRASES[phrase % PHRASES.length];
        var at = audioCtx.currentTime + 0.1;
        var total = 0;

        // The chaughada keeps the beat under the whole phrase: a low stroke
        // on the one, a higher answering stroke on the third.
        var beats = 0;
        notes.forEach(function (note) { beats += note[1]; });
        for (var b = 0; b < beats; b++) {
          if (b % 4 === 0) drum(74, at + b * BEAT, 0.16);
          else if (b % 4 === 2) drum(112, at + b * BEAT, 0.09);
        }

        notes.forEach(function (note) {
          var degree = note[0];
          var span = note[1] * BEAT;
          if (degree >= 0) {
            // The third phrase is the one that climbs, so it plays an
            // octave up before the fourth walks back down to Sa.
            var octave = phrase % PHRASES.length === 2 ? 2 : 1;
            shehnai(SA * YAMAN[degree] * octave, at + total, span * 0.92, 0.075);
          }
          total += span;
        });

        phrase++;
        return total;
      }

      // Re-arm after each phrase, plus a breath between them.
      (function loop() {
        var span = queuePhrase();
        timer = setTimeout(loop, (span + BEAT) * 1000);
      })();

      return true;
    }

    function fadeSynth(to) {
      if (!audioCtx) return;
      master.gain.cancelScheduledValues(audioCtx.currentTime);
      master.gain.setValueAtTime(master.gain.value, audioCtx.currentTime);
      master.gain.linearRampToValueAtTime(to, audioCtx.currentTime + 0.6);
    }

    return {
      start: function () {
        if (started) return;
        started = true;

        var audio = new Audio(CONFIG.musicSrc);
        audio.loop = true;
        audio.volume = 0;
        audio.preload = 'auto';

        var playing = audio.play();
        if (playing && typeof playing.then === 'function') {
          playing.then(function () {
            element = audio;
            var vol = 0;
            var fade = setInterval(function () {
              vol = Math.min(0.35, vol + 0.02);
              audio.volume = vol;
              if (vol >= 0.35) clearInterval(fade);
            }, 120);
          }).catch(function () {
            startSynth();   // no file, or autoplay blocked for media elements
          });
        } else {
          startSynth();
        }
      },
      toggle: function () {
        muted = !muted;
        if (element) element.muted = muted;
        else fadeSynth(muted ? 0 : 0.16);
        return muted;
      },
      isMuted: function () { return muted; }
    };
  }

  /* ============================================================
     4 · Reveal sequence
     ============================================================ */
  function setupReveal(petals, music) {
    var hero = $('#hero');
    var envelope = $('#envelope');
    var button = $('#revealBtn');
    var invitation = $('#invitation');
    var musicBtn = $('#musicBtn');
    if (!hero || !button || !invitation) return;

    var opened = false;

    if (musicBtn) {
      // Re-applied on language change, since the label depends on mute state.
      refreshMusicLabel = function () {
        var muted = musicBtn.getAttribute('aria-pressed') === 'true';
        musicBtn.setAttribute('aria-label', t(muted ? 'a11y.musicOff' : 'a11y.musicOn'));
      };

      musicBtn.addEventListener('click', function () {
        var muted = music.toggle();
        musicBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
        refreshMusicLabel();
        toast(t(muted ? 'music.off' : 'music.on'));
      });
    }

    function open() {
      if (opened) return;
      opened = true;

      button.disabled = true;
      envelope.classList.add('is-open');
      // Fades the prompt out with the seal rather than leaving it hanging
      // over an opened envelope.
      hero.classList.add('is-revealing');
      music.start();
      musicBtn.hidden = false;

      // Long enough for the seal to lift, the flap to fall and the card to
      // clear the pocket. Shorter and the hero leaves mid-open.
      var delay = reducedMotion ? 0 : 1900;

      // Akshata thrown as the seal breaks.
      if (!reducedMotion) {
        setTimeout(function () {
          var box = envelope.getBoundingClientRect();
          petals.burst(box.left + box.width / 2, box.top + box.height * 0.5, 70);
        }, 300);
      }

      setTimeout(function () {
        hero.classList.add('is-leaving');
      }, delay);

      setTimeout(function () {
        hero.classList.add('is-gone');
        petals.stop();
        document.body.classList.remove('is-locked');
        invitation.hidden = false;

        // Force a reflow so the opacity transition actually runs.
        void invitation.offsetHeight;
        invitation.classList.add('is-visible');

        window.scrollTo(0, 0);
        revealOnScroll();
        loadMap();

        // Move focus into the invitation for keyboard and screen-reader users.
        var first = $('#ganesh .ganesh__blessing') || $('#couple .couple__names');
        if (first) {
          first.setAttribute('tabindex', '-1');
          first.focus({ preventScroll: true });
        }
      }, delay + (reducedMotion ? 0 : 850));
    }

    button.addEventListener('click', open);
  }

  /* ============================================================
     5 · Countdown
     ============================================================ */
  function setupCountdown() {
    var days = $('#cdDays'), hours = $('#cdHours'),
        mins = $('#cdMins'), secs = $('#cdSecs'), note = $('#clockNote');
    if (!days) return;

    var pad = function (n) { return digits(n < 10 ? '0' + n : String(n)); };

    // Only animate a unit when its value actually changes, so the seconds
    // roll each tick while the days sit still. The old value leaves through
    // the top of the clipped box as the new one arrives from below.
    function put(el, value) {
      var slot = $('.countdown__digits', el);
      if (!slot || slot.textContent === value) return;

      if (reducedMotion) { slot.textContent = value; return; }

      var out = slot.cloneNode(true);
      out.className = 'countdown__digits countdown__digits--out';
      el.appendChild(out);
      setTimeout(function () { out.remove(); }, 520);

      slot.textContent = value;
      slot.classList.remove('countdown__digits--in');
      void slot.offsetWidth;            // restart the animation
      slot.classList.add('countdown__digits--in');
    }

    function tick() {
      var diff = CONFIG.weddingDate.getTime() - Date.now();

      if (diff <= 0) {
        [days, hours, mins, secs].forEach(function (el) { put(el, digits('00')); });
        note.textContent = t('countdown.arrived');
        clearInterval(timer);
        return;
      }

      var s = Math.floor(diff / 1000);
      put(days, pad(Math.floor(s / 86400)));
      put(hours, pad(Math.floor(s / 3600) % 24));
      put(mins, pad(Math.floor(s / 60) % 60));
      put(secs, pad(s % 60));
    }

    tick();
    var timer = setInterval(tick, 1000);

    // Redraw immediately on language change so digits switch script at once.
    onLang(tick);
  }

  /* ============================================================
     5b · Add to calendar
     ============================================================ */
  function icsStamp(date) {
    // ICS wants UTC as YYYYMMDDTHHMMSSZ, with no punctuation.
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function setupCalendar() {
    var ics = $('#calIcs');
    var google = $('#calGoogle');
    if (!ics && !google) return;

    var start = CONFIG.weddingDate;
    var end = CONFIG.weddingEnd;

    function title() { return t('calendar.event'); }

    if (google) {
      // Rebuilt on language change so the event lands in the guest's language.
      var setGoogle = function () {
        google.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
          '&text=' + encodeURIComponent(title()) +
          '&dates=' + icsStamp(start) + '/' + icsStamp(end) +
          '&location=' + encodeURIComponent(CONFIG.venueQuery) +
          '&details=' + encodeURIComponent(t('calendar.details'));
      };
      setGoogle();
      onLang(setGoogle);
    }

    if (ics) {
      ics.addEventListener('click', function (e) {
        e.preventDefault();

        // RFC 5545 requires CRLF line endings — Outlook rejects bare LF.
        var lines = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Pooja and Sagar//Wedding//EN',
          'BEGIN:VEVENT',
          /* Deliberately still says nagesh. A UID is an opaque identity, not
             an address: calendars treat a changed UID as a different event,
             so renaming it would give every guest who already saved the date
             a second copy instead of an update. It must outlive the domain. */
          'UID:wedding-2026-12-12@pooja-weds-nagesh',
          'DTSTAMP:' + icsStamp(new Date()),
          'DTSTART:' + icsStamp(start),
          'DTEND:' + icsStamp(end),
          'SUMMARY:' + title(),
          'DESCRIPTION:' + t('calendar.details'),
          'LOCATION:' + CONFIG.venueQuery.replace(/,/g, '\\,'),
          'END:VEVENT',
          'END:VCALENDAR'
        ].join('\r\n');

        var url = URL.createObjectURL(new Blob([lines], { type: 'text/calendar' }));
        var link = document.createElement('a');
        link.href = url;
        link.download = 'pooja-nagesh-wedding.ics';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

        toast(t('calendar.saved'));
      });
    }
  }

  /* ============================================================
     6 · Scroll reveal + active nav link + back to top
     ============================================================ */
  var revealObserver = null;

  function revealOnScroll() {
    var items = $$('.reveal:not(.is-in)');

    if (reducedMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    }
    items.forEach(function (el) { revealObserver.observe(el); });
  }

  function setupNavAndScroll() {
    var nav = $('#topnav');
    var links = $$('.topnav a');
    var ink = $('.topnav__ink');
    var toTop = $('#toTop');

    // A single gold rule that slides between sections rather than four
    // separate underlines blinking on and off.
    function moveInk() {
      if (!ink || !nav) return;
      var active = $('.topnav a.is-active');
      if (!active) { ink.classList.remove('is-on'); return; }
      ink.style.width = active.offsetWidth + 'px';
      ink.style.transform = 'translateX(' + active.offsetLeft + 'px)';
      ink.classList.add('is-on');
      nav.classList.add('has-ink');
    }
    window.addEventListener('resize', moveInk);
    // Marathi labels are a different width, so the rule has to be re-measured.
    onLang(moveInk);

    if ('IntersectionObserver' in window && links.length) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          links.forEach(function (a) {
            a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
          });
          moveInk();
        });
      }, { rootMargin: '-45% 0px -50% 0px' });

      links.forEach(function (a) {
        var section = document.querySelector(a.getAttribute('href'));
        if (section) spy.observe(section);
      });
    }

    if (toTop) {
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          toTop.hidden = window.scrollY < 600;
          ticking = false;
        });
      }, { passive: true });

      toTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      });
    }
  }

  /* ============================================================
     6b · Ganesh draw-on, pointer tilt, reading progress
     ============================================================ */
  /* Line art that draws itself the first time it scrolls into view. */
  function drawOnView(el, threshold) {
    if (!el) return;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      el.classList.add('is-drawn');
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      el.classList.add('is-drawn');
      io.disconnect();
    }, { threshold: threshold });
    io.observe(el);
  }

  function setupGanesh() {
    drawOnView($('#ganeshArt'), 0.3);
  }

  /* The rangoli is written once in the markup; the band copy below the RSVP
     is a clone, so the artwork only has to be maintained in one place. */
  function setupRangoli() {
    var source = $('.rangoli-slot--watermark .rangoli');
    var band = $('#rangoliBand');

    if (source && band && !band.firstElementChild) {
      band.appendChild(source.cloneNode(true));
    }

    $$('.rangoli').forEach(function (art) { drawOnView(art, 0.25); });
  }

  /* The story line fills in behind the reader as they travel down it. */
  function setupTimeline() {
    var timeline = $('.timeline');
    if (!timeline || reducedMotion) return;

    var ticking = false;
    function update() {
      var box = timeline.getBoundingClientRect();
      var anchor = window.innerHeight * 0.62;
      var pct = box.height > 0 ? (anchor - box.top) / box.height : 0;
      timeline.style.setProperty('--fill', (Math.max(0, Math.min(1, pct)) * 100).toFixed(1) + '%');
      ticking = false;
    }

    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  function setupTilt() {
    if (reducedMotion || !window.matchMedia('(hover: hover)').matches) return;

    $$('[data-tilt]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var box = el.getBoundingClientRect();
        var dx = (e.clientX - box.left) / box.width - 0.5;
        var dy = (e.clientY - box.top) / box.height - 0.5;
        el.style.setProperty('--tilt-y', (dx * 7).toFixed(2) + 'deg');
        el.style.setProperty('--tilt-x', (-dy * 7).toFixed(2) + 'deg');
        // A specular highlight that tracks the pointer across the glass.
        el.style.setProperty('--mx', ((dx + 0.5) * 100).toFixed(1) + '%');
        el.style.setProperty('--my', ((dy + 0.5) * 100).toFixed(1) + '%');
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--tilt-x', '0deg');
        el.style.setProperty('--tilt-y', '0deg');
      });
    });
  }

  /* A gold ripple spreading from wherever the guest actually pressed. */
  function setupRipples() {
    if (reducedMotion) return;

    document.addEventListener('pointerdown', function (e) {
      // Only buttons whose label sits in an element of its own — the ripple
      // is a positioned box, so it would paint over a bare text node.
      var target = e.target.closest && e.target.closest('.btn, .langgate__btn');
      if (!target) return;

      var box = target.getBoundingClientRect();
      var size = Math.max(box.width, box.height) * 2.2;
      var ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - box.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - box.top - size / 2) + 'px';

      target.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 720);
    }, { passive: true });
  }

  function setupProgress() {
    var wrap = $('#progress');
    var bar = $('#progressBar');
    if (!wrap || !bar) return;

    var ticking = false;
    function update() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
      bar.style.width = pct + '%';
      wrap.setAttribute('aria-valuenow', Math.round(pct));
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  /* ============================================================
     7 · Slow parallax
     ============================================================ */
  function setupParallax() {
    if (reducedMotion) return;
    var bg = $('.hero__bg');
    var corners = $$('.corner');
    if (!bg && !corners.length) return;

    var ticking = false;
    function update() {
      var y = window.scrollY;
      corners.forEach(function (el, i) {
        el.style.transform = (el.classList.contains('corner--br') ? 'rotate(180deg) ' : '') +
          'translateY(' + (y * (i % 2 ? -0.04 : 0.04)) + 'px)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });

    // Gentle pointer parallax on the hero backdrop, plus the lamp light and
    // the envelope's tilt — all driven from one throttled handler (desktop).
    var hero = $('#hero');
    if (hero && window.matchMedia('(hover: hover)').matches) {
      var envelope = $('#envelope');
      var pending = false;
      var px = 0, py = 0;

      function paint() {
        pending = false;
        var dx = px / window.innerWidth - 0.5;
        var dy = py / window.innerHeight - 0.5;

        if (bg) bg.style.transform = 'scale(1.08) translate(' + (dx * 18) + 'px,' + (dy * 18) + 'px)';

        hero.style.setProperty('--gx', ((dx + 0.5) * 100).toFixed(1) + '%');
        hero.style.setProperty('--gy', ((dy + 0.5) * 100).toFixed(1) + '%');

        if (envelope) {
          envelope.style.setProperty('--env-y', (dx * 12).toFixed(2) + 'deg');
          envelope.style.setProperty('--env-x', (-dy * 9).toFixed(2) + 'deg');
        }
      }

      hero.addEventListener('pointermove', function (e) {
        px = e.clientX;
        py = e.clientY;
        if (pending) return;
        pending = true;
        requestAnimationFrame(paint);
      }, { passive: true });

      // Settle back to the resting state: light centred, envelope square on.
      hero.addEventListener('pointerleave', function () {
        hero.style.setProperty('--gx', '50%');
        hero.style.setProperty('--gy', '44%');
        if (envelope) {
          envelope.style.setProperty('--env-x', '0deg');
          envelope.style.setProperty('--env-y', '0deg');
        }
      });
    }
  }

  /* ============================================================
     8 · Gallery — placeholders, lightbox
     ============================================================ */
  var PLACEHOLDER_TINTS = [
    ['#f3ded6', '#e2c3bd'], ['#f6ead9', '#e6cfae'], ['#efe0e4', '#dcbfc7'],
    ['#f5efe3', '#ddcdb4'], ['#f2e2dd', '#d9b8b3'], ['#eee6dc', '#d5c3ad']
  ];

  function placeholderFor(index, w, h) {
    var tint = PLACEHOLDER_TINTS[index % PLACEHOLDER_TINTS.length];
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="' + tint[0] + '"/><stop offset="1" stop-color="' + tint[1] + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#g)"/>' +
      '<g fill="none" stroke="#b28c4d" stroke-opacity=".45" stroke-width="2">' +
      '<circle cx="' + (w / 2) + '" cy="' + (h / 2 - 14) + '" r="26"/>' +
      '<path d="M' + (w / 2 - 46) + ' ' + (h / 2 + 40) + 'h92"/>' +
      '</g>' +
      '<text x="50%" y="' + (h / 2 + 4) + '" text-anchor="middle" font-family="Georgia,serif" ' +
      'font-size="22" fill="#b28c4d" fill-opacity=".8">P &amp; N</text></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  function setupGallery() {
    var buttons = $$('.masonry__btn');
    if (!buttons.length) return;

    // Elegant placeholders until real photos are dropped into /images.
    function usePlaceholder(img, index) {
      if (img.dataset.fallback) return;
      img.dataset.fallback = '1';
      img.src = placeholderFor(index,
        parseInt(img.getAttribute('width'), 10) || 800,
        parseInt(img.getAttribute('height'), 10) || 800);
    }

    buttons.forEach(function (btn, i) {
      var img = $('img', btn);
      img.addEventListener('error', function () { usePlaceholder(img, i); });
      // This script is deferred, so an image may already have failed by now —
      // a load error on an already-complete image never re-fires.
      if (img.complete && img.naturalWidth === 0) usePlaceholder(img, i);
    });

    var box = $('#lightbox');
    var boxImg = $('#lbImg');
    var caption = $('#lbCaption');
    var current = 0;
    var lastFocus = null;

    function show(index) {
      current = (index + buttons.length) % buttons.length;
      var img = $('img', buttons[current]);
      boxImg.src = img.currentSrc || img.src;
      boxImg.alt = img.alt;
      caption.textContent = buttons[current].dataset.caption || '';
    }

    /* Morph the thumbnail into the full-size photo (and back) where the
       browser supports it. The same view-transition-name is handed from the
       old element to the new one inside the callback, which is what makes
       the two snapshots animate as one moving photo.

       The lightbox's own opacity transitions are suppressed for the
       duration — otherwise the "after" snapshot would be captured while
       the dialog was still fading in, i.e. still transparent. */
    function morph(from, to, apply) {
      if (reducedMotion || !document.startViewTransition || !from || !to) {
        apply(false);
        return;
      }

      function clear() {
        from.style.viewTransitionName = '';
        to.style.viewTransitionName = '';
        box.classList.remove('is-vt');
      }

      box.classList.add('is-vt');
      from.style.viewTransitionName = 'photo-morph';

      var transition = document.startViewTransition(function () {
        from.style.viewTransitionName = '';
        to.style.viewTransitionName = 'photo-morph';
        apply(true);
      });
      transition.finished.then(clear, clear);
    }

    function openBox(index) {
      lastFocus = document.activeElement;
      morph($('img', buttons[index]), boxImg, function () {
        box.hidden = false;
        show(index);
        void box.offsetHeight;
        box.classList.add('is-open');
        document.body.classList.add('is-locked');
        $('#lbClose').focus();
      });
    }

    function closeBox() {
      morph(boxImg, $('img', buttons[current]), function (morphed) {
        box.classList.remove('is-open');
        // Without a morph the dialog still needs its own fade out.
        if (morphed) box.hidden = true;
        else setTimeout(function () { box.hidden = true; }, 350);
        document.body.classList.remove('is-locked');
        if (lastFocus) lastFocus.focus();
      });
    }

    buttons.forEach(function (btn, i) {
      btn.addEventListener('click', function () { openBox(i); });
    });

    $('#lbClose').addEventListener('click', closeBox);
    $('#lbPrev').addEventListener('click', function () { show(current - 1); });
    $('#lbNext').addEventListener('click', function () { show(current + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) closeBox(); });

    /* Swipe between photos. Most guests are on a phone, where the two arrow
       buttons are a small target and swiping is the expected gesture. A
       mostly-vertical drag is left alone so the page can still be scrolled. */
    (function () {
      var startX = 0, startY = 0, tracking = false;

      box.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) { tracking = false; return; }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
      }, { passive: true });

      box.addEventListener('touchend', function (e) {
        if (!tracking) return;
        tracking = false;

        var touch = e.changedTouches[0];
        var dx = touch.clientX - startX;
        var dy = touch.clientY - startY;

        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
        show(dx < 0 ? current + 1 : current - 1);
      }, { passive: true });
    })();

    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') closeBox();
      else if (e.key === 'ArrowLeft') show(current - 1);
      else if (e.key === 'ArrowRight') show(current + 1);
      else if (e.key === 'Tab') {
        // Simple focus trap across the four controls in the dialog.
        var focusables = $$('button', box);
        var first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  /* ============================================================
     9 · Map (loaded lazily, after the reveal)
     ============================================================ */
  var mapLoaded = false;

  function loadMap() {
    if (mapLoaded) return;
    var host = $('#map');
    var link = $('#mapsLink');
    var query = encodeURIComponent(CONFIG.venueQuery);

    if (link) link.href = 'https://www.google.com/maps/search/?api=1&query=' + query;
    if (!host) return;

    var start = function () {
      if (mapLoaded) return;
      mapLoaded = true;
      var frame = document.createElement('iframe');
      frame.src = 'https://www.google.com/maps?q=' + query + '&output=embed';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      frame.title = 'Map of ' + CONFIG.venueQuery;
      frame.setAttribute('allowfullscreen', '');

      var settled = false;
      frame.addEventListener('load', function () {
        settled = true;
        var ph = $('#mapPlaceholder');
        if (ph) ph.remove();
      });

      // If the embed is blocked or the guest is offline, say so rather than
      // leaving "Loading map…" on screen forever.
      setTimeout(function () {
        if (settled) return;
        var msg = $('#mapMessage');
        if (!msg) return;
        msg.dataset.i18n = 'venue.unavailable';
        msg.textContent = t('venue.unavailable');
      }, 8000);

      host.appendChild(frame);
    };

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) { start(); io.disconnect(); }
      }, { rootMargin: '300px' });
      io.observe(host);
    } else {
      start();
    }
  }

  /* ============================================================
     10 · Confetti
     ============================================================ */
  function burstConfetti() {
    if (reducedMotion) return;
    var canvas = $('#confetti');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.classList.add('is-active');

        // Akshata again, so the RSVP celebration matches the reveal.
    var GRAINS = ['#fffcf6', '#faf4e6', '#e5b125', '#f2d98a', '#b4232a', '#d4696b'];
    var PETALS = ['#e8c8c4', '#d59a95', '#e79a2e', '#f3b757'];
    var pieces = [];
    var w = window.innerWidth, h = window.innerHeight;

    // Flower petals rather than paper — the same shapes as the cover, so the
    // celebration reads as one idea from the first screen to the last.
    function piece(from) {
      var thrown = from === 'burst';
      var grain = Math.random() < 0.72;
      return {
        x: thrown ? w * (0.2 + Math.random() * 0.6) : Math.random() * w,
        y: thrown ? h * 0.42 + (Math.random() - 0.5) * 60 : -40 - Math.random() * h * 0.6,
        vx: thrown ? (Math.random() - 0.5) * 9 : (Math.random() - 0.5) * 1.6,
        vy: thrown ? -7 - Math.random() * 9 : 1.5 + Math.random() * 2.5,
        gravity: thrown ? 0.24 : 0.02,
        size: 6 + Math.random() * 9,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.18,
        sway: 0.6 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        // Mostly rice, with a scattering of flowers through it.
        grain: grain,
        color: grain
          ? GRAINS[(Math.random() * GRAINS.length) | 0]
          : PETALS[(Math.random() * PETALS.length) | 0],
        life: 1
      };
    }

    for (var i = 0; i < 110; i++) pieces.push(piece('burst'));
    for (var j = 0; j < 70; j++) pieces.push(piece('shower'));

    function draw(p) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;

      if (p.grain) {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 0.19, p.size * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        var s = p.size;
        ctx.beginPath();
        ctx.moveTo(0, -s / 2);
        ctx.bezierCurveTo(s / 2, -s / 2, s / 2, s / 2, 0, s / 2);
        ctx.bezierCurveTo(-s / 2, s / 2, -s / 2, -s / 2, 0, -s / 2);
        ctx.fill();
      }
      ctx.restore();
    }

    var started = performance.now();
    (function frame(now) {
      var elapsed = now - started;
      ctx.clearRect(0, 0, w, h);

      pieces.forEach(function (p) {
        p.vy += p.gravity;
        p.vx *= 0.992;                          // drag
        p.phase += 0.04;
        p.x += p.vx + Math.sin(p.phase) * p.sway * 0.35;
        p.y += p.vy;
        p.angle += p.spin;
        // Hold full opacity while the shower is still arriving, then fade.
        p.life = Math.max(0, Math.min(1, (5200 - elapsed) / 1600));
        draw(p);
      });

      if (elapsed < 5200) requestAnimationFrame(frame);
      else {
        ctx.clearRect(0, 0, w, h);
        canvas.classList.remove('is-active');
      }
    })(started);
  }

  /* ============================================================
     11 · RSVP
     ============================================================ */
  function setupRsvp() {
    var form = $('#rsvpForm');
    if (!form) return;

    var status = $('#rsvpStatus');
    var submit = $('#rsvpSubmit');
    var attend = $('#rsvpAttend');
    var eventsField = $('#eventsField');
    var guests = $('#rsvpGuests');

    // Headcount and ceremony choices are only relevant if attending.
    function syncAttendance() {
      var coming = attend.value === 'yes';
      eventsField.hidden = !coming;
      guests.closest('.field').hidden = !coming;
    }
    attend.addEventListener('change', syncAttendance);
    syncAttendance();

    function setError(input, show) {
      var field = input.closest('.field');
      var msg = $('[data-error-for="' + input.id + '"]', field);
      field.classList.toggle('has-error', show);
      if (msg) msg.hidden = !show;
      input.setAttribute('aria-invalid', show ? 'true' : 'false');
    }

    function validate() {
      var ok = true;
      var name = $('#rsvpName');

      var nameBad = name.value.trim().length < 2;
      setError(name, nameBad);
      if (nameBad) ok = false;

      if (attend.value === 'yes') {
        var n = parseInt(guests.value, 10);
        var guestsBad = !(n >= 1 && n <= 10);
        setError(guests, guestsBad);
        if (guestsBad) ok = false;

        // Nothing is ticked by default, so an attending guest who ticks
        // nothing would tell us they are coming to no ceremony at all.
        var chosen = $$('input[name="events"]:checked', form).length;
        var eventsMsg = $('[data-error-for="eventsField"]', form);
        eventsField.classList.toggle('has-error', chosen === 0);
        if (eventsMsg) eventsMsg.hidden = chosen > 0;
        if (chosen === 0) ok = false;
      } else {
        setError(guests, false);
      }
      return ok;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) {
        status.textContent = t('rsvp.checkFields');
        var firstBad = $('.has-error input, .has-error select', form);
        if (firstBad) firstBad.focus();
        return;
      }

      var coming = attend.value === 'yes';
      var payload = {
        name: $('#rsvpName').value.trim(),
        guests: coming ? parseInt(guests.value, 10) : 0,
        attending: attend.value,
        events: coming
          ? $$('input[name="events"]:checked', form).map(function (c) { return c.value; })
          : [],
        message: $('#rsvpMessage').value.trim(),
        submittedAt: new Date().toISOString()
      };

      submit.disabled = true;
      status.textContent = t('rsvp.sending');

      function done(delivered) {
        // Always keep a local copy so nothing is lost if the network fails.
        try {
          var saved = JSON.parse(localStorage.getItem('rsvps') || '[]');
          saved.push(payload);
          localStorage.setItem('rsvps', JSON.stringify(saved));
        } catch (err) { /* private mode — ignore */ }

        form.classList.add('is-sent');
        status.textContent = payload.attending === 'yes'
          ? t('rsvp.thanksYes', { name: payload.name.split(' ')[0] })
          : t('rsvp.thanksNo');

        if (payload.attending === 'yes') burstConfetti();
        if (!delivered && CONFIG.rsvpEndpoint) toast(t('rsvp.offline'));

        // The button now shows a confirmation, so stop translating its label.
        submit.removeAttribute('data-i18n');
        submit.textContent = t('rsvp.received');
      }

      if (CONFIG.rsvpEndpoint) {
        fetch(CONFIG.rsvpEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (res) { done(res.ok); })
          .catch(function () { done(false); });
      } else {
        setTimeout(function () { done(true); }, 500);
      }
    });
  }

  /* ============================================================
     12 · Shared photo folder — QR, link and copy button
     ============================================================ */
  function copyText(value) {
    var fallback = function () {
      var ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) { /* ignore */ }
      document.body.removeChild(ta);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).catch(fallback);
    } else {
      fallback();
    }
  }

  function setupPhotoFolder() {
    var url = CONFIG.photoDriveUrl;

    var link = $('#photoLink');
    if (link) {
      link.href = url;
      // Show the address without the scheme — shorter and easier to read aloud.
      link.textContent = url.replace(/^https?:\/\//, '');
    }

    var open = $('#photoOpen');
    if (open) open.href = url;

    var copyBtn = $('#photoCopy');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyText(url);
        copyBtn.textContent = t('photos.copied');
        copyBtn.classList.add('is-copied');
        toast(t('photos.copiedToast'));
        setTimeout(function () {
          copyBtn.textContent = t('photos.copy');
          copyBtn.classList.remove('is-copied');
        }, 1800);
      });
    }

    var canvas = $('#photoQr');
    if (!canvas || !window.QR) return;

    try {
      window.QR.render(canvas, url, { dark: '#3b302b', light: '#ffffff', margin: 4 });
    } catch (err) {
      // Too long for the QR version range — the link and button still work.
      var note = $('#photoQrNote');
      if (note) {
        note.dataset.i18n = 'photos.scanFallback';
        note.textContent = t('photos.scanFallback');
      }
      canvas.hidden = true;
    }
  }

  /* ============================================================
     Init
     ============================================================ */
  function init() {
    setupLangSwitch();
    window.addEventListener('resize', setRevealLabel);

    var canvas = $('#petals');
    var petals = canvas ? Petals(canvas) : {
      start: function () {}, stop: function () {}, resize: function () {},
      burst: function () {}, running: function () { return false; }
    };
    petals.start();

    window.addEventListener('resize', function () { petals.resize(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) petals.stop();
      else if (!$('#hero').classList.contains('is-gone')) petals.start();
    });

    setupReveal(petals, Music());
    setupCountdown();
    setupCalendar();
    setupNavAndScroll();
    setupParallax();
    setupGallery();
    setupRsvp();
    setupPhotoFolder();
    setupGanesh();
    setupRangoli();
    setupTimeline();
    setupTilt();
    setupRipples();
    setupProgress();

    // Every section has registered its language hooks by now, so this single
    // call translates the whole page including runtime-built strings.
    setLang(detectLang(), { persist: false });

    // Then ask, if we have not asked before.
    setupLangGate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Progressive enhancement: if scripting fails after this point the
     invitation would stay hidden, so unhide it as a last resort. */
  window.addEventListener('error', function () {
    var invitation = $('#invitation');
    if (invitation && invitation.hidden) {
      invitation.hidden = false;
      invitation.classList.add('is-visible');
      document.body.classList.remove('is-locked');
      $$('.reveal').forEach(function (el) { el.classList.add('is-in'); });
    }
    var gate = $('#langGate');
    if (gate && !gate.hidden) gate.hidden = true;
  });
})();
