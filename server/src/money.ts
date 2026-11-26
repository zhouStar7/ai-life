// API and model payloads use yuan. Parse the decimal digits so fraction-to-cent
// conversion never rounds a binary floating-point product.
export function yuanToCents(value: unknown): bigint | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const match = /^(\d{1,14})(?:\.(\d{1,2}))?$/.exec(String(value).trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  // Above this magnitude numeric yuan can no longer distinguish every cent.
  return cents < (2n ** 46n) * 100n ? cents : null;
}

export function centsToYuan(cents: bigint): number {
  return Number(cents) / 100;
}

export function expenseToYuan<T extends { amountCents: bigint }>({ amountCents, ...row }: T) {
  return { ...row, amount: centsToYuan(amountCents) };
}
