// CSV export of ranked lists. Values are written exactly as the API returned them; empty means no data.
type Cell = string | number | boolean | null | undefined;
const esc = (v: Cell) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(6)) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function downloadCsv(filename: string, header: string[], rows: Cell[][], notes: string[] = []) {
  const lines = [...notes.map((n) => `# ${n}`), header.join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
