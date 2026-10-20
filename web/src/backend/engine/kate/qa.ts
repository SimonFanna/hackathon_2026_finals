// Server-only: plan Q&A. Route (deterministic) → draft from engine facts → LLM rephrase → guard → or fallback.
import type { Scenario } from "../../types";
import { draftAnswer, type QaInput } from "./answers";
import type { KateDeps } from "./deps";
import { isGrounded, isSafe, llmConfigFromEnv, rephrase, type LlmConfig } from "./llm";
import { MAX_QUESTION_CHARS, routeQuestion, type Route } from "./router";

export interface PlanAnswer {
  text: string;
  scenarios?: Scenario[];
  source: "llm" | "fallback";
  route: Route["kind"];
}

export async function answerPlanQuestion(
  q: string, input: QaInput, deps: KateDeps = {}, llm: LlmConfig | null = llmConfigFromEnv(),
): Promise<PlanAnswer> {
  // Strip control characters and cap the length before anything reads the question.
  const question = q.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_QUESTION_CHARS);
  const route = routeQuestion(question, input.plan);
  const draft = draftAnswer(route, question, input, deps);
  const fallback: PlanAnswer = { text: draft.text, scenarios: draft.scenarios, source: "fallback", route: route.kind };

  // Refusals never reach the LLM: the rule is enforced by code, not by a prompt.
  if (route.kind === "refuse" || !llm) return fallback;
  const text = await rephrase(question, draft, llm);
  if (!text || !isGrounded(text, draft, question) || !isSafe(text)) return fallback;
  return { text, scenarios: draft.scenarios, source: "llm", route: route.kind };
}
