/** Compare the initial JS declared in Vite's HTML: entry + modulepreloads, excluding lazy imports. */
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const directory = resolve(process.argv[2] ?? "dist");
const html = readFileSync(resolve(directory, "index.html"), "utf8");
const paths = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(match => match[1]))];
if (!paths.length) throw new Error("No JavaScript entry or preload tags found; build first.");
const chunks = paths.map(path => {
  const buffer = readFileSync(resolve(directory, path.replace(/^\//, "")));
  return { path, bytes: buffer.length, gzip: gzipSync(buffer).length };
});
console.log(JSON.stringify({ chunks, initialBytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0), initialGzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzip, 0) }, null, 2));
