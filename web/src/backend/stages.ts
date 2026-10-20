// T7 — the pipeline stages owned by other tasks, behind one interface so tests can swap them.
//   T1 toEvents / extractSignals / buildContext  → engine/events.ts, signals.ts, context.ts
//   T2 model                                     → engine/model.ts (momentModel) — not on main yet: T3 falls back to moment_rules
//   T8 kateForDecision / kateForScenarios        → engine/kate/messages.ts
import { buildContext } from "./engine/context";
import { toEvents } from "./engine/events";
import { kateForDecision, kateForScenarios } from "./engine/kate/messages";
import type { MomentModel } from "./engine/moments";
import { extractSignals } from "./engine/signals";
import type {
  ActiveMoment,
  CustomerFacts,
  Decision,
  Disruption,
  DisruptionType,
  Event,
  Goal,
  Impact,
  IntentDef,
  KateMessage,
  PersistentContext,
  Scenario,
  Signal,
  SignalRule,
} from "./types";

export interface Engine {
  toEvents(facts: CustomerFacts): Event[];
  extractSignals(events: Event[], rules: SignalRule[], asOf: string): Signal[];
  buildContext(facts: CustomerFacts, signals: Signal[]): PersistentContext;
  model?: MomentModel;
  kateForDecision(d: Decision, intent: IntentDef, ctx: PersistentContext, moment: ActiveMoment, asOf: string): KateMessage | null;
  kateForScenarios(impact: Impact, scenarios: Scenario[], ctx: PersistentContext, dt: DisruptionType, goal?: Goal, disruption?: Disruption): KateMessage;
}

export const engine: Engine = {
  toEvents,
  extractSignals,
  buildContext,
  model: undefined, // T2: momentModel from engine/model.ts once it lands
  kateForDecision,
  kateForScenarios,
};
