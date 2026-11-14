// Written with AI assistance (Claude).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { costModelRow } from "./cost-model.js";

test("costModelRow reads the slope limit as written in docs/cost-model.md", () => {
  const md = readFileSync(new URL("../../docs/cost-model.md", import.meta.url), "utf8");
  const row = costModelRow(md, "Slope limit");
  assert.ok(row, "slope limit row present");
  assert.equal(typeof row.value, "number");
  assert.equal(row.unit, "degrees");
});

test("costModelRow returns null for an empty value or a missing row", () => {
  assert.equal(costModelRow("| Slope limit (blocked above) | | degrees | | |", "Slope limit"), null);
  assert.equal(costModelRow("| Something else | 3 | m | x | y |", "Slope limit"), null);
});
