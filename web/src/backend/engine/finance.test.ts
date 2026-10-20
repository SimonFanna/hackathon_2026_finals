import { describe, expect, it } from "vitest";
import { affordability, annuity, maxPrincipal } from "./finance";
import { sofieCtx } from "../fixtures/t5-inputs";

describe("annuity", () => {
  it("matches a known value (€220k, 3.2%, 25y ≈ €1,066/month)", () => {
    expect(annuity(220_000, 3.2, 25)).toBeCloseTo(1066.17, 0);
  });
  it("handles a zero rate and empty loans", () => {
    expect(annuity(12_000, 0, 1)).toBe(1000);
    expect(annuity(0, 3.2, 25)).toBe(0);
  });
  it("maxPrincipal is its inverse", () => {
    const p = maxPrincipal(annuity(180_000, 3.2, 30), 3.2, 30);
    expect(p).toBeCloseTo(180_000, 4);
    expect(maxPrincipal(1000, 0, 1)).toBe(12_000);
  });
});

describe("affordability", () => {
  it("lets Sofie afford a €250k home with €30k own funds", () => {
    const a = affordability(sofieCtx);
    expect(a.maxMonthlyPayment).toBe(1100);
    expect(a.ownFunds).toBe(30_000);
    expect(a.maxPrincipal + a.ownFunds).toBeGreaterThanOrEqual(250_000);
  });
  it("removes existing debt and never goes negative", () => {
    expect(affordability({ ...sofieCtx, monthlyDebt: 400 }).maxMonthlyPayment).toBe(700);
    expect(affordability({ ...sofieCtx, monthlyDebt: 5000 }).maxMonthlyPayment).toBe(0);
  });
});
