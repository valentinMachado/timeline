/**
 * A photo the reader picks (on a phone, one just taken), brought down to the
 * size it is kept at so that a timeline full of them stays light enough to
 * store and to export.
 */

import { scaledSize } from "../shared/myTimeline.js";

/** JPEG quality: a museum label stays legible, the file stays small. */
const QUALITY = 0.85;

/**
 * @param {Blob} file the picture as picked
 * @returns {Promise<string>} a JPEG data URL, its longest side at most
 *   `PHOTO_MAX_SIZE`, turned the way the camera held it
 * @throws {Error} when the file is not a picture the browser can read
 */
export async function photoFromFile(file) {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  const { width, height } = scaledSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", QUALITY);
}
