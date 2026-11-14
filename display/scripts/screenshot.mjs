// Written with AI assistance (Claude).
// Screenshot of a page in headless Firefox, driven over Marionette. No npm dependencies.
//
// Usage (from display/, with the dev server running):
//   node scripts/screenshot.mjs --url http://127.0.0.1:5174/ --out screens/name.png
//        [--width 1600 --height 900] [--wait 4000] [--click "Proof view"]
//
//   --width/--height  viewport size in CSS pixels (default 1600 x 900; the PNG has exactly this size). Below
//                     Firefox's minimum window size (~450-500 px wide) the page is shown in an iframe of that size.
//   --wait            ms to wait after the page loads, before clicking / taking the shot (default 4000)
//   --click           text of a button to click first (exact match after trimming); waits 1 s after the click
//
// It starts its own Firefox (`firefox` on PATH, or FIREFOX=/path/to/firefox) with a fresh temporary profile
// under ~/snap/firefox/common/ (the snap build cannot read /tmp), takes the shot, quits Firefox and deletes
// the profile. A free Marionette port is picked each run, so several shots can run side by side.
import net from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

function parseArgs(argv) {
  const opts = { width: 1600, height: 900, wait: 4000, url: null, out: null, click: null };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (!(key in opts)) fail(`unknown option ${argv[i]}`);
    const val = argv[++i];
    if (val === undefined) fail(`missing value for --${key}`);
    opts[key] = ["width", "height", "wait"].includes(key) ? Number(val) : val;
    if (typeof opts[key] === "number" && !(opts[key] >= 0)) fail(`--${key} must be a number`);
  }
  if (!opts.url || !opts.out) fail("usage: node scripts/screenshot.mjs --url <url> --out <file.png> [--width 1600 --height 900] [--wait 4000] [--click \"Button text\"]");
  return opts;
}
function fail(msg) { console.error("screenshot: " + msg); process.exit(1); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once("error", rej);
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

// Marionette wire format: "<byte length>:<json>". Commands are [0, id, name, params]; replies [1, id, error, result].
function connect(port) {
  return new Promise((resolveConn, rejectConn) => {
    const sock = net.connect(port, "127.0.0.1");
    let buf = Buffer.alloc(0);
    let id = 0;
    const pending = new Map();
    sock.once("error", rejectConn);
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        const c = buf.indexOf(":");
        if (c < 0) return;
        const len = parseInt(buf.subarray(0, c).toString(), 10);
        if (buf.length < c + 1 + len) return;
        const msg = JSON.parse(buf.subarray(c + 1, c + 1 + len).toString());
        buf = buf.subarray(c + 1 + len);
        if (!Array.isArray(msg)) { resolveConn(client); continue; } // greeting
        const [, mid, err, result] = msg;
        const p = pending.get(mid);
        pending.delete(mid);
        if (!p) continue;
        if (err) p.rej(new Error(`${p.name}: ${err.error || ""} ${err.message || JSON.stringify(err)}`.trim()));
        else p.res(result);
      }
    });
    sock.on("close", () => { for (const p of pending.values()) p.rej(new Error(`${p.name}: connection closed`)); pending.clear(); });
    const client = {
      send(name, params = {}) {
        return new Promise((res, rej) => {
          const m = JSON.stringify([0, ++id, name, params]);
          pending.set(id, { res, rej, name });
          sock.write(Buffer.byteLength(m) + ":" + m);
        });
      },
      close() { sock.end(); },
    };
  });
}

