import { test } from "node:test";
import assert from "node:assert/strict";
import { TUTORS, TUTOR_IDS, isTutor, tutorPrompt, preferredModelFor, bestModelFor } from "../tutors.js";

test("there are eight tutors, and only they are tutors", () => {
  assert.deepEqual(TUTOR_IDS, ["maths", "biology", "chemistry", "physics", "history", "geography", "english", "languages"]);
  for (const id of TUTOR_IDS) assert.equal(isTutor(id), true, id);
  for (const id of ["", "MATHS", "constructor", "__proto__", "toString", null, undefined, 3]) {
    assert.equal(isTutor(id), false, String(id));
  }
});

test("a tutor's prompt names its subject, keeps the origin and student mode, and holds it to the subject", () => {
  const p = tutorPrompt("biology", { origin: "ORIGIN.", safe: "SAFE.", name: "The user's name is Ziyan." });
  assert.ok(p.startsWith("SAFE. ORIGIN."), p);
  assert.match(p, /Biology tutor/);
  assert.match(p, /teach biology only/);
  assert.match(p, /Stay on your subject/);
  assert.match(p, /hint before an answer/);
  assert.ok(p.endsWith("The user's name is Ziyan."), p);
  assert.throws(() => tutorPrompt("astrology"));
});

test("with student mode off its rules are not in the prompt", () => {
  const p = tutorPrompt("maths", { origin: "ORIGIN." });
  assert.ok(p.startsWith("ORIGIN."), p);
});

test("maths and the sciences prefer Qwen2.5 3B, the rest Llama 3.2 3B, from what is installed", () => {
  const both = ["Llama-3.2-3B-Instruct-Q4_K_M.gguf", "Qwen2.5-3B-Instruct-Q4_K_M.gguf"];
  for (const id of ["maths", "physics", "chemistry"]) assert.equal(preferredModelFor(id, both), "Qwen2.5-3B-Instruct-Q4_K_M.gguf", id);
  for (const id of ["biology", "history", "geography", "english", "languages"]) assert.equal(preferredModelFor(id, both), "Llama-3.2-3B-Instruct-Q4_K_M.gguf", id);
  // only Llama installed: everyone uses it
  assert.equal(preferredModelFor("maths", ["Llama-3.2-3B-Instruct-Q4_K_M.gguf"]), "Llama-3.2-3B-Instruct-Q4_K_M.gguf");
  // neither: the chat stays on whatever model is chosen
  assert.equal(preferredModelFor("maths", ["Qwen_Qwen3-1.7B-Q4_K_M.gguf", "google_gemma-3-1b-it-Q4_K_M.gguf"]), null);
  assert.equal(preferredModelFor("maths", null), null);
  assert.equal(bestModelFor("physics"), "Qwen2.5-3B-Instruct-Q4_K_M.gguf");
  assert.equal(bestModelFor("english"), "Llama-3.2-3B-Instruct-Q4_K_M.gguf");
});

test("no tutor is ever sent to a reasoning model", () => {
  for (const id of TUTOR_IDS) {
    const all = ["Qwen_Qwen3-1.7B-Q4_K_M.gguf", "Qwen3.5-4B-Q4_K_M.gguf"];
    assert.equal(preferredModelFor(id, all), null, id);
  }
  assert.ok(Object.values(TUTORS).every((t) => t.style && t.subject));
});
