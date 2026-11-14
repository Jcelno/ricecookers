// Copies runtime assets that must be served as plain files:
//   CesiumJS workers, star map and widget CSS  → public/cesium
//   MapLibre GL web worker                     → public/maplibre
// Runs before `npm run dev` and `npm run build`; skips when versions match.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const version = (pkg) => JSON.parse(readFileSync(join(nm, pkg, "package.json"), "utf8")).version;

function sync(name, pkg, copy) {
  if (!existsSync(join(nm, pkg))) {
    console.error(`${pkg} is not installed yet; run npm install first`);
    return;
  }
  const dst = join(root, "public", name);
  const stamp = join(dst, ".version");
  const v = version(pkg);
  if (existsSync(stamp) && readFileSync(stamp, "utf8") === v) return;
  mkdirSync(dst, { recursive: true });
  copy(dst);
  writeFileSync(stamp, v);
  console.log(`copied ${pkg} ${v} assets to public/${name}`);
}

sync("cesium", "cesium", (dst) => {
  const src = join(nm, "cesium", "Build", "Cesium");
  for (const dir of ["Workers", "ThirdParty", "Assets", "Widgets"]) cpSync(join(src, dir), join(dst, dir), { recursive: true });
});
sync("maplibre", "maplibre-gl", (dst) => {
  cpSync(join(nm, "maplibre-gl", "dist", "maplibre-gl-worker.mjs"), join(dst, "maplibre-gl-worker.mjs"));
});
