import assert from "node:assert/strict";
import { test } from "node:test";
import { fillExplicitlyLabeledSupportFields } from "./documentSupportFallback";

test("copies explicit support sections into only empty fields", () => {
  const source = [
    "Try now: Show the familiar break card and wait.",
    "If the voice rises, pause the request, use one calm short sentence, and give space.",
    "Avoid repeating directions quickly or removing the break card.",
    "Prevention: Show a visual timer with two-minute and one-minute warnings.",
    "Encouragement: Say, 'You asked for a break,' when the card is used.",
    "Practice skill: Ask for a break using the break card.",
    "Steps: point to the card, hand it over, and wait for the short pause.",
    "Notice: write down the transition, early signs, and whether the timer or card helped.",
  ].join(" ");

  const result = fillExplicitlyLabeledSupportFields({
    do_this_right_now: [],
    interventions: ["Keep the existing source-backed strategy."],
    if_it_escalates: [],
    avoid: [],
    prevention_tips: [],
    reinforcement_rewards: [],
    practice_a_helpful_skill: "",
    practice_skill_steps: [],
    what_to_notice: [],
  }, [source]);

  assert.deepEqual(result.do_this_right_now, ["Show the familiar break card and wait."]);
  assert.deepEqual(result.interventions, ["Keep the existing source-backed strategy."]);
  assert.deepEqual(result.if_it_escalates, ["pause the request, use one calm short sentence, and give space."]);
  assert.deepEqual(result.avoid, ["repeating directions quickly or removing the break card."]);
  assert.deepEqual(result.prevention_tips, ["Show a visual timer with two-minute and one-minute warnings."]);
  assert.deepEqual(result.reinforcement_rewards, ["Say, 'You asked for a break,' when the card is used."]);
  assert.equal(result.practice_a_helpful_skill, "Ask for a break using the break card.");
  assert.deepEqual(result.practice_skill_steps, ["point to the card, hand it over, and wait for the short pause."]);
  assert.deepEqual(result.what_to_notice, ["write down the transition, early signs, and whether the timer or card helped."]);
});

test("does not create guidance when the source has no explicit matching labels", () => {
  const behavior = { do_this_right_now: [], if_it_escalates: [], practice_a_helpful_skill: "" };
  assert.deepEqual(
    fillExplicitlyLabeledSupportFields(behavior, ["The source describes a transition difficulty but no strategies."]),
    behavior,
  );
});
