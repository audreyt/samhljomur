// Single source for every authored UI string (SPEC stage 7):
// every authored string goes through bi(is,en) -> copy/strings.json entries.

import strings from "../copy/strings.json" with { type: "json" };

export const S = strings as unknown as Record<
  string,
  { is: string; en: string; zh: string }
>;

export function bi(key: string): { is: string; en: string; zh: string } {
  const v = S[key];
  if (!v) throw new Error(`strings.json missing key: ${key}`);
  return v;
}

export function allKeys(): string[] {
  return Object.keys(S).filter((k) => !k.startsWith("_"));
}
