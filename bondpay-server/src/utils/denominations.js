const STANDARD_DENOMINATIONS = [1000, 500, 100, 50, 20, 10, 5];

function breakDenominations(amount) {
  const result = [];
  let remaining = amount;

  if (amount % 5 !== 0) {
    throw new Error('Amount must be a multiple of min denomination (5 paisa)');
  }

  if (amount >= 10000) {
    const starterPack = [1000, 500, 100, 100, 50, 50, 20, 20, 10, 10, 5, 5];
    for (const val of starterPack) {
      if (remaining >= val) {
        result.push(val);
        remaining -= val;
      }
    }
  }

  for (const denom of STANDARD_DENOMINATIONS) {
    while (remaining >= denom) {
      result.push(denom);
      remaining -= denom;
    }
  }

  return result;
}

function calculateBondExpiry(ttlHours = 72) {
  const now = new Date();
  const expiry = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
  return expiry.toISOString();
}

module.exports = {
  STANDARD_DENOMINATIONS,
  breakDenominations,
  calculateBondExpiry,
};