async function connectWithRetry(port, proc, timeoutMs = 30000) {
  const t0 = Date.now();
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`Firefox exited early (code ${proc.exitCode}) before Marionette started`);
    try { return await connect(port); } catch {
      if (Date.now() - t0 > timeoutMs) throw new Error(`Marionette did not answer on 127.0.0.1:${port} within ${timeoutMs / 1000} s`);
      await sleep(300);
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const out = resolve(opts.out);

  // Check the page server first, so a stopped dev server gives a clear message instead of a blank PNG.
  try {
    const r = await fetch(opts.url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) fail(`${opts.url} answered HTTP ${r.status}`);
  } catch (e) {
    fail(`cannot reach ${opts.url} (${e.cause?.code || e.message}). Is the dev server running?`);
  }

  const base = join(homedir(), "snap", "firefox", "common");
  mkdirSync(base, { recursive: true });
  const profile = mkdtempSync(join(base, "screenshot-profile-"));
  const port = await freePort();
  writeFileSync(join(profile, "user.js"), [
    `user_pref("marionette.port", ${port});`,
    `user_pref("browser.shell.checkDefaultBrowser", false);`,
    `user_pref("browser.startup.homepage_override.mstone", "ignore");`,
    `user_pref("datareporting.policy.dataSubmissionEnabled", false);`,
    `user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);`,
    `user_pref("app.update.auto", false);`,
  ].join("\n") + "\n");

  const bin = process.env.FIREFOX || "firefox";
  const proc = spawn(bin, ["--headless", "--marionette", "-no-remote", "-profile", profile], { stdio: "ignore" });
  let spawnError = null;
  proc.on("error", (e) => { spawnError = e; });
  const exited = new Promise((r) => proc.once("exit", r));

  let mn = null;
  let sessionOpen = false;
  try {
    await sleep(200);
    if (spawnError) throw new Error(`cannot start Firefox ("${bin}"): ${spawnError.code || spawnError.message}. Install it or set FIREFOX=/path/to/firefox`);
    mn = await connectWithRetry(port, proc);
    await mn.send("WebDriver:NewSession", { capabilities: {} });
    sessionOpen = true;

    // Window size = viewport + browser chrome, so the viewport ends up exactly width x height.
    await mn.send("WebDriver:SetWindowRect", { width: opts.width, height: opts.height });
    const d = await mn.send("WebDriver:ExecuteScript", { script: "return [outerWidth - innerWidth, outerHeight - innerHeight]", args: [] });
    await mn.send("WebDriver:SetWindowRect", { width: opts.width + d.value[0], height: opts.height + d.value[1] });
    const inner = (await mn.send("WebDriver:ExecuteScript", { script: "return [innerWidth, innerHeight]", args: [] })).value;
    // Firefox will not make a window narrower than about 450-500 px. For phone sizes the page is loaded in an
    // iframe of exactly width x height instead (CSS media queries then see the iframe's size) and only that
    // iframe is captured.
    const framed = inner[0] !== opts.width || inner[1] !== opts.height;
    if (framed) {
      await mn.send("WebDriver:SetWindowRect", { width: Math.max(inner[0], opts.width) + d.value[0], height: Math.max(inner[1], opts.height) + d.value[1] });
    }

    try {
      await mn.send("WebDriver:Navigate", { url: opts.url });
    } catch (e) {
      throw new Error(`Firefox could not load ${opts.url}: ${e.message}`);
    }
    let frameEl = null;
    if (framed) {
      await mn.send("WebDriver:ExecuteScript", {
        script: `const [url, w, h] = arguments; document.open();
          document.write('<!doctype html><html><body style="margin:0;background:#000"><iframe id="shot-frame" style="border:0;display:block;width:' + w + 'px;height:' + h + 'px"></iframe></body></html>');
          document.close(); document.getElementById("shot-frame").src = url;`,
        args: [opts.url, opts.width, opts.height],
      });
      for (let t = 0; t < 100; t++) {
        const r = await mn.send("WebDriver:ExecuteScript", { script: "const f = document.getElementById('shot-frame'); return !!f && !!f.contentDocument && f.contentDocument.URL !== 'about:blank' && f.contentDocument.readyState === 'complete';", args: [] });
        if (r.value) break;
        await sleep(100);
      }
      frameEl = (await mn.send("WebDriver:ExecuteScript", { script: "return document.getElementById('shot-frame')", args: [] })).value;
    }
    await sleep(opts.wait);

    if (opts.click) {
      const r = await mn.send("WebDriver:ExecuteScript", {
        script: "const f = document.getElementById('shot-frame'); const doc = f && f.contentDocument ? f.contentDocument : document; const b = [...doc.querySelectorAll('button')].find((x) => x.textContent.trim() === arguments[0]); if (!b) return false; b.click(); return true;",
        args: [opts.click],
      });
      if (!r.value) throw new Error(`no button with text "${opts.click}" on the page`);
      await sleep(1000);
    }

    const vp = await mn.send("WebDriver:ExecuteScript", {
      script: "const f = document.getElementById('shot-frame'); const w = f && f.contentWindow ? f.contentWindow : window; return [w.innerWidth, w.innerHeight];", args: [] });
    const elementId = frameEl && Object.values(frameEl)[0];
    const shot = await mn.send("WebDriver:TakeScreenshot", elementId ? { id: elementId, full: false } : { full: false });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, Buffer.from(shot.value, "base64"));
    console.log(`wrote ${opts.out} (viewport ${vp.value[0]}x${vp.value[1]}${framed ? ", via iframe" : ""})`);
  } finally {
    // Clean shutdown. Marionette:Quit only works while a session is open (it ends the session too), so it is
    // sent first; DeleteSession is only a fallback. The snap build is AppArmor-confined, so a plain kill from
    // outside may be refused: Quit is the reliable way out. Always delete the profile.
    let quitOk = false;
    if (mn) {
      if (sessionOpen) {
        quitOk = await Promise.race([mn.send("Marionette:Quit").then(() => true, () => false), sleep(10000).then(() => false)]);
        if (!quitOk) await mn.send("WebDriver:DeleteSession").catch(() => {});
      }
      mn.close();
    }
    if (proc.exitCode === null && !spawnError) {
      const done = await Promise.race([exited.then(() => true), sleep(quitOk ? 15000 : 2000).then(() => false)]);
      if (!done) {
        try { proc.kill("SIGTERM"); } catch {}
        await Promise.race([exited, sleep(3000)]);
        if (proc.exitCode === null && proc.signalCode === null) {
          console.error(`screenshot: Firefox (pid ${proc.pid}) did not exit; stop it by hand: kill ${proc.pid}`);
        }
      }
    }
    proc.unref();
    await sleep(500); // let Firefox finish writing to the profile before it is removed
    rmSync(profile, { recursive: true, force: true });
  }
}

main().then(() => process.exit(0), (e) => fail(e.message));