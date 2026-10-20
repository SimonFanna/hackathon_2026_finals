// What happens when the customer taps a button on a Kate message. Pure: it returns the feedback to store,
// the next Kate message, and (for a scenario choice) which engine route applies it. Kate never executes on her own.
import type { Feedback, IntentCode, KateMessage, PersistentContext, RuleSet, Signal } from "../../types";
import { INTENT_CODES } from "../../vocabulary";
import type { KateDeps } from "./deps";
import { goalSetup, type SetupQuestion } from "./messages";

export type ReplyAction = "yes" | "not_now" | "no" | "advisor" | `choose:${string}`;
export const REPLY_ACTION = /^(yes|not_now|no|advisor|choose:[\w-]{1,64})$/;

export interface ReplyResult {
  message: KateMessage;
  feedback?: Feedback;
  questions?: SetupQuestion[];
  /** The engine call that applies the choice (T7 route). The UI or the route handler performs it. */
  forward?: { method: "POST"; path: string };
}

/** Kate message ids are `kate:<customerId>:<INTENT|DISRUPTION>:…` (see messages.ts). */
export function parseMessageId(id: string): { customerId: number; code: string; goalId?: string } | null {
  const m = id.match(/^kate:(\d{1,9}):([A-Z_]{2,40})(?::([\w.-]{1,80}))?(?::[\w:+.-]{0,200})?$/);
  if (!m) return null;
  return { customerId: Number(m[1]), code: m[2], goalId: m[3] };
}

const isIntent = (c: string): c is IntentCode => (INTENT_CODES as readonly string[]).includes(c);

export function kateReply(args: {
  messageId: string; action: ReplyAction; ctx: PersistentContext; rules: RuleSet; signals: Signal[]; asOf: string;
  deps: KateDeps; goalId?: string;
}): ReplyResult | { error: string } {
  const { messageId, action, ctx, rules, signals, asOf, deps } = args;
  const ref = parseMessageId(messageId);
  if (!ref || ref.customerId !== ctx.customerId) return { error: "unknown_message" };
  const msg = (kind: KateMessage["kind"], text: string, extra: Partial<KateMessage> = {}): KateMessage => ({
    id: `${messageId}:${action}`, customerId: ctx.customerId, at: asOf, kind, text, actions: [], refs: {}, ...extra,
  });

  if (action.startsWith("choose:")) {
    const goalId = args.goalId ?? ref.goalId;
    if (!goalId) return { error: "missing_goal" };
    const sid = action.slice("choose:".length);
    return {
      message: msg("info", "OK, I'm updating your plan with this option. You'll see the new version, and you can still change your mind with an advisor.", { refs: { goalId, scenarioIds: [sid] } }),
      forward: { method: "POST", path: `/api/goals/${encodeURIComponent(goalId)}/scenarios/${encodeURIComponent(sid)}/choose` },
    };
  }
  if (action === "advisor") {
    return { message: msg("info", "I'll ask a KBC advisor to contact you about your plan. Nothing changes until you've talked.", { refs: { goalId: args.goalId ?? ref.goalId } }) };
  }

  if (!isIntent(ref.code)) return { error: "unknown_intent" };
  const intent = rules.intents.find((i) => i.code === ref.code);
  if (!intent) return { error: "unknown_intent" };
  const kind: Feedback["kind"] = action === "yes" ? "yes" : action === "not_now" ? "not_now" : "no";
  const feedback: Feedback = { customerId: ctx.customerId, target: intent.code, kind, at: asOf };

  if (action === "yes") {
    const { questions } = goalSetup(intent, ctx, rules, { signals, asOf, affordability: deps.affordability });
    return {
      feedback, questions,
      message: msg("goal_setup", `Great, ${ctx.firstName}! A few quick questions and I'll build your plan. I've pre-filled what I could: just check the figures.`, {
        actions: [{ id: "confirm", label: "Build my plan" }], refs: { intent: intent.code },
      }),
    };
  }
  if (action === "not_now") {
    return { feedback, message: msg("info", "No problem. I'll keep it in mind and won't bring it up for a while.", { refs: { intent: intent.code } }) };
  }
  return { feedback, message: msg("info", "Understood, I won't suggest this again. You can always ask me about it later.", { refs: { intent: intent.code } }) };
}
