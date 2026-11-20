/**
 * The picture an entry of the reader's timeline shows, whichever of its
 * three kinds it is: the thumbnail of a Wikipedia article, a picture online,
 * or a photo kept on the device.
 */

import { loadPhoto } from "./store.js";
import { thumbnailOf } from "./summaries.js";

/**
 * @param {import("../shared/myTimeline.js").Image | null} image
 * @returns {Promise<string | null>} a URL an `<img>` can show, null when
 *   there is nothing to show
 */
export function pictureOf(image) {
  if (!image) return Promise.resolve(null);
  if ("summary" in image) {
    return thumbnailOf(image.summary).then((url) => url ?? image.fallback);
  }
  if ("photo" in image) return loadPhoto(image.photo);
  return Promise.resolve(image.url);
}
