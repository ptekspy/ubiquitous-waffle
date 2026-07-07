import { normaliseRedditUsername } from "./normalise-reddit-username";

export function isValidRedditUsername(value: string): boolean {
  return /^[A-Za-z0-9_-]{3,20}$/.test(normaliseRedditUsername(value));
}
