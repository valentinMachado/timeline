/**
 * Builds the extension once per browser into `dist/<browser>/`, ready to be
 * loaded unpacked: the manifest from `src/manifest.js`, the scripts it names
 * bundled by esbuild, its pages and `src/_locales/` copied as is. Builds the
 * installable site into `dist/web/` beside them, as `src/web/manifest.js`
 * describes it.
 *
 * Usage: `node scripts/build.js` builds once; `--watch` rebuilds whenever a
 * bundled script changes, rewriting the manifest, the pages and the locales
 * with it, and the site's files and service worker (a change to those alone
 * waits for the next one). The extension is
 * then reloaded by hand in the browser.
 */

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import {
  PAGES,
  TARGETS,
  manifestFor,
  scriptsOf,
  sourceOf,
} from "../src/manifest.js";
import { localize } from "../src/shared/messages.js";
import {
  WEB_FILES,
  WEB_MANIFEST,
  WEB_SCRIPT,
  WEB_WORKER,
  shellOf,
  webManifestFile,
} from "../src/web/manifest.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The oldest browser each target supports, for esbuild's syntax lowering. */
const ENGINES = { chrome: "chrome120", firefox: "firefox140" };

/** The oldest browsers the installable site supports. */
const WEB_ENGINES = ["chrome120", "firefox140", "safari16"];

/**
 * The `package.json` condition under which `#i18n` and its kind resolve to
 * the site's own module rather than the extension's.
 */
const WEB_CONDITION = "web";

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
  for (const page of PAGES) {
    await mkdir(path.dirname(path.join(outdir, page)), { recursive: true });
    await cp(path.join(ROOT, sourceOf(page)), path.join(outdir, page));
  }
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
    // A content script is a classic script, not a module; the other
    // scripts are built alike, so one bundle format fits them all.
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

/** @returns {Promise<string[]>} the languages there are messages for */
async function languages() {
  return readdir(path.join(ROOT, "src/_locales"));
}

/**
 * Writes the site's files and its manifest in every language, then bundles
 * its service worker with the list of the files it keeps and their hash.
 *
 * @param {string} outdir `dist/web`
 */
async function writeWeb(outdir) {
  const source = path.join(ROOT, "src/web");
  for (const file of WEB_FILES) {
    await mkdir(path.dirname(path.join(outdir, file)), { recursive: true });
    await cp(path.join(source, file), path.join(outdir, file));
  }
  const spoken = await languages();
  for (const language of spoken) {
    const messages = JSON.parse(
      await readFile(
        path.join(ROOT, "src/_locales", language, "messages.json"),
      ),
    );
    await writeFile(
      path.join(outdir, webManifestFile(language)),
      `${JSON.stringify(localize(WEB_MANIFEST, messages), null, 2)}
`,
    );
  }
  const files = shellOf(spoken);
  const hash = createHash("sha256");
  // "./" is index.html, already in the list.
  for (const file of files.filter((file) => file !== "./")) {
    hash.update(await readFile(path.join(outdir, file)));
  }
  await esbuild.build({
    entryPoints: [path.join(source, WEB_WORKER)],
    outfile: path.join(outdir, WEB_WORKER),
    bundle: true,
    format: "iife",
    target: WEB_ENGINES,
    define: {
      __SHELL__: JSON.stringify({
        version: hash.digest("hex").slice(0, 12),
        files,
      }),
    },
    logLevel: "warning",
  });
}

/**
 * The esbuild options that bundle the site's page script; its files and
 * its service worker follow each build.
 *
 * @param {string} outdir `dist/web`
 * @returns {import("esbuild").BuildOptions}
 */
function webOptions(outdir) {
  return {
    entryPoints: [path.join(ROOT, "src/web", WEB_SCRIPT)],
    outfile: path.join(outdir, WEB_SCRIPT),
    bundle: true,
    format: "iife",
    target: WEB_ENGINES,
    conditions: [WEB_CONDITION],
    logLevel: "info",
    plugins: [
      {
        name: "web-files",
        setup(build) {
          build.onEnd(() => writeWeb(outdir));
        },
      },
    ],
  };
}

/**
 * Empties an output directory, then builds into it once or for good.
 *
 * @param {string} outdir
 * @param {import("esbuild").BuildOptions} options
 * @param {boolean} watch
 */
async function buildInto(outdir, options, watch) {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  if (watch) {
    await (await esbuild.context(options)).watch();
  } else {
    await esbuild.build(options);
  }
}

/** Builds every target, or watches them all with `--watch`. */
async function main() {
  const watch = process.argv.includes("--watch");
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json")));

  for (const target of Object.keys(TARGETS)) {
    const outdir = path.join(ROOT, "dist", target);
    await buildInto(outdir, optionsFor(target, outdir, pkg.version), watch);
  }
  const web = path.join(ROOT, "dist", "web");
  await buildInto(web, webOptions(web), watch);
}

await main();
