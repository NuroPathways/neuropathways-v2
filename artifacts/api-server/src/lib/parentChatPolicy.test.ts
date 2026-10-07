import test from "node:test";
import assert from "node:assert/strict";
import {
  buildParentChatSafeFallback,
  buildParentChatSystemPrompt,
  isBareModelRefusal,
  isDirectPhysicalInterventionRequest,
} from "./parentChatPolicy";

test("the prompt uses readable document content when present and still provides a general fallback", () => {
  const promptWithDocument = buildParentChatSystemPrompt(true);
  assert.match(promptWithDocument, /Use the readable uploaded-document text/);
  assert.match(promptWithDocument, /do not stop at/);
  assert.match(promptWithDocument, /ABA-informed information/);
  assert.match(promptWithDocument, /name its exact title/);
});

test("the prompt clearly permits behavior-specific generalized support without readable documents", () => {
  const promptWithoutDocument = buildParentChatSystemPrompt(false);
  assert.match(promptWithoutDocument, /No readable uploaded-document content is available/);
  assert.match(promptWithoutDocument, /based on the behavior the parent described/);
  assert.match(promptWithoutDocument, /Do not provide diagnoses, medication changes or doses/);
  assert.match(promptWithoutDocument, /immediate-danger guidance/);
});

test("dangerous physical-intervention how-to requests are distinguished from requests for alternatives", () => {
  assert.equal(isDirectPhysicalInterventionRequest("How do I restrain my child?"), true);
  assert.equal(isDirectPhysicalInterventionRequest("What are alternatives to restraint?"), false);
  assert.equal(isDirectPhysicalInterventionRequest("How can I avoid physical blocking?"), false);
});

test("a refusal fallback remains useful and adds emergency guidance when needed", () => {
  const ordinary = buildParentChatSafeFallback("What can I do during a meltdown?");
  assert.match(ordinary, /General ABA-informed ideas/);
  assert.match(ordinary, /ask for help, a break, or attention/);
  assert.match(ordinary, /not tell you why it happened/);

  const urgent = buildParentChatSafeFallback("My child is in immediate danger right now");
  assert.match(urgent, /contact 911 or your local emergency services/);

  const unavailable = buildParentChatSafeFallback("What can I do?", { serviceUnavailable: true });
  assert.match(unavailable, /chat service did not respond/);
  assert.match(unavailable, /uploaded documents/);
});

test("only bare model refusals trigger the helpful fallback", () => {
  assert.equal(isBareModelRefusal("I can’t help with that."), true);
  assert.equal(isBareModelRefusal("I can’t give restraint instructions. Instead, move to safety and call for help."), false);
});
