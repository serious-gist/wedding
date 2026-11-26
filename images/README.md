# images/

## Artwork

- `floral-bg.svg` — the blurred floral backdrop on the cover screen. Drawn as
  vector flowers and blurred in CSS, so it stays sharp at any screen size and
  costs only a few KB.
- `toran.svg` — the marigold garland along the top of the invitation. One tile
  that repeats horizontally; the string starts and ends at the same height so
  tiles join without a visible seam.

## Photos

The gallery uses these two, in this order:

```
1000278199.jpg   portrait   1066 × 1600
1000278202.jpg   portrait   1066 × 1600
```

If a file is ever missing the gallery falls back to generated gradient
placeholders, so the page never looks broken.

To swap or add a photo, edit the `src` values in the gallery section of
`index.html` and set each `<img>`'s `width` and `height` to the new file's real
pixel dimensions. Those attributes reserve the masonry tile's shape while the
image loads — a wrong ratio makes the layout jump.

## Open Graph preview

`og-cover.jpg` (1200×630) is referenced by the Open Graph tags as the link
preview image for WhatsApp, iMessage and social sharing. Rebuild it alongside
the invitation card with `node card/build.mjs`.
