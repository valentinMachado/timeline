/**
 * Builds the extension once per browser into `dist/<browser>/`, ready to be
 * loaded unpacked: the manifest from `src/manifest.js`, the scripts it names
 * bundled by esbuild, and `src/_locales/` copied as is.
 *
 * Usage: `node scripts/build.js` builds once; `--watch` rebuilds whenever a
 * bundled script changes, rewriting the manifest and the locales with it (a
 * change to `src/_locales/` alone waits for the next one). The extension is
 * then reloaded by hand in the browser.
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { TARGETS, manifestFor, scriptsOf, sourceOf } from "../src/manifest.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The oldest browser each target supports, for esbuild's syntax lowering. */
const ENGINES = { chrome: "chrome120", firefox: "firefox140" };

/**
 * Writes the manifest and the locales of one target.
 *
 * @param {string} target A key of `TARGETS`.
 * @param {string} outdir The target's output directory.
 * @param {string} version The extension's version.
 */
async function writeStatic(target, outdir, version) {
  const manifest = manifestFor(target, version);
  await writeFile(
    path.join(outdir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await cp(path.join(ROOT, "src/_locales"), path.join(outdir, "_locales"), {
    recursive: true,
  });
}

/**
 * The esbuild options that bundle one target's scripts.
 *
 * @param {string} target A key of `TARGETS`.
 * @param {string} outdir The target's output directory.
 * @param {string} version The extension's version.
 * @returns {import("esbuild").BuildOptions}
 */
function optionsFor(target, outdir, version) {
  const entryPoints = scriptsOf(manifestFor(target, version)).map((out) => ({
    in: path.join(ROOT, sourceOf(out)),
    out: out.replace(/\.js$/, ""),
  }));
  return {
    entryPoints,
    outdir,
    bundle: true,
    // A content script is a classic script, not a module.
    format: "iife",
    target: ENGINES[target],
    logLevel: "info",
    plugins: [
      {
        name: "static-files",
        setup(build) {
          build.onEnd(() => writeStatic(target, outdir, version));
        },
      },
    ],
  };
}

/** Builds every target, or watches them all with `--watch`. */
async function main() {
  const watch = process.argv.includes("--watch");
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json")));

  for (const target of Object.keys(TARGETS)) {
    const outdir = path.join(ROOT, "dist", target);
    await rm(outdir, { recursive: true, force: true });
    await mkdir(outdir, { recursive: true });
    const options = optionsFor(target, outdir, pkg.version);
    if (watch) {
      await (await esbuild.context(options)).watch();
    } else {
      await esbuild.build(options);
    }
  }
}

await main();
