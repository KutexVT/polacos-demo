// Percentages use hundredths of a percent; prices use cents throughout.
export function percentageBasis(value) {
  const text = String(value ?? "");
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, decimal = ""] = text.split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
export function percentagePrice(base, basis) {
  if (
    !Number.isSafeInteger(base) ||
    base <= 0 ||
    base > 1e12 ||
    !Number.isInteger(basis) ||
    basis <= -10000 ||
    basis > 1000000
  )
    return null;
  // Round to the nearest five colones. Exact ties round up.
  const price = Number(
    ((BigInt(base) * BigInt(10000 + basis) + 2500000n) / 5000000n) * 500n,
  );
  return price > 0 && price <= 1e12 ? price : null;
}
