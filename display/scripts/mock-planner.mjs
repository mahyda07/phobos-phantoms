// Written with AI assistance (Claude).
// Mock planner for local testing of src/planner.js. No dependencies. NOT the real planner.
// It checks the POST /plan body against contracts/plan.request.schema.json (by hand) and replies with
// samples/out/route.json byte-for-byte unchanged. That is a SAMPLE route: it only lines up with the samples grid.
//
// Usage (from display/):
//   node scripts/mock-planner.mjs                 # listens on http://127.0.0.1:8787
//   node scripts/mock-planner.mjs --delay 4000    # waits 4 s before answering (tests the 3 s fallback)
//   node scripts/mock-planner.mjs --fail          # always answers 500
//   node scripts/mock-planner.mjs --port 0        # any free port (the tests use this)
// then, in another terminal:
//   VITE_PLANNER_URL=http://127.0.0.1:8787 npm run dev:samples
//
// Routes: POST /plan, GET /health -> {"ok":true}, OPTIONS (CORS preflight). CORS allows http://127.0.0.1:5174.
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROUTE_FILE = path.resolve(HERE, "../../samples/out/route.json");
const ALLOWED_ORIGINS = ["http://127.0.0.1:5174", "http://localhost:5174", "http://127.0.0.1:5175"]; // 5175 = second local test server

const args = process.argv.slice(2);
const argVal = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt; };
const delayMs = Number(argVal("--delay", 0));
const fail = args.includes("--fail");
const port = Number(argVal("--port", 8787));
if (!Number.isFinite(delayMs) || delayMs < 0) { console.error("--delay needs a number of ms"); process.exit(2); }

const routeBytes = readFileSync(ROUTE_FILE); // sent unchanged
const log = (...m) => console.log(`[mock-planner ${new Date().toISOString().slice(11, 19)}]`, ...m);

/** Returns an error string, or null if the body fits contracts/plan.request.schema.json. */
function checkBody(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) return "body must be a JSON object";
  const allowed = ["frame", "start", "end", "stops", "use_hazard"];
  const extra = Object.keys(b).filter((k) => !allowed.includes(k));
  if (extra.length) return `unexpected keys: ${extra.join(", ")}`;
  for (const k of ["frame", "start", "end", "stops"]) if (!(k in b)) return `missing key: ${k}`;
  if (b.frame !== "jezero-local-v1") return `frame must be "jezero-local-v1"`;
  for (const k of ["start", "end"]) {
    const p = b[k];
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === "number" && Number.isFinite(v))) return `${k} must be [x, y] numbers`;
  }
  if (!Array.isArray(b.stops) || !b.stops.every((s) => typeof s === "string")) return "stops must be an array of strings";
  if (new Set(b.stops).size !== b.stops.length) return "stops must be unique";
  if ("use_hazard" in b && typeof b.use_hazard !== "boolean") return "use_hazard must be a boolean";
  return null;
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "600");
  }
}
const sendJson = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

const server = http.createServer((req, res) => {
  cors(req, res);
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") { log("OPTIONS", url.pathname, "(preflight) from", req.headers.origin || "no origin"); res.writeHead(204); res.end(); return; }
  if (req.method === "GET" && url.pathname === "/health") { log("GET /health"); sendJson(res, 200, { ok: true }); return; }
  if (req.method !== "POST" || url.pathname !== "/plan") { log(req.method, url.pathname, "-> 404"); sendJson(res, 404, { error: "not found" }); return; }

  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on("end", () => {
    let body;
    try { body = JSON.parse(raw); } catch { log("POST /plan -> 400 (not JSON)"); sendJson(res, 400, { error: "body is not JSON" }); return; }
    const err = checkBody(body);
    if (err) { log("POST /plan -> 400:", err); sendJson(res, 400, { error: err }); return; }
    log("POST /plan", JSON.stringify(body));
    const answer = () => {
      if (res.destroyed) { log("client went away before the answer"); return; }
      if (fail) { log("-> 500 (--fail)"); sendJson(res, 500, { error: "mock failure (--fail)" }); return; }
      log(`-> 200 samples/out/route.json (${routeBytes.length} bytes, SAMPLE route, unchanged)`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(routeBytes);
    };
    if (delayMs > 0) { log(`waiting ${delayMs} ms (--delay)`); setTimeout(answer, delayMs); } else answer();
  });
});

server.listen(port, "127.0.0.1", () => {
  const { port: p } = server.address();
  log(`listening on http://127.0.0.1:${p}${delayMs ? ` · delay ${delayMs} ms` : ""}${fail ? " · --fail (always 500)" : ""}`);
  log(`replying with ${path.relative(process.cwd(), ROUTE_FILE)}`);
});
