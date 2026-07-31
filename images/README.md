# images/

## Artwork

- `floral-bg.svg` — the blurred floral backdrop on the cover screen. Drawn as
  vector flowers and blurred in CSS, so it stays sharp at any screen size and
  costs only a few KB.
- `toran.svg` — the marigold garland along the top of the invitation. One tile
  that repeats horizontally; the string starts and ends at the same height so
  tiles join without a visible seam.

## Photos

The gallery uses these three, in this order:

```
IMG-20260705-WA0023.jpg   portrait   1066 × 1600
IMG-20260705-WA0024.jpg   landscape  1600 × 1066
IMG-20260705-WA0025.jpg   portrait   1066 × 1600
```

`IMG-20260705-WA0026.jpg`, `…0027.jpg` and `…0028.jpg` are kept in this folder
but no longer shown on the site.

If a file is ever missing the gallery falls back to generated gradient
placeholders, so the page never looks broken.

To swap or add a photo, edit the `src` values in the gallery section of
`index.html` and set each `<img>`'s `width` and `height` to the new file's real
pixel dimensions. Those attributes reserve the masonry tile's shape while the
image loads — a wrong ratio makes the layout jump.

## Still to add

`og-cover.jpg` (1200×630) is referenced by the Open Graph tags as the link
preview image for WhatsApp, iMessage and social sharing. Until it exists those
previews show no image.
