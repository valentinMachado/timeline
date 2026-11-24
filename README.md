# timeline

A browser extension (Chrome and Firefox) that reads the dates of the page
you are on — Wikipedia first — and draws them as an illustrated timeline: each
event with the picture of its article, leading back to it. You can also keep a
timeline of your own, in layers, filled from what you read.

Work in progress: on a French or English Wikipedia article, a banner above the
text draws the article's dates as a timeline you zoom with the wheel (or two
fingers) and pan by dragging; each card shows the picture of its article,
scrolls the text to its date when clicked, and opens the article with its ↗.
The other way round, the dates read are highlighted in the text: click one
to see its event on the timeline.
The + of a card, or the button that appears below text you select,
adds the event to your own timeline: layers, tags, a description, a picture
or a photo of yours. Open it from the extension's toolbar button; export it
to a file to carry it to another device.

```bash
npm install
npm test
npm run build   # dist/chrome, dist/firefox (loadable unpacked) and dist/web
```

Load it in Chrome from `chrome://extensions` (developer mode, _Load unpacked_,
`dist/chrome`), in Firefox from `about:debugging#/runtime/this-firefox`
(_Load Temporary Add-on_, `dist/firefox/manifest.json`).

On a phone whose browser takes no extension (Chrome on Android), the same
timeline is an installable site, published from `dist/web` to
<https://valentinmachado.github.io/timeline/>: install it from the browser's
menu, then share a Wikipedia article to it, or paste an address or a title.
To try it locally, serve `dist/web` over HTTP (for instance
`python -m http.server -d dist/web`). The article's text comes from
Wikipedia under CC BY-SA 4.0, credited under it.

Contributing: [CLAUDE.md](CLAUDE.md) and [docs/CONVENTIONS.md](docs/CONVENTIONS.md).
