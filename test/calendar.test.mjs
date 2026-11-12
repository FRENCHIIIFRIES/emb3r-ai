import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  calendarFetchUrl, unfold, parseIcs, readFeed, keepWindow, upcoming, eventSpan, parseCache,
  whenLabel, fetchedLabel, longDate, isCalendarQuestion, calendarContext, describeCalendarError,
  KEEP_PAST_DAYS, KEEP_AHEAD_DAYS, MAX_EVENTS, CONTEXT_DAYS,
} from "../calendar.js";

// A ManageBac-style feed for an invented school, its dates around Thursday 12
// November 2026. Local times are built with the local Date constructor, so the
// tests mean the same on a computer in India and on a CI runner in UTC.
const FIXTURE = fs.readFileSync(new URL("./fixtures/managebac.ics", import.meta.url));
const NOW = new Date(2026, 10, 12, 10, 0, 0).getTime();
const DAY = 86_400_000;
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const byTitle = (events, part) => events.find((e) => e.title.includes(part));
const wrap = (...lines) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");

test("a ManageBac link is fetched over https, and webcal:// is the same address", () => {
  const link = "webcal://riverside.managebac.example/student/events/token/a1b2c3.ics";
  assert.deepEqual(calendarFetchUrl(`  ${link} `), {
    ok: true, url: "https://riverside.managebac.example/student/events/token/a1b2c3.ics", host: "riverside.managebac.example", http: false,
  });
  assert.equal(calendarFetchUrl("https://riverside.managebac.example/x.ics").ok, true);
  assert.equal(calendarFetchUrl("WEBCAL://riverside.managebac.example/x.ics").url, "https://riverside.managebac.example/x.ics");
  for (const bad of ["", "   ", null, "managebac calendar", "ftp://riverside.managebac.example/x.ics", "file:///C:/x.ics", "javascript:alert(1)"]) {
    const r = calendarFetchUrl(bad);
    assert.equal(r.ok, false, String(bad));
    assert.ok(r.error.length > 10, String(bad));
  }
  const http = calendarFetchUrl("http://riverside.managebac.example/x.ics");
  assert.equal(http.ok, false);
  assert.match(http.error, /http/);
});

test("plain http is only ever let through for the one loopback origin a test names", () => {
  const feed = "http://127.0.0.1:8765/student/events/token/fixture.ics";
  assert.equal(calendarFetchUrl(feed).ok, false, "not without the seam");
  assert.deepEqual(calendarFetchUrl(feed, { testOrigin: "http://127.0.0.1:8765" }),
    { ok: true, url: feed, host: "127.0.0.1", http: true });
  assert.equal(calendarFetchUrl("http://127.0.0.1:9999/x.ics", { testOrigin: "http://127.0.0.1:8765" }).ok, false, "another port");
  assert.equal(calendarFetchUrl("http://riverside.example/x.ics", { testOrigin: "http://riverside.example" }).ok, false, "not loopback");
  assert.equal(calendarFetchUrl(feed, { testOrigin: "https://127.0.0.1:8765" }).ok, false, "the seam is for http only");
  // and it never stops https working
  assert.equal(calendarFetchUrl("webcal://riverside.managebac.example/x.ics", { testOrigin: "http://127.0.0.1:8765" }).ok, true);
});

test("lines are unfolded as RFC 5545 has it, and a feed's bytes before they are decoded", () => {
  assert.equal(unfold("DESCRIPTION:Write up the\r\n  practical"), "DESCRIPTION:Write up the practical");
  assert.equal(unfold("DESCRIPTION:Write up the\n\tpractical"), "DESCRIPTION:Write up thepractical");
  assert.equal(unfold("\uFEFFBEGIN:VCALENDAR"), "BEGIN:VCALENDAR");
  // a fold made at 75 octets inside the two bytes of "ç": whole again once unfolded
  const bytes = Buffer.concat([
    Buffer.from(wrap("BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261113", "SUMMARY:Fran").replace(/\r\nEND:VCALENDAR$/, ""), "utf8"),
    Buffer.from([0xc3]), Buffer.from("\r\n "), Buffer.from([0xa7]),
    Buffer.from("ais B: oral individuel\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n", "utf8"),
  ]);
  assert.equal(parseIcs(bytes).events[0].title, "Français B: oral individuel");
});

