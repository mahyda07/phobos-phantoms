// Written with AI assistance (Claude).
// Reads one row of docs/cost-model.md (a markdown table owned by the planner team). Values are shown, never used
// to compute anything. Returns { value, unit, note } or null when the row or its value is missing.
export function costModelRow(md, label) {
  for (const line of String(md || "").split("\n")) {
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim()); // ignore escaped \| inside a cell
    if (cells.length < 5 || !cells[1].toLowerCase().startsWith(label.toLowerCase())) continue;
    const value = Number(cells[2]);
    if (!cells[2] || !Number.isFinite(value)) return null;
    return { value, unit: cells[3], note: cells[4] || "source not given" };
  }
  return null;
}
