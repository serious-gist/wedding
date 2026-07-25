/* ============================================================
   Pooja & Nagesh — Wedding Invitation
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
    // Wedding date & time. Month is 0-indexed (11 = December).
    // Saturday, 12 December 2026, ceremony at 4:30 PM.
    weddingDate: new Date(2026, 11, 12, 16, 30, 0),

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

    // Optional: drop an mp3 at this path for background music.
    // If the file is missing, a soft generative ambience is synthesised instead.
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

  function applyTranslations(root) {
    var scope = root || document;

    $$('[data-i18n]', scope).forEach(function (el) {
      el.textContent = t(el.dataset.i18n);
      if (el.hasAttribute('data-letters')) splitLetters(el);
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
    if (typeof onLangChange === 'function') onLangChange();

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

  // Hooks assigned by sections that render text at runtime.
  var onLangChange = null;
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
        shape: kind.shape
      };
    }

    function drawPetal(p) {
      var s = p.size;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color + '1)';

      if (p.shape === 'marigold') {
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
        if (p.y - p.size > h) petals[i] = make(false);
        else if (p.x < -40) p.x = w + 30;
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

    // Soft, slow arpeggio over a warm pad — used when no mp3 is available.
    var CHORDS = [
      [261.63, 329.63, 392.00, 493.88],  // Cmaj7
      [220.00, 261.63, 329.63, 415.30],  // Am(maj-ish)
      [174.61, 220.00, 261.63, 329.63],  // Fmaj7
      [196.00, 246.94, 293.66, 392.00]   // G
    ];

    function synthNote(freq, when, duration, gainValue) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      var filter = audioCtx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.value = freq;
      filter.type = 'lowpass';
      filter.frequency.value = 1600;

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

      osc.connect(filter).connect(gain).connect(master);
      osc.start(when);
      osc.stop(when + duration + 0.1);
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

      var step = 0;
      function schedule() {
        var chord = CHORDS[Math.floor(step / 4) % CHORDS.length];
        var note = chord[step % 4];
        var time = audioCtx.currentTime + 0.05;
        synthNote(note, time, 3.2, 0.09);
        if (step % 4 === 0) synthNote(note / 2, time, 5.5, 0.05);   // bass shadow
        step++;
      }
      schedule();
      timer = setInterval(schedule, 1450);
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
      music.start();
      musicBtn.hidden = false;

      var delay = reducedMotion ? 0 : 1500;

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
    // pulse each tick while the days sit still.
    function put(el, value) {
      if (el.textContent === value) return;
      el.textContent = value;
      if (reducedMotion) return;
      el.classList.remove('is-ticking');
      void el.offsetWidth;              // restart the animation
      el.classList.add('is-ticking');
    }

    function tick() {
      var diff = CONFIG.weddingDate.getTime() - Date.now();

      if (diff <= 0) {
        days.textContent = hours.textContent = mins.textContent = secs.textContent = digits('00');
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
    onLangChange = tick;
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
    var links = $$('.topnav a');
    var toTop = $('#toTop');

    if ('IntersectionObserver' in window && links.length) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          links.forEach(function (a) {
            a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
          });
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
  function setupGanesh() {
    var art = $('#ganeshArt');
    if (!art) return;

    if (reducedMotion || !('IntersectionObserver' in window)) {
      art.classList.add('is-drawn');
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      art.classList.add('is-drawn');
      io.disconnect();
    }, { threshold: 0.3 });
    io.observe(art);
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
      });
      el.addEventListener('pointerleave', function () {
        el.style.setProperty('--tilt-x', '0deg');
        el.style.setProperty('--tilt-y', '0deg');
      });
    });
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

    // Gentle pointer parallax on the hero backdrop (desktop only).
    if (bg && window.matchMedia('(hover: hover)').matches) {
      window.addEventListener('pointermove', function (e) {
        var dx = (e.clientX / window.innerWidth - 0.5) * 18;
        var dy = (e.clientY / window.innerHeight - 0.5) * 18;
        bg.style.transform = 'scale(1.08) translate(' + dx + 'px,' + dy + 'px)';
      }, { passive: true });
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

    function openBox(index) {
      lastFocus = document.activeElement;
      box.hidden = false;
      show(index);
      void box.offsetHeight;
      box.classList.add('is-open');
      document.body.classList.add('is-locked');
      $('#lbClose').focus();
    }

    function closeBox() {
      box.classList.remove('is-open');
      document.body.classList.remove('is-locked');
      setTimeout(function () { box.hidden = true; }, 350);
      if (lastFocus) lastFocus.focus();
    }

    buttons.forEach(function (btn, i) {
      btn.addEventListener('click', function () { openBox(i); });
    });

    $('#lbClose').addEventListener('click', closeBox);
    $('#lbPrev').addEventListener('click', function () { show(current - 1); });
    $('#lbNext').addEventListener('click', function () { show(current + 1); });
    box.addEventListener('click', function (e) { if (e.target === box) closeBox(); });

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

    var palette = ['#e8c8c4', '#d59a95', '#c9a66b', '#e2cda4', '#e79a2e', '#fdfaf5'];
    var pieces = [];
    var w = window.innerWidth, h = window.innerHeight;

    for (var i = 0; i < 130; i++) {
      pieces.push({
        x: w * (0.2 + Math.random() * 0.6),
        y: h * 0.42 + (Math.random() - 0.5) * 60,
        vx: (Math.random() - 0.5) * 9,
        vy: -7 - Math.random() * 9,
        size: 5 + Math.random() * 8,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.24,
        color: palette[(Math.random() * palette.length) | 0],
        life: 1
      });
    }

    var started = performance.now();
    (function frame(now) {
      var elapsed = now - started;
      ctx.clearRect(0, 0, w, h);

      pieces.forEach(function (p) {
        p.vy += 0.24;                 // gravity
        p.vx *= 0.992;                // drag
        p.x += p.vx;
        p.y += p.vy;
        p.angle += p.spin;
        p.life = Math.max(0, 1 - elapsed / 4200);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      if (elapsed < 4400) requestAnimationFrame(frame);
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
    var petals = canvas ? Petals(canvas) : { start: function () {}, stop: function () {}, resize: function () {}, running: function () { return false; } };
    petals.start();

    window.addEventListener('resize', function () { petals.resize(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) petals.stop();
      else if (!$('#hero').classList.contains('is-gone')) petals.start();
    });

    setupReveal(petals, Music());
    setupCountdown();
    setupNavAndScroll();
    setupParallax();
    setupGallery();
    setupRsvp();
    setupPhotoFolder();
    setupGanesh();
    setupTilt();
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
