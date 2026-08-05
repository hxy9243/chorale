export type RationalDuration = Readonly<{
  numerator: number;
  denominator: number;
}>;

const gcd = (left: bigint, right: bigint): bigint => {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
};

const assertDurationInteger = (value: number, field: string) => {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${field} must be a safe integer.`);
  }
};

const fromBigInts = (numerator: bigint, denominator: bigint): RationalDuration => {
  if (numerator < 0n) {
    throw new RangeError('Rational duration numerator must be non-negative.');
  }
  if (denominator <= 0n) {
    throw new RangeError('Rational duration denominator must be positive.');
  }

  const divisor = gcd(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  const numberNumerator = Number(reducedNumerator);
  const numberDenominator = Number(reducedDenominator);
  if (!Number.isSafeInteger(numberNumerator) || !Number.isSafeInteger(numberDenominator)) {
    throw new RangeError('Rational duration exceeds the safe integer range.');
  }

  return Object.freeze({
    numerator: numberNumerator,
    denominator: numberDenominator,
  });
};

export const createRationalDuration = (
  numerator: number,
  denominator: number,
): RationalDuration => {
  assertDurationInteger(numerator, 'Rational duration numerator');
  assertDurationInteger(denominator, 'Rational duration denominator');
  return fromBigInts(BigInt(numerator), BigInt(denominator));
};

export const createRationalDurationFromNumber = (
  value: number,
  maximumDenominator = 65_536,
): RationalDuration => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('Rational duration value must be finite and non-negative.');
  }
  if (!Number.isSafeInteger(maximumDenominator) || maximumDenominator <= 0) {
    throw new RangeError('Maximum denominator must be a positive safe integer.');
  }
  if (Number.isSafeInteger(value)) return createRationalDuration(value, 1);

  let remainder = value;
  let previousNumerator = 0;
  let numerator = 1;
  let previousDenominator = 1;
  let denominator = 0;

  while (true) {
    const coefficient = Math.floor(remainder);
    const nextNumerator = coefficient * numerator + previousNumerator;
    const nextDenominator = coefficient * denominator + previousDenominator;
    if (
      !Number.isSafeInteger(nextNumerator)
      || !Number.isSafeInteger(nextDenominator)
      || nextDenominator > maximumDenominator
    ) {
      break;
    }

    previousNumerator = numerator;
    numerator = nextNumerator;
    previousDenominator = denominator;
    denominator = nextDenominator;

    if (Math.abs(numerator / denominator - value) <= Number.EPSILON * 16) {
      return createRationalDuration(numerator, denominator);
    }

    const fractionalPart = remainder - coefficient;
    if (fractionalPart <= Number.EPSILON) break;
    remainder = 1 / fractionalPart;
  }

  if (denominator > 0 && Math.abs(numerator / denominator - value) <= 1e-12) {
    return createRationalDuration(numerator, denominator);
  }
  throw new RangeError('Rational duration cannot be represented within the denominator limit.');
};

export const isRationalDuration = (value: unknown): value is RationalDuration => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<RationalDuration>;
  if (
    !Number.isSafeInteger(candidate.numerator)
    || !Number.isSafeInteger(candidate.denominator)
    || candidate.numerator! < 0
    || candidate.denominator! <= 0
  ) {
    return false;
  }
  return gcd(BigInt(candidate.numerator!), BigInt(candidate.denominator!)) === 1n;
};

const assertRationalDuration = (value: RationalDuration) => {
  if (!isRationalDuration(value)) {
    throw new RangeError('Expected a normalized rational duration.');
  }
};

export const addRationalDurations = (
  left: RationalDuration,
  right: RationalDuration,
): RationalDuration => {
  assertRationalDuration(left);
  assertRationalDuration(right);
  const numerator = (
    BigInt(left.numerator) * BigInt(right.denominator)
    + BigInt(right.numerator) * BigInt(left.denominator)
  );
  const denominator = BigInt(left.denominator) * BigInt(right.denominator);
  return fromBigInts(numerator, denominator);
};

export const compareRationalDurations = (
  left: RationalDuration,
  right: RationalDuration,
): -1 | 0 | 1 => {
  assertRationalDuration(left);
  assertRationalDuration(right);
  const leftProduct = BigInt(left.numerator) * BigInt(right.denominator);
  const rightProduct = BigInt(right.numerator) * BigInt(left.denominator);
  if (leftProduct < rightProduct) return -1;
  if (leftProduct > rightProduct) return 1;
  return 0;
};