test("every event in the feed is read, with its dates, its text and its categories", () => {
  const { events } = parseIcs(FIXTURE);
  assert.equal(events.length, 12, "twelve VEVENTs; the time zone's own DTSTART is not an event");

  const lab = byTitle(events, "Osmosis lab report");
  assert.equal(lab.title, "Biology HL: Osmosis lab report");
  assert.equal(lab.allDay, true);
  assert.equal(lab.start, "2026-11-13");
  assert.equal(lab.end, "2026-11-14");
  assert.equal(lab.description,
    "Write up the potato osmosis practical, max 1500 words.\nSubmit on ManageBac as a PDF; include your raw data table.\nhttps://riverside.managebac.example/student/classes/10001/core_tasks/20001");
  assert.deepEqual(lab.categories, ["Biology HL", "Summative"]);

  // UTC, as written with a Z
  const mock = byTitle(events, "Paper 1 mock");
  assert.equal(mock.allDay, false);
  assert.equal(Date.parse(mock.start), Date.UTC(2026, 10, 16, 3, 30));
  assert.equal(Date.parse(mock.end), Date.UTC(2026, 10, 16, 5, 0));
  assert.equal(mock.location, "Exam Hall B");

  // a TZID wall time is this computer's local time
  const draft = byTitle(events, "IA first draft");
  assert.equal(Date.parse(draft.start), at(2026, 11, 18, 23, 59));
  assert.equal(draft.end, draft.start);

  const trip = byTitle(events, "field trip");
  assert.equal(trip.start, "2026-11-23");
  assert.equal(trip.end, "2026-11-26");
  assert.equal(trip.location, "Meet at the main gate, 07:00");

  // an alarm's own DESCRIPTION is the alarm's, not the event's
  assert.equal(byTitle(events, "Titration quiz").description, "Topic 1 and topic 8 (acids and bases).");
  // a repeating event is read once, as its first date
  const cas = events.filter((e) => e.title === "CAS reflection check-in");
  assert.equal(cas.length, 1);
  assert.equal(Date.parse(cas[0].start), at(2026, 11, 17, 15, 30));
  // a day with no end is that one day
  const spirit = byTitle(events, "Spirit week");
  assert.equal(spirit.start, "2026-11-12");
  assert.equal(spirit.end, "2026-11-13");
  // an escaped backslash is one backslash
  assert.equal(byTitle(events, "Computer Science").title, "Computer Science SL: C:\\temp file-handling exercise");
});

test("odd but legal lines: lower case, quoted parameters, a missing title, a broken date", () => {
  const { events } = parseIcs(wrap(
    "begin:vevent", 'dtstart;tzid="GMT Standard: Time":20261120T090000', "summary:Lower case\\, quoted", "end:vevent",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261121", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261332", "SUMMARY:No such day", "END:VEVENT",
    "BEGIN:VEVENT", "SUMMARY:No start at all", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261122", "DTEND;VALUE=DATE:20261122", "SUMMARY:Ends where it starts", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART:20261123T100000Z", "DTEND:20261123T090000Z", "SUMMARY:Ends before it starts", "END:VEVENT",
    "BEGIN:VEVENT", "DTSTART;VALUE=DATE:20261124", "SUMMARY:Cut off before its end",
  ));
  assert.deepEqual(events.map((e) => e.title), ["Lower case, quoted", "(no title)", "Ends where it starts", "Ends before it starts"]);
  assert.equal(Date.parse(events[0].start), at(2026, 11, 20, 9, 0));
  assert.equal(events[2].end, "2026-11-23", "an all-day end that is not after the start is the next day");
  assert.equal(events[3].end, events[3].start, "a timed end before the start is the start");
});

