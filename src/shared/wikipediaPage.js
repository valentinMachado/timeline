/**
 * What a Wikipedia page is, read from the classes MediaWiki puts on `<body>`.
 *
 * The content script runs in an isolated world and cannot reach `mw.config`,
 * but every skin (Vector, Vector 2022, Minerva on mobile, MonoBook, Timeless)
 * writes the namespace and the action as body classes, which it can read.
 */

/**
 * Whether the page is an article being read: the main namespace (`ns-0`),
 * viewed rather than edited or compared (`action-view`).
 *
 * @param {string} bodyClassName The `className` of the page's `<body>`.
 * @returns {boolean}
 */
export function isArticleView(bodyClassName) {
  const classes = new Set(bodyClassName.split(/\s+/));
  return classes.has("ns-0") && classes.has("action-view");
}
