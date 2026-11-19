const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * ULID を作る（設計書 4章。要素などの ID）。先頭の10文字が時刻、残りの16文字が乱数で、作った順に並ぶ。
 */
export function ulid(
  now: number = Date.now(),
  random: (bytes: Uint8Array) => Uint8Array = (bytes) =>
    crypto.getRandomValues(bytes),
): string {
  let time = "";
  let rest = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }
  const bytes = random(new Uint8Array(16));
  let tail = "";
  for (const byte of bytes) tail += ALPHABET[byte % 32];
  return time + tail;
}