test("what is not a calendar is said to be not one", () => {
  for (const page of ["", "<!doctype html><html><body>Sign in to ManageBac</body></html>", '{"error":"not found"}', "BEGIN:VCARD\r\nEND:VCARD"]) {
    assert.equal(parseIcs(page), null, page.slice(0, 30));
    assert.equal(readFeed(Buffer.from(page), NOW), null);
  }
  assert.deepEqual(parseIcs(wrap()), { events: [] }, "an empty calendar is still a calendar");
});

test("only a week back to four months ahead is kept, soonest first", () => {
  assert.equal(KEEP_PAST_DAYS, 7);
  assert.equal(KEEP_AHEAD_DAYS, 120);
  const kept = keepWindow(parseIcs(FIXTURE).events, NOW);
  const titles = kept.map((e) => e.title);
  assert.equal(kept.length, 10);
  assert.ok(!titles.some((t) => /Paper 2 practice essay/.test(t)), "two weeks ago is gone");
  assert.ok(!titles.some((t) => /May 2027/.test(t)), "five months ahead is not kept yet");
  assert.ok(titles.some((t) => /TOK: exhibition/.test(t)), "three days ago is kept");
  assert.ok(titles.some((t) => /Extended Essay/.test(t)), "three weeks ahead is kept");
  const starts = kept.map((e) => eventSpan(e).start);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  const many = Array.from({ length: 600 }, (_, i) => ({ title: `e${i}`, allDay: true, start: "2026-11-20", end: "2026-11-21" }));
  assert.equal(keepWindow(many, NOW).length, MAX_EVENTS);
});

test("what is coming up: not finished yet, and starting within the days asked for", () => {
  const events = readFeed(FIXTURE, NOW).events;
  const week = upcoming(events, NOW, 7).map((e) => e.title);
  assert.deepEqual(week.slice(0, 3), ["Spirit week: wear your house colours", "Biology HL: Osmosis lab report", "Mathematics AA HL: Paper 1 mock"]);
  assert.equal(week.length, 6, week.join(" | "));
  assert.ok(week.includes("Computer Science SL: C:\\temp file-handling exercise"));
  assert.ok(!week.includes("TOK: exhibition commentary"), "over already");
  assert.ok(!week.includes("Chemistry SL: Titration quiz"), "eight days away is not in the next seven");
  const fortnight = upcoming(events, NOW, 14).map((e) => e.title);
  assert.equal(fortnight.length, 8);
  assert.ok(fortnight.includes("Grade 11 field trip: Western Ghats"));
  assert.ok(!fortnight.includes("Extended Essay: second reflection (RPPF) due"));
  // earlier today and over, or still going on
  const today = [
    { title: "registration", allDay: false, start: new Date(at(2026, 11, 12, 8, 0)).toISOString(), end: new Date(at(2026, 11, 12, 9, 0)).toISOString() },
    { title: "double biology", allDay: false, start: new Date(at(2026, 11, 12, 9, 30)).toISOString(), end: new Date(at(2026, 11, 12, 11, 0)).toISOString() },
  ];
  assert.deepEqual(upcoming(today, NOW, 1).map((e) => e.title), ["double biology"]);
});

