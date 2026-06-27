import { Bond } from '../types';

export function solveExactChange(
  availableBonds: Bond[],
  targetAmount: number
): Bond[] | null {
  const dp: (number[] | null)[] = new Array(targetAmount + 1).fill(null);
  dp[0] = [];

  for (let i = 0; i < availableBonds.length; i++) {
    const bondVal = availableBonds[i].value;
    for (let w = targetAmount; w >= bondVal; w--) {
      if (dp[w - bondVal] !== null && dp[w] === null) {
        dp[w] = [...dp[w - bondVal]!, i];
      }
    }
  }

  const selectedIndices = dp[targetAmount];
  if (!selectedIndices) return null;

  return selectedIndices.map((idx) => availableBonds[idx]);
}

export function suggestClosestAmounts(
  availableBonds: Bond[],
  targetAmount: number
): number[] {
  const sums = new Set<number>();
  sums.add(0);

  for (const bond of availableBonds) {
    const currentSums = Array.from(sums);
    for (const s of currentSums) {
      const newSum = s + bond.value;
      if (newSum <= targetAmount * 1.5) {
        sums.add(newSum);
      }
    }
  }

  return Array.from(sums)
    .filter((s) => s > 0)
    .sort((a, b) => Math.abs(a - targetAmount) - Math.abs(b - targetAmount))
    .slice(0, 5);
}

export function generateSecureNonce(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function calculateDJB2(data: Uint8Array): number {
  let hash = 5381;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) + hash + data[i]) & 0xffffffff;
  }
  return hash >>> 0;
}
