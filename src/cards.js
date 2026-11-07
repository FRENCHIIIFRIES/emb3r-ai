// A review session: the cards due, one at a time. Space turns a card over,
// then again, good or easy. A card marked again comes back three cards later -
// or last, when fewer are left - and stays in the session until it is good or
// easy; the session is over when nothing is left in it.
//
// Pure, and a classic script loaded before renderer.js, so the tests run it in
// a context of their own exactly as the page does. Every function returns a
// new session and changes nothing it was given. When a card is due again on
// another day is decided in study.js, in the main process; this is only the
// order of the cards in front of you now.
(function (root) {
  "use strict";

  const RATINGS = ["again", "good", "easy"];
  const AGAIN_GAP = 3;

  function startSession(cards) {
    return { queue: [...cards], flipped: false };
  }

  function current(session) {
    return session.queue[0] || null;
  }

  function flip(session) {
    return { ...session, flipped: !session.flipped };
  }

  function rate(session, rating) {
    if (!RATINGS.includes(rating)) throw new Error(`not a rating: ${rating}`);
    const [card, ...rest] = session.queue;
    if (!card) return { session, rated: null };
    if (rating === "again") rest.splice(Math.min(AGAIN_GAP, rest.length), 0, card);
    return { session: { queue: rest, flipped: false }, rated: { cardId: card.id, rating } };
  }

  function isDone(session) {
    return session.queue.length === 0;
  }

  function left(session) {
    return session.queue.length;
  }

  root.emb3rCards = { startSession, current, flip, rate, isDone, left };
})(globalThis);
