// What a failed download means, in words, and whether trying again could help.
//
// Node reports a connection that failed on every address a server has as an
// AggregateError with an empty message, so the app showed the bare word
// "AggregateError" and nothing else - on a laptop whose connection had simply
// dropped for a moment. A connection that never got going is worth trying
// again, because that is usually all it was; an answer the server gave, like
// a 404, is not.

// connection failures that come and go with the network
const TRANSIENT = new Set([
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ECONNABORTED", "EPIPE",
  "ENETUNREACH", "ENETDOWN", "EHOSTUNREACH", "EAI_AGAIN", "ENOTFOUND",
]);

// how many times a download is started before it is given up on, and how long
// to wait before each retry - long enough for a dropped Wi-Fi to come back
export const DOWNLOAD_ATTEMPTS = 3;
export const RETRY_DELAYS_MS = [2000, 5000];

// the code that says what went wrong: on an AggregateError it is on the
// attempts inside it, one per address, rather than on the error itself
export function connectionErrorCode(err) {
  if (!err) return null;
  if (err.code) return err.code;
  if (Array.isArray(err.errors)) {
    const inner = err.errors.find((e) => e && e.code);
    if (inner) return inner.code;
  }
  return null;
}

export function isRetryableConnectionError(err) {
  if (!err) return false;
  const code = connectionErrorCode(err);
  return (code !== null && TRANSIENT.has(code)) || err.name === "AggregateError";
}

// The sentence the person sees. `partway` is a connection lost after the
// download had started, which a retry would begin again from nothing.
export function describeDownloadError(err, host, { partway = false } = {}) {
  const where = host || "the download server";
  const code = connectionErrorCode(err);
  const tag = code ? ` (${code})` : "";
  if (!isRetryableConnectionError(err)) return (err && err.message) || String(err);
  if (partway) return `The connection to ${where} dropped partway through the download${tag}. Try again - it starts from the beginning.`;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return `Couldn't look up ${where} - the internet connection seems to be down${tag}. Try again in a moment.`;
  }
  return `Couldn't connect to ${where} - the internet connection dropped, or this network blocks it${tag}. Try again in a moment.`;
}
