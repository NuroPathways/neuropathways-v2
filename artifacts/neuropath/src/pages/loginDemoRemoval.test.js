import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = (name) => fs.readFileSync(path.join(process.cwd(), "src/pages", name), "utf8");

describe("public login screens", () => {
  it("does not embed clinician demo credentials or default values", () => {
    const source = pageSource("ClinicianLogin.jsx");
    expect(source).not.toMatch(/Demo Account/i);
    expect(source).not.toMatch(/email:\s*["'][^"']+@[^"']+["']/i);
    expect(source).toMatch(/email:\s*""\s*,\s*password:\s*""/);
  });

  it("does not publish family demo access-code examples", () => {
    const source = pageSource("UsernameLogin.jsx");
    expect(source).not.toMatch(/Demo accounts/i);
    expect(source).not.toMatch(/DEMO\d{2}/i);
  });
});
