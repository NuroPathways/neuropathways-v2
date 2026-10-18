import { describe, expect, it } from "vitest";
import { getBehaviorAppearance } from "./behaviorVisuals";

describe("Help Now behavior appearance", () => {
  it("maps the five original behavior categories to their established colors", () => {
    const cases = [
      ["Physical Aggression", "behavior-red"],
      ["Self-Injury", "behavior-orange"],
      ["Elopement", "behavior-yellow"],
      ["Property Destruction", "behavior-purple"],
      ["Tantrums & Meltdowns", "behavior-blue"],
    ];
    for (const [name, tone] of cases) {
      expect(getBehaviorAppearance({ name }).tone).toBe(tone);
    }
  });

  it("keeps a supported configured color for additional behaviors and otherwise uses the existing palette", () => {
    expect(getBehaviorAppearance({ name: "Leaving class", color: "teal" }, 0).tone).toBe("behavior-teal");
    expect(getBehaviorAppearance({ name: "A custom support behavior" }, 5).tone).toBe("behavior-teal");
  });
});
