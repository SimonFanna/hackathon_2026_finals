// POST /api/kate/reply {slug, messageId, action, goalId?} → stores feedback, opens goal set-up, or forwards a scenario choice.
import { z } from "zod";
import { kateReply, REPLY_ACTION, type ReplyAction } from "../../../../backend/engine/kate/reply";
import { clientKey, rateLimit } from "../_lib/rate-limit";
import { DEMO_SLUGS, kateDeps, loadSession, saveFeedback } from "../_lib/session";

const Body = z.object({
  slug: z.enum(DEMO_SLUGS),
  messageId: z.string().max(300),
  action: z.string().regex(REPLY_ACTION),
  goalId: z.string().max(80).regex(/^[\w.:-]+$/).optional(),
});

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "kate-reply"), 30);
  if (!limit.ok) return Response.json({ error: "too_many_requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { slug, messageId, action, goalId } = parsed.data;

  const session = await loadSession(slug, goalId, false);
  if (!session) return Response.json({ error: "unknown_customer" }, { status: 404 });
  const { ctx, rules, asOf } = session.input;

  const result = kateReply({ messageId, action: action as ReplyAction, ctx, rules, signals: session.signals, asOf, deps: kateDeps, goalId });
  if ("error" in result) return Response.json({ error: result.error }, { status: 400 });
  if (result.feedback) await saveFeedback(result.feedback);
  return Response.json(result);
}
