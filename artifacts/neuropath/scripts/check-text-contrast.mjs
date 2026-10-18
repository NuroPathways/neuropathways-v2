import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const css = fs.readFileSync(path.join(root, "artifacts/neuropath/src/index.css"), "utf8");
const native = fs.readFileSync(path.join(root, "artifacts/neuropath-mobile/constants/colors.ts"), "utf8");
const hex = s => s.replace("#", "").match(/../g).map(x => parseInt(x, 16) / 255);
const hsl = str => {
  const [h, sat, light] = str.match(/[\d.]+/g).map(Number), s = sat / 100, l = light / 100, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); });
};
const luminance = rgb => rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
const ratio = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
const rows = [];
const check = (name, fg, bg, minimum = 4.5) => {
  const value = ratio(fg, bg);
  rows.push({ name, ratio: Number(value.toFixed(2)), minimum, pass: value >= minimum });
};
for (const [name, source] of [["web-light", css.split(".dark {")[0]], ["web-dark", css.split(".dark {")[1].split("}")[0]]]) {
  const token = key => hsl(source.match(new RegExp(`--${key}:\\s*([^;]+)`))[1]);
  for (const background of ["background", "card", "muted"]) {
    check(`${name}: body on ${background}`, token("foreground"), token(background));
    check(`${name}: secondary text on ${background}`, token("muted-foreground"), token(background));
    check(`${name}: primary link on ${background}`, token("primary"), token(background));
  }
  for (const surface of ["primary", "secondary", "accent", "destructive"]) {
    check(`${name}: ${surface} control`, token(`${surface}-foreground`), token(surface));
  }
  for (const surface of ["secondary", "accent"]) {
    const canvas = name === "web-light" ? hex("#f4f5f7") : token("background");
    check(`${name}: ${surface} quick-action label`, token(`${surface}-foreground`), token(surface).map((c, i) => .1 * c + .9 * canvas[i]));
  }
}
for (const name of ["light", "dark"]) {
  const source = native.split(`${name}: {`)[1].split("}")[0];
  const token = key => hex(source.match(new RegExp(`\\b${key}:\\s*"(#[0-9A-Fa-f]+)"`))[1]);
  for (const background of ["background", "card", "muted"]) {
    check(`Expo-${name}: body on ${background}`, token("foreground"), token(background));
    check(`Expo-${name}: secondary text on ${background}`, token("mutedForeground"), token(background));
    check(`Expo-${name}: primary link on ${background}`, token("primary"), token(background));
  }
  for (const surface of ["primary", "secondary", "accent", "destructive"]) {
    check(`Expo-${name}: ${surface} control`, token(`${surface}Foreground`), token(surface));
  }
}
const skin = fs.readFileSync(path.join(root, "artifacts/neuropath/src/components/navigation/legacy-skin.css"), "utf8");
for (const file of ["pages/ClinicianDashboard.jsx", "components/clinician/FamilyCard.jsx", "components/parent/ChildOverviewCard.jsx"]) {
  if (/\btext-(?:secondary|accent)(?=["\s])/.test(fs.readFileSync(path.join(root, "artifacts/neuropath/src", file), "utf8"))) {
    throw new Error(`${file}: pale surface token used as text instead of its readable foreground token`);
  }
}
const navMuted = skin.match(/--np-nav-muted:\s*(#[\da-f]+)/i)[1];
check("Legacy sidebar secondary text", hex(navMuted), hex("#f4f5f7"));
check("Legacy sidebar active item", [1, 1, 1], hex("#496fa4"));
for (const bg of [hsl("216 38 40"), hsl("180 34 32")]) {
  check("Gradient header white text", [1, 1, 1], bg);
  check("Gradient header secondary white 90%", bg.map(c => .9 + c * .1), bg);
}
fs.mkdirSync(path.join(root, "generated-artifacts"), { recursive: true });
fs.writeFileSync(path.join(root, "generated-artifacts/ui-refinement-contrast.json"), JSON.stringify(rows, null, 2));
for (const row of rows) console.log(`${row.pass ? "PASS" : "FAIL"} ${row.name}: ${row.ratio}:1 (minimum ${row.minimum}:1)`);
process.exitCode = rows.some(row => !row.pass) ? 1 : 0;
