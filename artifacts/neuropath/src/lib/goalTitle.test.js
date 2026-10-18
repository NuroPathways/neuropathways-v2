import { describe, expect, it } from "vitest";
import { readableGoalTitle, isGeneratedGoalTitle } from "./goalTitle";

describe("readableGoalTitle", () => {
  it("keeps meaningful titles", () => {
    expect(readableGoalTitle({ goal_title: "Ask for a Break" })).toBe("Ask for a Break");
  });
  it("replaces technical titles with saved description text, without inventing content", () => {
    expect(isGeneratedGoalTitle("F4 goal 13:32:51")).toBe(true);
    expect(readableGoalTitle({ goal_title: "F4 goal 13:32:51", goal_description: "Use the break card during homework. More detail." })).toBe("Use the break card during homework");
    expect(readableGoalTitle({ goal_title: "goal 9:05" })).toBe("Goal details unavailable");
  });
});
