# timeline

A browser extension (Chrome and Firefox) that reads the dates of the page
you are on — Wikipedia first — and draws them as an illustrated timeline: each
event with the picture of its article, leading back to it. You can also keep a
timeline of your own, in layers, filled from what you read.

Work in progress: on a French or English Wikipedia article, a banner above the
text draws the article's dates as a timeline you zoom with the wheel and pan
by dragging; each card shows the picture of the article it leads to. Your own
timeline is not there yet.

```bash
npm install
npm test
npm run build   # dist/chrome and dist/firefox, each loadable unpacked
```

Load it in Chrome from `chrome://extensions` (developer mode, _Load unpacked_,
`dist/chrome`), in Firefox from `about:debugging#/runtime/this-firefox`
(_Load Temporary Add-on_, `dist/firefox/manifest.json`).

Contributing: [CLAUDE.md](CLAUDE.md) and [docs/CONVENTIONS.md](docs/CONVENTIONS.md).
