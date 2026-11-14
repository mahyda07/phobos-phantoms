// Written with AI assistance (Claude).
// "Download the current route" buttons: GeoJSON (route.json as-is) and per-point CSV.
// RULE: nothing is recomputed, rounded or added. GeoJSON = the route object the app holds, unchanged.
// CSV = values copied from geometry.coordinates[i] and properties.per_vertex.<field>[i], written as String(value).
// Columns: x_m east, y_m north (negative = south), z_m elevation on the DTM datum; metres; frame jezero-local-v1.

export const CSV_COLUMNS = ["point", "x_m", "y_m", "z_m", "t_min", "margin_min", "slope_deg", "hazard"];
const PV_FIELDS = ["t_min", "margin_min", "slope_deg", "hazard"];
const NO_ROUTE = "No planned route yet";

/** Pure: route (route.schema.json Feature) → CSV string, header + one row per route point, "\n" endings. */
export function routeToCsv(route) {
  const coords = route?.geometry?.coordinates;
  const pv = route?.properties?.per_vertex;
  if (!Array.isArray(coords) || !pv) throw new Error("routeToCsv: not a route (missing coordinates or per_vertex)");
  for (const k of PV_FIELDS) {
    if (!Array.isArray(pv[k]) || pv[k].length !== coords.length) {
      throw new Error(`routeToCsv: per_vertex.${k} length does not match coordinates (${coords.length})`);
    }
  }
  const lines = [CSV_COLUMNS.join(",")];
  for (let i = 0; i < coords.length; i++) {
    const [x, y, z] = coords[i];
    lines.push([i, x, y, z, ...PV_FIELDS.map((k) => pv[k][i])].map((v) => String(v)).join(","));
  }
  return lines.join("\n") + "\n";
}

/** Pure: "marswalk-route-<plan-id>.<ext>", plan_id lowercased and reduced to [a-z0-9-]. */
export function routeFileName(route, ext) {
  const raw = String(route?.properties?.plan_id ?? "");
  const id = raw.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  const e = String(ext ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return `marswalk-route-${id || "unnamed"}${e ? "." + e : ""}`;
}

function download(text, type, name) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Renders the two download buttons into `container`. getRoute() → current route object or null. */
export function initExport(container, getRoute) {
  const wrap = document.createElement("div");
  wrap.className = "export-tools";
  const row = document.createElement("div");
  row.className = "export-buttons";
  const mk = (label, aria) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "export-btn";
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    row.appendChild(b);
    return b;
  };
  const geoBtn = mk("⬇ Route (GeoJSON)", "Download the route as GeoJSON");
  const csvBtn = mk("⬇ Points (CSV)", "Download the route points as CSV");
  const note = document.createElement("p");
  note.className = "export-note";
  note.textContent = "Exactly the route shown on the map (frame jezero-local-v1, local metres).";
  wrap.append(row, note);
  container.appendChild(wrap);

  const refresh = () => {
    const has = !!getRoute();
    for (const b of [geoBtn, csvBtn]) {
      b.disabled = !has;
      if (has) b.removeAttribute("title"); else b.title = NO_ROUTE;
    }
    return has;
  };
  const onGeo = () => {
    const r = getRoute();
    if (!refresh() || !r) return;
    download(JSON.stringify(r, null, 2), "application/geo+json", routeFileName(r, "geojson"));
  };
  const onCsv = () => {
    const r = getRoute();
    if (!refresh() || !r) return;
    let csv;
    try { csv = routeToCsv(r); } catch (e) { console.warn(e); csvBtn.title = "Route has no per-point data"; return; }
    download(csv, "text/csv;charset=utf-8", routeFileName(r, "csv"));
  };
  geoBtn.addEventListener("click", onGeo);
  csvBtn.addEventListener("click", onCsv);
  refresh();

  return {
    refresh,
    destroy() {
      geoBtn.removeEventListener("click", onGeo);
      csvBtn.removeEventListener("click", onCsv);
      wrap.remove();
    },
  };
}