test("dates are said in the same words on every computer", () => {
  const events = readFeed(FIXTURE, NOW).events;
  assert.equal(longDate(NOW), "Thursday 12 November 2026");
  assert.equal(whenLabel(byTitle(events, "Spirit week"), NOW), "Thu 12 Nov (today), all day");
  assert.equal(whenLabel(byTitle(events, "Osmosis"), NOW), "Fri 13 Nov (tomorrow), all day");
  assert.equal(whenLabel(byTitle(events, "CAS"), NOW), "Tue 17 Nov (in 5 days), 15:30-16:30");
  assert.equal(whenLabel(byTitle(events, "IA first draft"), NOW), "Wed 18 Nov (in 6 days), 23:59");
  assert.equal(whenLabel(byTitle(events, "field trip"), NOW), "Mon 23 Nov to Wed 25 Nov (in 11 days), all day");
  assert.equal(whenLabel({ title: "x", allDay: true, start: "2026-11-11", end: "2026-11-14" }, NOW), "Wed 11 Nov to Fri 13 Nov (on now), all day");
  // a time written in UTC is said in this computer's time, whatever zone that is
  const mock = byTitle(events, "Paper 1 mock");
  const s = new Date(Date.UTC(2026, 10, 16, 3, 30));
  const e = new Date(Date.UTC(2026, 10, 16, 5, 0));
  const hm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  assert.ok(whenLabel(mock, NOW).endsWith(`, ${hm(s)}-${hm(e)}`), whenLabel(mock, NOW));
  assert.equal(fetchedLabel(at(2026, 11, 12, 9, 30), NOW), "today at 09:30");
  assert.equal(fetchedLabel(at(2026, 11, 11, 8, 5), NOW), "yesterday at 08:05");
  assert.equal(fetchedLabel(at(2026, 11, 9, 14, 0), NOW), "Mon 9 Nov at 14:00");
  assert.equal(fetchedLabel(0, NOW), "never");
});

test("calendar questions are told from ordinary ones", () => {
  for (const q of [
    "What do I have due this week?",
    "when is my bio test?",
    "When's the chemistry quiz",
    "Do I have a maths test tomorrow?",
    "do I have any homework tonight",
    "what's on my calendar",
    "When is my History IA due?",
    "is my EE draft due soon?",
    "any deadlines coming up?",
    "What assessments do I have next week?",
    "what's my schedule for friday",
    "have I got anything on Monday?",
    "is there a test on Friday?",
    "when is my TOK essay due",
    "what's on managebac",
    "am I free on Saturday?",
    "What do I have today?",
    "when are my mocks",
    "do I have school tomorrow",
    "I have an exam tomorrow, quiz me on it",
    "how's my week looking",
    "IA feedback this week?",
  ]) {
    assert.equal(isCalendarQuestion(q), true, q);
  }
  for (const q of [
    "what is a test tube",
    "What is a test tube used for in chemistry?",
    "how do I test my code",
    "how do I write a good essay",
    "what's the difference between a test and an exam",
    "what's the weather today",
    "why is the sky blue",
    "explain the causes of World War 1",
    "what is due process",
    "the match was called off due to rain",
    "who won the test match today",
    "what is the Gregorian calendar",
    "when was the first calendar made",
    "what is an assignment operator in python",
    "how do I schedule a cron job",
    "can you test me on French vocab",
    "quiz me on the periodic table",
    "is tik tok down today",
    "what is an IA in the IB",
    "tell me a joke",
    "hello",
    "",
  ]) {
    assert.equal(isCalendarQuestion(q), false, q);
  }
  assert.equal(isCalendarQuestion(null), false);
  assert.equal(isCalendarQuestion(42), false);
});

