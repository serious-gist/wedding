# Pooja & Nagesh — Wedding Invitation

A bilingual (English / मराठी) single-page Indian wedding invitation. Guests pick
a language, open an envelope, and land on the invitation: a Ganesh invocation,
the couple, a countdown, the ceremonies, the story, a gallery, the venue, RSVP
and a shared photo folder.

Plain HTML, CSS and JavaScript — no build step, no framework, no npm install.
Open `index.html` in a browser, or drop the folder on any static host.

```
index.html            markup and SEO metadata
css/styles.css        all styling
js/i18n.js            English + Marathi text — all copy lives here
js/main.js            behaviour — CONFIG block is at the top
js/qr.js              self-contained QR code generator
images/floral-bg.svg  blurred floral backdrop for the cover
images/toran.svg      marigold garland along the top of the invitation
vercel.json           hosting config (clean URLs, cache headers)
```

## ⚠️ Back up to GitHub

This project has already been emptied off local disk once — working tree and
git objects both. Everything was rebuilt, but the only real protection is an
off-machine copy. **Push to GitHub before doing anything else** (see
[Deploying](#deploying)), and keep pushing as you make changes.

## Language

The first thing every guest sees is a **language gate** offering English and
मराठी side by side. The choice is stored in `localStorage`, so returning guests
skip the gate entirely. It can be changed any time from the EN / मराठी switch in
the top corner.

All copy for both languages lives in [`js/i18n.js`](js/i18n.js) as one key per
string. To reword something, edit it there — not in `index.html`. The markup
carries English as its default text so the page still reads correctly before the
script runs and for guests without JavaScript.

Marathi is more than swapped strings:

- **Letter-spacing and uppercase are switched off.** The English design leans on
  tracked-out small caps; applied to Devanagari that breaks the conjuncts and
  the connecting headline (shirorekha).
- **Line height and small-text sizes increase**, because Devanagari needs room
  above and below the baseline for its matras.
- **Numerals become Devanagari** (१२ डिसेंबर २०२६), including the live countdown.
- **The couple's names animate per grapheme cluster, not per character.** "पूजा"
  is प + ू + ज + ा; splitting by character would tear each matra off its
  consonant. This needs `Intl.Segmenter` — where it is unavailable the names are
  shown whole rather than rendered wrongly.

Two things stay in Latin script on purpose: the **guest-count input** (a
`type="number"` field needs Latin digits to parse) and the **shared folder link**.

The **Ganesh shloka stays in Devanagari in both languages** — it is Sanskrit, not
Marathi. Only its meaning is translated. For the same reason Devanagari webfonts
load for everyone: the language gate and the shloka show Devanagari regardless
of language.

## Customising

### 1. Names and copy

Copy lives in [`js/i18n.js`](js/i18n.js), with the English text also mirrored in
`index.html` as the no-JavaScript default. To change the names, replace `Pooja` /
`Nagesh` (and `पूजा` / `नागेश`) in **both** files, plus the `<title>`, the meta
description, the Open Graph tags and the JSON-LD block in `<head>`, the `P & N`
monogram on the envelope, and the names on the language gate.

### 2. Still placeholder — replace before sending

Each needs updating in **both** languages in `js/i18n.js`:

- **The shared photo folder link** — `CONFIG.photoDriveUrl` in `js/main.js` is a
  placeholder. The QR encodes it, so guests will scan a dead link until you
  replace it. See "Shared photo folder" below.
- **Ceremony dates and times** — **Engagement on Sunday 15 November 2026**,
  **Mehendi on 10 December** and the **wedding on Saturday 12 December 2026**
  were given. The engagement time and venue, Haldi (11 Dec, 10:00 AM),
  Mehendi's 5:00 PM start and the wedding's 4:30 PM start are still guesses.
- **Our Story** — the "first meet" and "families met" entries and their dates.
- **Dress code** — currently "Traditional Indian · blush, ivory & gold".
- **RSVP deadline** — set to 20 November 2026 (three weeks before the wedding).

### 3. Date, venue, photo folder

Edit the `CONFIG` block at the top of [`js/main.js`](js/main.js):

```js
var CONFIG = {
  weddingDate: new Date(2026, 11, 12, 16, 30, 0),  // month is 0-indexed: 11 = December
  venueQuery: '36 Gun Lawns, Gut No. 118, Highway, opp. Southcity, ...',
  photoDriveUrl: 'https://drive.google.com/drive/folders/REPLACE-WITH-FOLDER-ID',
  musicSrc: 'audio/ambience.mp3',
  rsvpEndpoint: null
};
```

`weddingDate` drives the countdown — changing the ceremony time here does **not**
change the time shown in the cards, which comes from `js/i18n.js`. `venueQuery`
drives both the embedded map and the "Open in Google Maps" button, no API key
needed.

### Shared photo folder

The "Share Your Photos" section gives guests one place to put everything they
shoot across the three days, via a QR code and a link.

1. Create a folder in Google Drive (or a shared Google Photos album).
2. Share it so that **anyone with the link can upload**, not just view. In Drive:
   *Share → General access → Anyone with the link → Editor*.
3. Paste that link into `CONFIG.photoDriveUrl`.

Keep the link short. The QR generator handles up to 106 characters; a normal
Drive folder URL is about 70. If it overflows, the QR is hidden automatically
and the section falls back to the link and button — nothing breaks.

### 4. Music

Background music starts on the reveal tap, with a mute toggle in the corner.
Put an mp3 at `audio/ambience.mp3` (or change `CONFIG.musicSrc`). If the file is
missing, a soft generative ambience is synthesised with the Web Audio API.
Music never autoplays before the guest interacts — browsers block that.

### 5. RSVP responses

By default submissions are stored in the browser's `localStorage` under the key
`rsvps` — fine for testing, but **each guest's response stays on their own
phone**, so you will not receive them.

To collect responses, set `rsvpEndpoint` to a form service URL:

```js
rsvpEndpoint: 'https://formspree.io/f/your-form-id'
```

The form POSTs JSON (`name`, `guests`, `attending`, `events`, `message`,
`submittedAt`), where `events` lists which ceremonies the guest will join. A
local copy is always kept as a fallback if the request fails.

## Deploying

The site is static — no build step, no framework.

**GitHub: done.** The code lives at `github.com/serious-gist/wedding` and
`main` is pushed. Keep pushing as you make changes.

**Vercel:** the project should be named **pooja-weds-nagesh**. The GitHub repo
is named `wedding`, so Vercel will suggest "wedding" as the project name —
you have to change that field, or the URL will be wrong.

Dashboard (easiest):

1. <https://vercel.com/new> → import `serious-gist/wedding`
2. **Set Project Name to `pooja-weds-nagesh`** (it defaults to the repo name)
3. Framework Preset: **Other**; leave build command and output directory empty
4. Deploy

Or from the terminal:

```sh
npm i -g vercel
vercel login
vercel link --project pooja-weds-nagesh --yes
vercel --prod
```

Every later `git push` redeploys automatically.

The site lands at `https://pooja-weds-nagesh.vercel.app` — assuming that
subdomain is free. Vercel names are global, so if it is taken you will get a
suffixed URL. `og:url`, `og:image` and the canonical link in `index.html` are
already set to `pooja-weds-nagesh.vercel.app`; if your final URL differs,
update those three lines or link previews will point at the wrong place.

**Before you share the link, note that the site is public.** Anyone with the
address can see the couple's names, photos, venue and the ceremony schedule.
Vercel has no access control on the free tier; if you want it limited to invited
guests, use Vercel's password protection (a paid feature) or simply do not
publish the URL beyond your guest list.

**Push early.** Once the repo is on GitHub it is backed up — this project has
already been lost once from local disk.

## Animation

Fade-in on scroll, floating rose petals and marigolds on the cover, a swaying
marigold toran, a reading-progress bar, per-letter name reveal, a gold shimmer
across headings, pointer-tilt on cards, a pulse as countdown digits change, the
envelope reveal, confetti on RSVP, and the **Ganesh line art drawing itself
stroke by stroke** when it scrolls into view.

Everything is disabled or shown in its finished state under
`prefers-reduced-motion`, so nothing is left invisible for guests who ask their
device to reduce motion.

## Testing locally

Opening `index.html` directly works. To test with a server (closer to
production, and required for the clipboard API on some browsers):

```sh
python -m http.server 8000
```

then visit `http://localhost:8000`.

To see the language gate again after choosing once, clear the site's
`localStorage` or open the page in a private window.
