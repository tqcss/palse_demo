import { describe, expect, it } from "vitest";

import { formatPercent, percentValue, share } from "./percent.ts";

describe("share", () => {
  it("returns count/total for positive totals", () => {
    expect(share(1, 3)).toBeCloseTo(1 / 3);
    expect(share(2, 4)).toBe(0.5);
  });

  it("guards against a zero total (never NaN)", () => {
    expect(share(0, 0)).toBe(0);
    expect(share(3, 0)).toBe(0);
    expect(share(3, -2)).toBe(0);
    expect(share(NaN, 5)).toBe(0);
    expect(share(3, NaN)).toBe(0);
  });
});

describe("percentValue", () => {
  it("rounds to one decimal", () => {
    expect(percentValue(1, 3)).toBe(33.3);
    expect(percentValue(2, 3)).toBe(66.7);
    expect(percentValue(1, 6)).toBe(16.7);
    expect(percentValue(0, 4)).toBe(0);
    expect(percentValue(4, 4)).toBe(100);
  });
});

describe("formatPercent", () => {
  it("always shows exactly one decimal", () => {
    expect(formatPercent(1, 3)).toBe("33.3%");
    expect(formatPercent(0, 0)).toBe("0.0%");
    expect(formatPercent(1, 1)).toBe("100.0%");
  });
});
