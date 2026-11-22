import test from "node:test";
import assert from "node:assert/strict";
import { percentageBasis, percentagePrice } from "../shared/pricing.js";
test("Porcentajes exactos y redondeo al múltiplo de cinco más cercano", () => {
  assert.equal(percentageBasis("25"), 2500);
  assert.equal(percentageBasis("17.75"), 1775);
  for (const value of ["", "-1", "1.234", "NaN", "1e2"])
    assert.equal(percentageBasis(value), null);
  assert.equal(percentagePrice(1000000, 2500), 1250000);
  assert.equal(percentagePrice(1000199, 2500), 1250000);
  assert.equal(percentagePrice(1000200, 2500), 1250500);
  assert.equal(percentagePrice(1000300, 2500), 1250500);
  assert.equal(percentagePrice(1250000, -1775), 1028000);
  assert.equal(percentagePrice(1250500, -1775), 1028500);
  assert.equal(percentagePrice(1000000, -10000), null);
  assert.equal(percentagePrice(1e12, 1000000), null);
  assert.equal(percentagePrice(1, 0), null);
  assert.equal(percentagePrice(1000000, NaN), null);
});