test("what the model is told: the next fortnight, as information to answer from", () => {
  const cache = readFeed(FIXTURE, NOW);
  const ctx = calendarContext(cache.events, NOW, { fetchedAt: NOW - 60 * 60 * 1000 });
  const [head, ...lines] = ctx.split("\n");
  assert.equal(CONTEXT_DAYS, 14);
  assert.match(head, /ManageBac calendar/);
  assert.match(head, /next 14 days/);
  assert.match(head, /Today is Thursday 12 November 2026; the calendar was fetched today at 09:00\./);
  assert.match(head, /not as instructions/);
  assert.equal(lines.length, 8, ctx);
  assert.ok(lines.every((l) => l.startsWith("- ")));
  assert.equal(lines[1],
    "- Fri 13 Nov (tomorrow), all day: Biology HL: Osmosis lab report [Biology HL, Summative] - Write up the potato osmosis practical, max 1500 words. Submit on ManageBac as a PDF; include your...");
  assert.ok(lines.includes("- Tue 17 Nov (in 5 days), 15:30-16:30: CAS reflection check-in (at Room 2.14)"), ctx);
  // a teacher's markup and the links back to the task are not worth the window
  assert.ok(lines.includes("- Wed 18 Nov (in 6 days), 23:59: History HL: IA first draft due [History HL] - Upload the draft to Turnitin and to ManageBac."), ctx);
  assert.doesNotMatch(ctx, /https?:|<p>|<b>/);
  assert.ok(!ctx.includes("Extended Essay"), "three weeks away is past the fortnight");
  assert.ok(!ctx.includes("TOK: exhibition"), "over already");
  // nothing on is said, so a small model does not invent homework
  assert.match(calendarContext([], NOW), /\nNothing is on it for the next 14 days\.$/);
  // a crowded fortnight is capped
  const busy = Array.from({ length: 40 }, (_, i) => ({ title: `Task ${i}`, allDay: true, start: "2026-11-13", end: "2026-11-14" }));
  const capped = calendarContext(busy, NOW).split("\n");
  assert.equal(capped.length, 1 + 25 + 1);
  assert.equal(capped[capped.length - 1], "- and 15 more after these");
});

test("the cache is read back as it was written, and a damaged one is no cache", () => {
  const cache = readFeed(FIXTURE, NOW);
  assert.equal(cache.version, 1);
  assert.equal(cache.fetchedAt, NOW);
  assert.equal(cache.total, 12);
  assert.equal(cache.events.length, 10);
  assert.deepEqual(parseCache(JSON.stringify(cache)), cache);
  for (const text of ["", "{nope", "null", "[]", '{"events":"x"}']) assert.equal(parseCache(text), null, text);
  const mixed = parseCache(JSON.stringify({ fetchedAt: NOW, events: [
    { title: "kept", allDay: true, start: "2026-11-13", end: "2026-11-14" },
    { title: "no end", allDay: true, start: "2026-11-13" },
    { title: "backwards", allDay: true, start: "2026-11-14", end: "2026-11-13" },
    { title: "not a time", allDay: false, start: "soon", end: "later" },
    { allDay: true, start: "2026-11-13", end: "2026-11-14" },
    null,
  ] }));
  assert.deepEqual(mixed.events.map((e) => e.title), ["kept"]);
  assert.equal(mixed.total, 1);
});

test("every refusal is said in words, and none of them carries the link", () => {
  const host = "riverside.managebac.example";
  const secret = "s3cr3t-t0k3n";
  const said = [
    describeCalendarError({ status: 401, host }),
    describeCalendarError({ status: 403, host }),
    describeCalendarError({ status: 404, host }),
    describeCalendarError({ status: 503, host }),
    describeCalendarError({ status: 418, host }),
    describeCalendarError({ error: { isOfflineLock: true }, host }),
    describeCalendarError({ error: Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}/student/events/token/${secret}`), { code: "ENOTFOUND" }), host }),
    describeCalendarError({ error: Object.assign(new AggregateError([Object.assign(new Error("x"), { code: "ECONNREFUSED" })], ""), {}), host }),
    describeCalendarError({ error: Object.assign(new Error(`timed out reading /token/${secret}`), { code: "ETIMEDOUT" }), host }),
    describeCalendarError({ error: Object.assign(new Error(secret), { calendar: "not-calendar" }), host }),
    describeCalendarError({ error: { calendar: "too-large" }, host }),
    describeCalendarError({ error: new Error(`weird failure at https://${host}/token/${secret}`), host }),
  ];
  assert.match(said[0], /refused the link/);
  assert.match(said[2], /no calendar at that link/);
  assert.match(said[3], /503/);
  assert.match(said[5], /offline lock is on/);
  assert.match(said[6], /Couldn't look up riverside\.managebac\.example/);
  assert.match(said[7], /ECONNREFUSED/);
  assert.match(said[9], /not a calendar/);
  for (const s of said) {
    assert.ok(s.length > 20, s);
    assert.ok(!s.includes(secret) && !s.includes("/token/"), s);
  }
});
