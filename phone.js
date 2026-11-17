// The phone link: lets h3arth on an iPad talk to Ember over your own Wi-Fi.
// Off until switched on in Settings, and every request has to carry the 6-digit pairing code.
import http from "http";
import os from "os";
import crypto from "crypto";

export const PHONE_PORT = 47823;
const MAX_BODY = 20_000;
const LOCKOUT_AFTER = 10;          // wrong codes in a row
const LOCKOUT_MS = 60_000;

/** This computer's address on the local network, to show next to the code. */
export function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return "127.0.0.1";
}

export function newCode() { return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"); }

function sameCode(given, code) {
  const a = Buffer.from(String(given || "")), b = Buffer.from(String(code));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Starts the server. `ask(text)` resolves to Ember's reply. Returns { push(text), close(), server }:
 * push() queues one of Ember's lines for the phone to pick up from GET /events.
 */
export function startPhoneLink({ code, ask, port = PHONE_PORT }) {
  const events = [];
  let nextId = 1, misses = 0, lockedUntil = 0;

  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    // a six-digit code is guessable given enough tries, so wrong guesses lock the door for a minute
    if (Date.now() < lockedUntil) return reply(429, { error: "too many wrong codes, wait a minute" });
    if (!sameCode(req.headers["x-pair-code"], code)) {
      if (++misses >= LOCKOUT_AFTER) { misses = 0; lockedUntil = Date.now() + LOCKOUT_MS; }
      return reply(401, { error: "wrong pairing code" });
    }
    misses = 0;
    const url = new URL(req.url, "http://phone");

    if (req.method === "GET" && url.pathname === "/events") {
      const after = Number(url.searchParams.get("after")) || 0;
      return reply(200, events.filter((e) => e.id > after));
    }
    if (req.method === "POST" && url.pathname === "/chat") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY) return reply(413, { error: "message too long" });
      }
      let text;
      try { text = String(JSON.parse(raw).text || "").trim().slice(0, 4000); } catch { return reply(400, { error: "not json" }); }
      if (!text) return reply(400, { error: "empty message" });
      try { return reply(200, { reply: await ask(text) }); }
      catch (e) { return reply(503, { error: String(e && e.message || e) }); }
    }
    reply(404, { error: "not found" });
  });
  server.listen(port, "0.0.0.0");

  return {
    server,
    push(text) {
      events.push({ id: nextId++, text: String(text).slice(0, 2000) });
      if (events.length > 50) events.shift();
    },
    close() { server.close(); },
  };
}
