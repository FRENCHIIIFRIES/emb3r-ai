import { test } from "node:test";
import assert from "node:assert/strict";
import { connectionErrorCode, isRetryableConnectionError, describeDownloadError } from "../downloads.js";

// what Node throws when every address of a server failed: an empty message,
// and the reason on the attempts inside it
function aggregate(...codes) {
  const err = new AggregateError(codes.map((code) => Object.assign(new Error(`connect ${code}`), { code })), "");
  return err;
}

test("a connection that failed on every address is said in words, not as AggregateError", () => {
  const err = aggregate("ETIMEDOUT", "ENETUNREACH");
  assert.equal(err.message, "", "the error Node gives has nothing to show");
  assert.equal(connectionErrorCode(err), "ETIMEDOUT");
  assert.equal(isRetryableConnectionError(err), true);
  const said = describeDownloadError(err, "huggingface.co");
  assert.match(said, /^Couldn't connect to huggingface\.co/);
  assert.match(said, /\(ETIMEDOUT\)/);
  assert.doesNotMatch(said, /AggregateError/);
});

test("an AggregateError with no codes inside it is still a connection failure", () => {
  const err = new AggregateError([], "");
  assert.equal(isRetryableConnectionError(err), true);
  assert.equal(describeDownloadError(err, "us.aws.cdn.hf.co"),
    "Couldn't connect to us.aws.cdn.hf.co - the internet connection dropped, or this network blocks it. Try again in a moment.");
});

test("a name that cannot be looked up says the connection is down", () => {
  const err = Object.assign(new Error("getaddrinfo ENOTFOUND huggingface.co"), { code: "ENOTFOUND" });
  assert.equal(isRetryableConnectionError(err), true);
  // a school network that blocks a site by name looks exactly like this too
  assert.match(describeDownloadError(err, "huggingface.co"), /^Couldn't look up huggingface\.co - the internet connection seems to be down, or this network blocks it \(ENOTFOUND\)/);
});

test("a connection lost partway says the download starts again", () => {
  const err = Object.assign(new Error("aborted"), { code: "ECONNRESET" });
  assert.match(describeDownloadError(err, "us.aws.cdn.hf.co", { partway: true }), /dropped partway through the download \(ECONNRESET\)\. Try again - it starts from the beginning\./);
});

test("an answer from the server, and a cancellation, are not retried and keep their words", () => {
  for (const message of ["Download failed: HTTP 404", "Download cancelled.", "Too many redirects.", "Refusing to download over http."]) {
    const err = new Error(message);
    assert.equal(isRetryableConnectionError(err), false, message);
    assert.equal(describeDownloadError(err, "huggingface.co"), message);
  }
  assert.equal(isRetryableConnectionError(null), false);
});
