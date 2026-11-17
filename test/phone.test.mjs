import { test } from "node:test";
import assert from "node:assert/strict";
import { startPhoneLink, newCode } from "../phone.js";

const port = 47999;
const call = (path, { code = "123456", method = "GET", body } = {}) =>
  fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { "X-Pair-Code": code, "Content-Type": "application/json" }, body });

test("phone link answers with the right code, refuses the wrong one, and hands over events", async () => {
  const link = startPhoneLink({ code: "123456", port, ask: async (t) => `heard: ${t}` });
  await new Promise((r) => link.server.once("listening", r));
  try {
    assert.equal((await call("/events", { code: "000000" })).status, 401);

    const chat = await call("/chat", { method: "POST", body: JSON.stringify({ text: "hi ember" }) });
    assert.equal(chat.status, 200);
    assert.deepEqual(await chat.json(), { reply: "heard: hi ember" });

    link.push("ooh, low sun. good pick.");
    link.push("ah, juno vale. nice.");
    const all = await (await call("/events?after=0")).json();
    assert.deepEqual(all.map((e) => e.text), ["ooh, low sun. good pick.", "ah, juno vale. nice."]);
    const newer = await (await call(`/events?after=${all[0].id}`)).json();
    assert.equal(newer.length, 1);

    assert.equal((await call("/chat", { method: "POST", body: "{bad" })).status, 400);
  } finally { link.close(); }
});

test("ten wrong codes lock the link for a while", async () => {
  const link = startPhoneLink({ code: "654321", port: port + 1, ask: async () => "x" });
  await new Promise((r) => link.server.once("listening", r));
  try {
    const hit = (code) => fetch(`http://127.0.0.1:${port + 1}/events`, { headers: { "X-Pair-Code": code } });
    for (let i = 0; i < 10; i++) await hit("000000");
    assert.equal((await hit("654321")).status, 429);   // even the right code waits
  } finally { link.close(); }
});

test("pairing codes are six digits", () => {
  for (let i = 0; i < 50; i++) assert.match(newCode(), /^\d{6}$/);
});
