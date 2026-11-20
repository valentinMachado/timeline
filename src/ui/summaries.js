/**
 * The pictures of the articles a timeline's events lead to, asked of
 * Wikipedia's REST API (`page/summary`) only for the cards on screen, a few
 * at a time, each once per page.
 */

/** How many summaries may be asked for at once: Wikipedia asks for restraint. */
const CONCURRENCY = 4;

/** Each summary URL asked for, with what it gave, so it is asked once. */
const known = new Map();

/** Requests waiting for a free slot, first come first served. */
const waiting = [];

let running = 0;

/** Starts the waiting requests while slots are free. */
function pump() {
  while (running < CONCURRENCY && waiting.length) {
    const { url, resolve } = waiting.shift();
    running++;
    fetch(url, { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((summary) => resolve(summary?.thumbnail?.source ?? null))
      // A missing picture is not an error the reader can act on.
      .catch(() => resolve(null))
      .finally(() => {
        running--;
        pump();
      });
  }
}

/**
 * The thumbnail of the article a summary URL describes.
 *
 * @param {string} url from `summaryUrl`
 * @returns {Promise<string | null>} the picture's URL, null when the article
 *   has none or the API did not answer
 */
export function thumbnailOf(url) {
  if (!known.has(url)) {
    known.set(
      url,
      new Promise((resolve) => {
        waiting.push({ url, resolve });
        pump();
      }),
    );
  }
  return known.get(url);
}
