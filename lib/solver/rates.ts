export const POWER_EXPONENT = 1.321928;
const EPS = 1e-6;

export function amplification(filled: number, slots: number): number {
  if (slots <= 0 || filled <= 0) return 1;
  return 1 + filled / slots;
}

export function powerMw(base: number, clock: number, filled: number, slots: number): number {
  const sloop = slots > 0 ? (1 + Math.min(filled, slots) / slots) ** 2 : 1;
  return base * sloop * (clock / 100) ** POWER_EXPONENT;
}

export function shardsForClock(clock: number): number {
  if (clock <= 100) return 0;
  if (clock <= 150) return 1;
  if (clock <= 200) return 2;
  return 3;
}

export function roundClock(clock: number): number {
  return Math.min(250, Math.max(1, Math.ceil(clock * 10000) / 10000));
}

export type MachineDraft = {
  clock: number;
};

export function clocksForRate(needed: number, perMinuteAt100: number, fullClock: number, amp: number): number[] {
  if (needed <= EPS || perMinuteAt100 <= EPS) return [];
  const perFull = perMinuteAt100 * (fullClock / 100) * amp;
  if (needed <= perFull + EPS) {
    return [roundClock((needed / (perMinuteAt100 * amp)) * 100)];
  }
  const fullCount = Math.floor((needed + EPS) / perFull);
  const clocks = Array.from({ length: fullCount }, () => fullClock);
  const remainder = needed - fullCount * perFull;
  if (remainder > EPS) {
    clocks.push(roundClock((remainder / (perMinuteAt100 * amp)) * 100));
  }
  return clocks;
}
