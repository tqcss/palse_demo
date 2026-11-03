#!/usr/bin/env node
/**
 * Guardrail against color drift: fails when raw hex/rgb/rgba color literals
 * appear in web/src. All colors must go through the @theme tokens in
 * src/index.css (Tailwind classes like `bg-theme-maroon`, `text-risk-high-fg`
 * or arbitrary values that reference `var(--color-...)`).
 *
 * Allowed exceptions (audited, documented in DESIGN_SYSTEM.md):
 *  - src/index.css: the single place raw values are defined.
 *  - rgb(...)/rgba(...) with all-transparent tokens like `rgb(91 22 22 / 8%)`
 *    are still banned outside index.css — use token opacity modifiers.
 *  - Files listed in ALLOWED keep legacy one-offs (e.g. generated report
 *    documents that can't resolve CSS variables). Keep this list short.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;

/** Files with reviewed exceptions. Keep minimal. */
const ALLOWED = new Set([
  // The single source of truth: @theme token definitions live here.
  join(ROOT, "index.css"),
  // The standalone generated report document (jsPDF/print artifact) embeds a
  // copy of the palette; no CSS variable resolution inside it.
  join(ROOT, "lib/report.ts"),
]);

const COLOR_RE = /#(?:[0-9a-fA-F]{3}\b|[0-9a-fA-F]{6}\b|[0-9a-fA-F]{8}\b)|\brgba?\(/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...walk(path));
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const offenders = [];
for (const file of walk(ROOT)) {
  if (ALLOWED.has(file)) continue;
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  lines.forEach((line, i) => {
    if (COLOR_RE.test(line)) {
      offenders.push(`${relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (offenders.length > 0) {
  console.error(
    `check:tokens: raw color literals found (use @theme tokens instead):\n` +
      offenders.map((o) => `  ${o}`).join("\n"),
  );
  process.exit(1);
}

console.log("check:tokens: no raw colors in src ✔");
