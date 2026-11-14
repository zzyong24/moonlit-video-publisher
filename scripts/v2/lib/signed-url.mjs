// Signed CDN URLs (token=, sign=, encfilekey=...) must never leave the Mac or
// land in receipts/logs. Keep only origin+path plus a digest that still lets a
// verifier match the live page URL without storing the secret.
import crypto from "node:crypto";

export const DIGEST_PREFIX = "sha256:";

export function urlDigest(url) {
  return DIGEST_PREFIX + crypto.createHash("sha256").update(String(url || "")).digest("hex").slice(0, 32);
}

export function redactUrl(url) {
  const value = String(url || "");
  const match = value.match(/^(https?:\/\/[^?#\s]*)([?#][^\s"']*)?$/i);
  if (!match) return value;
  return match[2] ? `${match[1]}?<redacted ${urlDigest(value)}>` : value;
}

export function digestFromRedacted(value) {
  const text = String(value || "");
  if (text.startsWith(DIGEST_PREFIX)) return text;
  const match = text.match(/<redacted (sha256:[0-9a-f]{32})>/);
  if (match) return match[1];
  return /^https?:\/\//i.test(text) ? urlDigest(text) : null;
}

const SIGNED_URL = /https?:\/\/[^\s"'<>]+[?#][^\s"'<>]*/gi;

export function redactText(text) {
  // Idempotent: an already redacted "...?<redacted sha256:...>" is left alone.
  return String(text ?? "").replace(SIGNED_URL, (url, offset, whole) => whole.startsWith("<redacted ", offset + url.length) ? url : redactUrl(url));
}

// Deep copy with every URL query stripped. Strings that are not URLs keep their
// text except for embedded signed URLs, which are redacted in place.
export function redactDeep(value) {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDeep(item)]));
  return value;
}

// A receipt URL matches the live page when it is the same raw URL (legacy
// receipts) or when its digest equals the digest of one live URL.
export function receiptUrlMatches(receiptUrl, liveUrls) {
  const list = (Array.isArray(liveUrls) ? liveUrls : (liveUrls ? [liveUrls] : [])).filter(Boolean).map(value => { const m = /^url\(\s*["']?(.*?)["']?\s*\)$/.exec(String(value).trim()); return m ? m[1] : value; });
  if (!receiptUrl) return false;
  if (list.includes(receiptUrl)) return true;
  const digest = digestFromRedacted(receiptUrl);
  return Boolean(digest) && list.some(url => urlDigest(url) === digest || digestFromRedacted(url) === digest);
}
