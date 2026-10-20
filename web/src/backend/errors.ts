// T7 — errors the API maps to HTTP statuses (see http.ts `handle`).
export class BadRequest extends Error {}
export class NotFound extends Error {}
export class Forbidden extends Error {}
export class TooManyRequests extends Error {
  constructor(readonly retryAfterS: number) {
    super("too many requests");
  }
}
