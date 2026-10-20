// T7 — API helpers: zod schemas for every body / param, and one error policy (400 / 404 / 500, no internals leaked).
import { z } from "zod";
import { DEMO_SLUGS } from "./data/personas";
import { PRESETS, NotFound } from "./service";
import { CAPABILITY_CODES, GOAL_TYPES } from "./vocabulary";

const MAX_BODY_BYTES = 16_000;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, "ISO date");
const code = z.string().regex(/^[A-Za-z0-9_:-]{1,80}$/);
const label = z.string().min(1).max(80);

export const slugParam = z.enum(DEMO_SLUGS);
export const goalIdParam = z.string().regex(/^goal-\d{1,6}-[a-z_]{1,40}$/);
export const stepIdParam = code;
export const scenarioIdParam = z.string().regex(/^[A-Za-z0-9_:.-]{1,120}$/);

export const feedbackBody = z.object({ target: code, kind: z.enum(["yes", "not_now", "no", "not_relevant"]) });

export const eventsBody = z.union([
  z.object({ preset: z.enum(PRESETS) }),
  z.object({
    event: z.object({
      id: code,
      at: isoDate,
      source: z.enum(["app", "transaction", "profile", "partner"]),
      kind: code,
      sourceRow: z.number().int().min(1).max(10_000).optional(),
      detail: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).default({}),
    }),
  }),
]);

const money = z.number().nonnegative().max(10_000_000);
export const constraintsSchema = z
  .object({
    budget: money.optional(),
    ownFunds: money.optional(),
    maxMonthlyPayment: money.optional(),
    deadline: isoDate.optional(),
    termYears: z.number().int().min(1).max(40).optional(),
    ratePct: z.number().min(0).max(20).optional(),
    targetProperty: z
      .object({
        kind: z.enum(["house", "apartment"]).optional(),
        buildYear: z.number().int().min(1800).max(2030).optional(),
        epc: z.enum(["A+", "A", "B", "C", "D", "E", "F"]).nullable().optional(),
        price: money.optional(),
      })
      .optional(),
  })
  .strict();

export const goalBody = z.object({
  slug: slugParam,
  type: z.enum(GOAL_TYPES),
  constraints: constraintsSchema.default({}),
  priorities: z.array(z.enum(["affordability", "energy_efficiency", "speed", "security"])).max(4).default([]),
});

export const stepBody = z.object({ action: z.enum(["accept", "skip", "start", "done", "block"]) });

export const consentBody = z.object({ stepId: code, partner: label, field: code, granted: z.boolean() });

export const whatIfBody = z
  .object({
    budget: money.optional(),
    incomeDeltaPct: z.number().min(-100).max(100).optional(),
    termYears: z.number().int().min(1).max(40).optional(),
    rateDeltaPct: z.number().min(-10).max(10).optional(),
    deadline: isoDate.optional(),
    dropCapabilities: z.array(z.enum(CAPABILITY_CODES)).max(CAPABILITY_CODES.length).optional(),
  })
  .strict();

export class BadRequest extends Error {}

/** Parse a JSON body against a schema (size-capped). */
export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new BadRequest("body too large");
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new BadRequest("invalid JSON");
  }
  return parse(schema, json);
}

export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const r = schema.safeParse(value);
  if (!r.success) throw new BadRequest(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  return r.data;
}

/** Run a handler with the API error policy. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn(), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BadRequest) return Response.json({ error: "bad_request", detail: err.message }, { status: 400 });
    if (err instanceof NotFound) return Response.json({ error: "not_found", detail: err.message }, { status: 404 });
    console.error("[api]", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
