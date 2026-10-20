// POST /api/kate/ask {slug, goalId?, question} → Kate's grounded answer about the plan (LLM + deterministic fallback).
import { z } from "zod";
import { answerPlanQuestion } from "../../../../backend/engine/kate/qa";
import { MAX_QUESTION_CHARS } from "../../../../backend/engine/kate/router";
import type { KateMessage } from "../../../../backend/types";
import { clientKey, rateLimit } from "../_lib/rate-limit";
import { DEMO_SLUGS, kateDeps, loadSession } from "../_lib/session";

const Body = z.object({
  slug: z.enum(DEMO_SLUGS),
  goalId: z.string().max(80).regex(/^[\w.:-]+$/).optional(),
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
});

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "kate-ask"));
  if (!limit.ok) return Response.json({ error: "too_many_requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { slug, goalId, question } = parsed.data;

  const session = loadSession(slug, goalId);
  if (!session) return Response.json({ error: "no_plan" }, { status: 404 });

  const a = await answerPlanQuestion(question, session.input, kateDeps);
  const message: KateMessage = {
    id: `kate:${session.input.ctx.customerId}:ANSWER:${session.input.goal.id}:${Date.now()}`,
    customerId: session.input.ctx.customerId,
    at: new Date().toISOString(),
    kind: "answer",
    text: a.text,
    actions: [],
    refs: { goalId: session.input.goal.id, scenarioIds: a.scenarios?.map((s) => s.id) },
  };
  return Response.json({ message, source: a.source, route: a.route, scenarios: a.scenarios ?? [] });
}
