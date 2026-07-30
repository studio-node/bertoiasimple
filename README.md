# Site Instructions

## Repository & Asset Structure

All instrument media files are stored as WebP (`.webp`) images and OGG (`.ogg`) audio files inside category directories under `Instruments/`:

```
Instruments/
├── Gongs/
│   └── [Instrument Name]/
│       ├── [image].webp
│       └── [audio].ogg
├── Singing Bars/
│   └── [Instrument Name]/
│       ├── [image].webp
│       └── [audio].ogg
├── Tonals/
│   ├── Rods/
│   │   └── [Instrument Name]/
│   └── Tops/
│       └── [Instrument Name]/
└── Combinations/
    └── [Instrument Name]/
```

Global site assets (logos, background images) reside in `assets/images/`:
- `assets/images/bertoia_logo.webp`: Header logo and favicon.
- `assets/images/background.webp`: Main site background image.

---

## Adding a New Instrument

1. **Add Media Files**: Create a directory under `Instruments/<Category>/<Instrument Name>/` and place your `.webp` image and `.ogg` audio file inside it.
2. **Register in `script.js`**: Add an object entry to the `instruments` array in `script.js`:

```javascript
{
    id: 'my-new-instrument',
    category: 'gongs', // Valid categories: 'gongs', 'singing-bars', 'tonals-tops', 'tonals-rods', or 'combinations'
    image: "Instruments/Gongs/My New Instrument/image.webp",
    sound: "Instruments/Gongs/My New Instrument/sound.ogg",
    buffer: null,
    activeInstances: [],
    isLooping: false,
    name: "My New Instrument",
    material: "Silicon bronze",
    year: "Made in 1975",
    size: "48 × 48 in.",
    link: "https://catalogue.harrybertoia.org/catalogue/entry.php?id=..."
},
```

> **Note**: The Grave Gong uses `id: 'grave-gong'` and automatically renders anchored at the bottom footer section of `index.html`.

---

## Editing or Removing Instruments

- **Editing**: Update properties or file paths inside `script.js`. If replacing media files, keep them as `.webp` for images and `.ogg` for audio in `Instruments/<Category>/<Instrument Name>/`.
- **Removing**: Delete or comment out the instrument object in `script.js`, and remove its folder from `Instruments/`.

---

## Site Pages & Navigation

### Pages & Slugs
- `home` (`home.html` / `index.html`): Main virtual barn interactive simulator.
- `sonambient-barn` (`sonambient-barn.html`): Background and history of the Sonambient Barn.
- `materials` (`materials.html`): Technical details on metals and sculpture types.
- `monotypes` (`monotypes.html`): Monotype artwork relationships.
- `coming-soon` (`coming-soon.html`): Placeholder page for upcoming content.

### Navigation Links
Navigation links are defined across HTML headers and `nav.js` (which handles mobile slide-out navigation). To modify site navigation, update the `<nav class="site-nav">` markup in the HTML files and `nav.js`.

---

## Local Development

Run a local server with:
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000` in your web browser.