/**
 * The installable site's service worker: keeps the site itself, so that it
 * opens without a network and says so, rather than the browser's error
 * page. An article is never kept: it is asked of Wikipedia each time.
 *
 * The build fills `__SHELL__` with the files to keep (`shellOf`) and a
 * version, a hash of their content: a new version is a new cache, installed
 * beside the old one, which is dropped once the new worker takes over.
 */

/* global __SHELL__ */

/** @type {{ version: string, files: string[] }} */
const SHELL = __SHELL__;

/** Caches are shared by the whole origin, which may serve other sites. */
const PREFIX = "timeline-shell-";

const CACHE = `${PREFIX}${SHELL.version}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.files))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== location.origin) return;
  // The site is one page whatever its query: `./?url=…` is `./`.
  event.respondWith(
    caches
      .match(request, { cacheName: CACHE, ignoreSearch: true })
      .then((kept) => kept ?? fetch(request)),
  );
});
