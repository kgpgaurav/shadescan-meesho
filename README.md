# ShadeScan

A working prototype for Meesho ShadeMatch. It reads the colour of a real product through the
camera, turns that into a standardised colour code, uses the code as a shopping filter, and lets
a shopper test the shade on their own skin before buying.

Everything runs in the browser. No server, no build step, no API key.

## The flow

1. **Scan** a product and tap any point on the captured photo to read that exact spot.
2. **Choose a category** — lipstick, eye shadow, nail colour or hair colour.
3. **Shop by shade.** The scanned colour arrives as a filter alongside Meesho's usual ones, with
   a closeness slider that decides how far from your colour the results may stray.
4. **Open a product** for its Shade Passport, customer reviews, and creator demonstrations that
   state what the creator did not like as well as what they did.
5. **Swatch it on your skin** the way people actually test lipstick — on the back of the hand
   rather than straight onto the lips.

## Pages

| File | What it is |
| --- | --- |
| `index.html` | Scanner, live face try on, and the swatch test |
| `shop.html` | Results grid with the shade filter — `?cat=lipstick&hex=%23A8664C` |
| `product.html` | Product page with reviews and creator demos — `?id=ML-1042` |

## The three tools in index.html

**Shade scan.** Aim and tap Capture. The frame freezes and any point on the photo can be tapped
to read the colour there. Each tap drops a numbered pin; several points from one photo can be
compared against each other by ΔE, which is how a seller photo and a customer photo can be put
side by side and the difference stated as a number. Hex, RGB, HSL, CIE Lab and the nearest
catalogue shade are shown for the selected point, with a magnified view of the sampled disc.

**Try on face.** Face landmark tracking paints lip colour inside the lip outline and eye shadow
on the lid between lash line and brow, composited onto the real skin in the video.

**Swatch test.** Capture or load a photo of your hand, pick shades, and drag to lay a swatch
anywhere on it. Finish changes how the swatch renders: matte lays flat, glossy and shimmer get a
lighter core so the sheen reads. Tap "Pick skin tone" and tap bare skin to record your own tone
from the same photo, so the comparison is against your skin rather than a generic chart.

## How the colour is read

Averaging the pixels inside a frame does not work on real products: a lipstick in its tube
contains a specular highlight, clear plastic, a metal band and background, and the mean of all of
that is a muddy grey. `color.js` does this instead:

1. Crop a circular disc around the tapped point, about 2.2% of the photo's shorter side.
2. Convert each pixel to CIE Lab.
3. Discard the lightest and darkest 12% by `L`, removing a highlight or a shadow edge.
4. Run k-means with k = 3 and measure how far apart the centroids sit.
5. Within ΔE 9 the disc is one colour, so return the trimmed mean. Beyond that the disc straddles
   an edge, so score each cluster by chroma and area, skip near-white and near-black, take the
   winner.

Spread within the disc sets the confidence label. On uniform patches, recovered colours land
within ΔE 0.2 of ground truth; on a disc where 30% of the area is a blown white highlight the
product colour is still recovered exactly.

## The closeness slider

Colour matching needs a tolerance, and the honest way to present one is to let the shopper move
it. The slider is a ΔE threshold against the scanned colour. Tight, and only shades a person
would call the same colour survive. Loose, and the whole category comes back. If a category has
nothing within the current tolerance — scan a brown lipstick, switch to nail colour — the slider
widens itself to reach the six nearest and says so, rather than showing an empty grid.

## Suitability notes

The swatch test and the product page both report how a shade is likely to read on you. This is
computed, not guessed, from what you saved:

- **Lightness contrast** between the shade and your skin in `L*`. Too little and a lip shade reads
  as barely there; a lot and it reads as a statement.
- **Undertone**, from the shade's hue angle in Lab against the undertone you saved.
- **Finish and budget** against your stated preferences.

Each note says which input produced it. Nothing is hidden behind a score, and every verdict is
labelled a suggestion rather than a rule — the point is to inform a choice, not to make it.

Profile data is kept in `localStorage` on the device and is cleared by the Clear button. It never
leaves the browser.

## Running it

ES modules and `fetch` need an HTTP server rather than the file system.

```
python3 -m http.server 8000
```

Open `http://localhost:8000`. Cameras need a secure context; `localhost` counts, a plain `http://`
address on another device does not, so deploy before testing on a phone.

## Deploying

Push the folder, then Settings → Pages → Deploy from a branch → `main` → `/ (root)`.

## Changing the output format

Colour extraction ends at one value: an sRGB triplet with its Lab coordinates. Everything printed
after that lives in `formats.js` as a registry, one function per format:

```js
import { registerFormat } from './formats.js';

registerFormat('shadeId', {
  label: 'Shade ID',
  order: 60,
  render: reading => toShadeId(reading.lab)
});
```

`reading` carries `hex`, `rgb`, `lab`, `confidence`, `spread` and `share`. Return a string, or
`{ value, detail }` for a second line, or `null` to hide the row. Nothing in the scanner changes.

## Data

`shades.json` holds 62 products across four categories. Each entry needs `id`, `shade`, `hex`,
`category`, `categoryLabel`, `name`, `family`, `finish`, `coverage`, `price`, `mrp`, `rating`,
`reviewCount` and `seller`. Filters, matching, swatch rows and category tabs all read from it, so
extending the catalogue needs no code change.

`content.json` holds review and creator-demonstration text pooled per category. Each product is
assigned entries deterministically from its id, so the same product always shows the same reviews
without the file carrying an entry per product. All of it is placeholder copy written for the
prototype — swap in real content and the pages pick it up.

## Files

```
index.html      scanner, face try on, swatch test
shop.html       results grid and filters
product.html    product detail
styles.css      all styling
shades.json     product catalogue
content.json    review and creator text pools
color.js        colour spaces, clustering, shade extraction
catalogue.js    loading, categories, nearest-shade search, content assignment
formats.js      output format registry
scanner.js      camera, capture, point sampling
tryon.js        face landmarks and makeup compositing
swatch.js       swatch painting on a photo
profile.js      saved profile, swatch tray, suitability reasoning
ui.js           shared markup helpers and product artwork
app.js          wiring for index.html
shop.js         wiring for shop.html
product.js      wiring for product.html
```

## Limits worth stating

A digital colour code narrows a search; it does not predict how a shade looks once applied.
Camera white balance, screen calibration and ambient light all shift a reading, which is why the
confidence label is shown rather than hidden and matches carry a distance rather than a verdict.

Product imagery is generated from the shade itself rather than photographed, so the colour on
screen is the catalogue colour exactly.

Face tracking loads MediaPipe Face Landmarker from a CDN on first use, so the first try on needs
a network connection.
