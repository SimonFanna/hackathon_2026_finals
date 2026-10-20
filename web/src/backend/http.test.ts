// T7 — input validation and the write guard (backend/REVIEW.md #2, #7, #9).
import { afterEach, describe, expect, it } from "vitest";
import { constraintsSchema, eventsBody, guardWrite, scenarioIdParam } from "./http";

const req = (headers: Record<string, string>) => new Request("https://demo.example/api/goals", { method: "POST", headers });

describe("API validation", () => {
  it("accepts T6 scenario ids with combined strategies", () => {
    expect(scenarioIdParam.safeParse("goal-1-buy_and_prepare_home:v1:extend_term+add_protection").success).toBe(true);
    expect(scenarioIdParam.safeParse("../etc/passwd").success).toBe(false);
  });

  it("rejects impossible dates", () => {
    expect(constraintsSchema.safeParse({ deadline: "2026-13-31" }).success).toBe(false);
    expect(constraintsSchema.safeParse({ deadline: "2027-04-01" }).success).toBe(true);
  });

  it("bounds injected event numbers", () => {
    const event = (overrunEur: number) => ({ event: { id: "x1", at: "2026-10-01", source: "partner", kind: "partner:quote_received", detail: { overrunEur } } });
    expect(eventsBody.safeParse(event(987_654_321)).success).toBe(false);
    expect(eventsBody.safeParse(event(6000)).success).toBe(true);
  });
});

describe("write guard", () => {
  afterEach(() => {
    delete process.env.DEMO_TOKEN;
  });

  it("blocks cross-site browser writes, allows same-origin", () => {
    expect(() => guardWrite(req({ "sec-fetch-site": "cross-site", "x-forwarded-for": "1.1.1.1" }), "t1")).toThrow(/cross-site/);
    expect(() => guardWrite(req({ origin: "https://evil.example", host: "demo.example", "x-forwarded-for": "1.1.1.2" }), "t1")).toThrow(/cross-site/);
    expect(() => guardWrite(req({ "sec-fetch-site": "same-origin", "x-forwarded-for": "1.1.1.3" }), "t1")).not.toThrow();
  });

  it("rate-limits one client", () => {
    const r = () => guardWrite(req({ "x-forwarded-for": "2.2.2.2" }), "t2");
    for (let i = 0; i < 30; i++) r();
    expect(r).toThrow(/too many/);
  });

  it("requires the demo token on control routes when DEMO_TOKEN is set", () => {
    process.env.DEMO_TOKEN = "s3cret-token";
    expect(() => guardWrite(req({ "x-forwarded-for": "3.3.3.3" }), "reset", { control: true })).toThrow(/token/);
    expect(() => guardWrite(req({ "x-forwarded-for": "3.3.3.4", "x-demo-token": "s3cret-token" }), "reset", { control: true })).not.toThrow();
    expect(() => guardWrite(req({ "x-forwarded-for": "3.3.3.5" }), "feedback")).not.toThrow();
  });
});
