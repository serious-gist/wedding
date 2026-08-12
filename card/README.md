# Marathi invitation card

A printable / shareable version of the invitation, in Marathi, matching the
website's palette and motifs.

| File | What it is |
| --- | --- |
| `invitation-mr.html` | The source. Edit this. Opens in any browser. |
| `fonts.css` | Generated. Tiro Devanagari Marathi + Cormorant Garamond embedded as data URIs, so the card renders identically offline. |
| `pooja-nagesh-invitation.png` | 1080 × 1527 — **send this on WhatsApp.** |
| `pooja-nagesh-invitation.pdf` | A5 portrait, single page — **give this to a printer.** |
| `pooja-nagesh-invitation.mp4` | 1080 × 1920, ~23s — **the video to forward on WhatsApp.** |
| `video-scenes.html` | The eight stills the video is cut from. Edit here. |
| `audio.mjs` | Synthesises the सनई-चौघडा soundtrack. |
| `build-video.mjs` | `node card/build-video.mjs` — stills via Chrome, motion and audio via ffmpeg. Needs ffmpeg on PATH. |
| `share-card.html` | Source for the link preview image. |
| `../images/og-cover.jpg` | 1200 × 630 — the `og:image`. What WhatsApp shows when someone pastes the site link. |
| `png-to-jpeg.html` | A converter, not a page. Chrome can only screenshot PNG, which is far too heavy for a photo; this re-encodes to JPEG on a canvas. |
| `build.mjs` | Renders all three outputs from the HTML via headless Chrome. |

## Editing

Open `invitation-mr.html`, change the text, then:

```
node card/build.mjs
```

Both outputs are regenerated. What you see when you open the HTML in a browser
is what ships — the same layout produces both, scaled from a single root
font-size (`16px` on screen, `2.1926mm` in print).

## Still to fill in

The card currently uses only details that were already in the repo. Two
traditional elements are missing because nobody has supplied them:

- **Parents' names.** There is a ready block near the `<div class="names">`
  in the HTML — remove the surrounding `<!--` / `-->` and fill in the four
  names.
- **A contact number for RSVPs.** Nothing on the card yet; the QR points to
  the website's RSVP form instead.

## Notes

- **Never use `letter-spacing` on the Devanagari text.** It splits conjuncts —
  `आग्रहाचे` renders as `आ ग्र हा चे`. Use `word-spacing` for a tracked-out
  look. `../css/styles.css` carries the same rule for the website.
- The QR encodes `https://pooja-weds-sagar.vercel.app/` and is drawn by the
  site's own `../js/qr.js`, upscaled ×12 with smoothing off so it stays
  scannable at A5.
- Dates and times are in Devanagari numerals, as Marathi convention expects.
