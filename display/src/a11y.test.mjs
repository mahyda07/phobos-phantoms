// Written with AI assistance (Claude).
// Tests for the pure part of a11y.js (keyAction, SHORTCUTS). DOM-free: run with `node --test src/a11y.test.mjs`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { keyAction, SHORTCUTS } from "./a11y.js";

const body = { tagName: "BODY", isContentEditable: false };
const ev = (key, extra = {}, target = body) => ({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target, ...extra });

test("every key mapping", () => {
  const cases = [
    ["ArrowRight", {}, "next"], ["ArrowLeft", {}, "prev"],
    ["ArrowRight", { shiftKey: true }, "next10"], ["ArrowLeft", { shiftKey: true }, "prev10"],
    ["Home", {}, "first"], ["End", {}, "last"],
    [" ", {}, "play"], ["p", {}, "play"], ["P", { shiftKey: true }, "play"],
    ["f", {}, "follow"], ["r", {}, "rings"], ["v", {}, "proof"],
    ["?", { shiftKey: true }, "help"], ["?", {}, "help"],
    ["Escape", {}, "close"],
  ];
  for (const [key, extra, want] of cases) assert.equal(keyAction(ev(key, extra)), want, `${key} ${JSON.stringify(extra)}`);
});

test("unmapped keys and bad input -> null", () => {
  for (const k of ["a", "Enter", "Tab", "ArrowUp", "ArrowDown", "+", "-", "x"]) assert.equal(keyAction(ev(k)), null, k);
  assert.equal(keyAction(null), null);
  assert.equal(keyAction({}), null);
  assert.equal(keyAction({ key: "f" }), "follow"); // no target / modifier fields: treated as page focus
});

test("ctrl / meta / alt held -> null", () => {
  for (const mod of ["ctrlKey", "metaKey", "altKey"]) {
    for (const k of ["ArrowRight", "ArrowLeft", "Home", "End", " ", "p", "f", "r", "v", "?", "Escape"]) {
      assert.equal(keyAction(ev(k, { [mod]: true })), null, `${mod}+${k}`);
    }
  }
});

test("text fields, select and contenteditable -> null for every key", () => {
  const targets = [
    { tagName: "INPUT", type: "text" }, { tagName: "INPUT", type: "search" }, { tagName: "INPUT", type: "checkbox" },
    { tagName: "input" }, { tagName: "TEXTAREA" }, { tagName: "SELECT" },
    { tagName: "DIV", isContentEditable: true }, { tagName: "SPAN", isContentEditable: true },
  ];
  for (const t of targets) {
    for (const k of ["ArrowRight", "ArrowLeft", "Home", "End", " ", "p", "f", "r", "v", "?", "Escape"]) {
      assert.equal(keyAction(ev(k, {}, t)), null, `${JSON.stringify(t)} ${k}`);
    }
  }
});

test("range slider keeps its arrows / Home / End, other shortcuts still work", () => {
  const range = { tagName: "INPUT", type: "range", isContentEditable: false };
  for (const [k, extra] of [["ArrowRight", {}], ["ArrowLeft", {}], ["ArrowRight", { shiftKey: true }], ["Home", {}], ["End", {}]]) {
    assert.equal(keyAction(ev(k, extra, range)), null, k);
  }
  assert.equal(keyAction(ev("p", {}, range)), "play");
  assert.equal(keyAction(ev("f", {}, range)), "follow");
  assert.equal(keyAction(ev("?", {}, range)), "help");
  assert.equal(keyAction(ev("Escape", {}, range)), "close");
});

test("Space is left to buttons, links, summaries and ARIA buttons; letters still work there", () => {
  const targets = [
    { tagName: "BUTTON" }, { tagName: "A" }, { tagName: "SUMMARY" },
    { tagName: "ARTICLE", role: "button" }, // stop card (plain object form)
    { tagName: "ARTICLE", getAttribute: (n) => (n === "role" ? "button" : null) }, // DOM-like form
  ];
  for (const t of targets) {
    assert.equal(keyAction(ev(" ", {}, t)), null, JSON.stringify(t));
    assert.equal(keyAction(ev("p", {}, t)), "play");
    assert.equal(keyAction(ev("ArrowRight", {}, t)), "next");
  }
});

test("SHORTCUTS covers every action keyAction can return except close", () => {
  const keys = ["ArrowRight", "ArrowLeft", "Home", "End", " ", "Spacebar", "p", "P", "f", "F", "r", "R", "v", "V", "?", "Escape", "Esc", "Right", "Left"];
  const returned = new Set();
  for (const k of keys) for (const shiftKey of [false, true]) { const a = keyAction(ev(k, { shiftKey })); if (a) returned.add(a); }
  const covered = new Set(SHORTCUTS.flatMap((s) => s.ids));
  for (const a of returned) if (a !== "close") assert.ok(covered.has(a), `SHORTCUTS misses ${a}`);
  assert.ok(returned.size >= 11);
  for (const s of SHORTCUTS) {
    assert.equal(typeof s.keys, "string"); assert.ok(s.keys.length);
    assert.equal(typeof s.action, "string"); assert.ok(s.action.length);
  }
});
