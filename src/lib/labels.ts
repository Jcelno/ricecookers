/** Letter label for a list position: 0 → A … 25 → Z, 26 → AA, 27 → AB … Deterministic, used for every analog marker. */
export function letterFor(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
