"use client";

import { useMemo, useState } from "react";
import {
  buildJourney,
  decide,
  demoCustomer,
  demoSignals,
  detectIntents,
  initState,
  scoreboard,
  setConsent,
  type JourneyState,
} from "@/engine";
import { IntentPanel, StageLabel, type IntentStatus } from "./IntentPanel";
import { ScoreboardPanel } from "./ScoreboardPanel";
import { StepCard } from "./StepCard";

export function JourneyApp() {
  const customer = demoCustomer;
  const intent = useMemo(() => detectIntents(customer, demoSignals)[0], [customer]);
  const [status, setStatus] = useState<IntentStatus>("detected");
  const [state, setState] = useState<JourneyState | null>(null);

  const confirm = () => {
    if (!intent) return;
    setStatus("confirmed");
    setState(initState(buildJourney(intent.intentId, customer)));
  };
  const reset = () => {
    setStatus("detected");
    setState(null);
  };

  const board = state
    ? scoreboard(state)
    : { customer: { eurOneOff: 0, eurPerYear: 0, kwhPerYear: 0, co2KgPerYear: 0 }, kbc: { productsActivated: 0, revenueEur: 0 }, partners: { leads: 0, valueEur: 0 } };
  const steps = state?.journey.steps ?? [];
  const decided = state ? steps.filter((s) => state.decisions[s.id] !== "pending").length : 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col px-6 py-6 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div className="flex items-center gap-4">
          <span className="grid h-11 place-items-center rounded-lg bg-navy px-3 font-display text-xl font-extrabold tracking-tight text-white">KBC</span>
          <div>
            <p className="font-display text-[1.6rem] font-extrabold leading-none text-navy">
              From intent <span className="text-kbc">→</span> to done
            </p>
            <p className="mt-1 text-sm text-mute">One journey across KBC and its partners. You approve every step.</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-line bg-white py-1.5 pl-1.5 pr-4">
            <span className="grid size-9 place-items-center rounded-full bg-sky font-display font-extrabold text-kbc">{customer.name[0]}</span>
            <span className="text-sm leading-tight">
              <b className="font-semibold">{customer.name}, {customer.age}</b>
              <span className="block text-mute">{customer.city} · {customer.household}</span>
            </span>
          </div>
          <button onClick={reset} className="rounded-full px-4 py-2 text-sm font-medium text-mute ring-1 ring-line transition hover:bg-white hover:text-navy">
            Reset demo
          </button>
        </div>
      </header>

      <main className="mt-7 grid flex-1 gap-8 lg:grid-cols-[minmax(280px,340px)_1fr] xl:grid-cols-[340px_1fr_360px]">
        <IntentPanel
          customer={customer}
          signals={demoSignals}
          intent={intent}
          status={status}
          onConfirm={confirm}
          onDecline={() => setStatus("declined")}
        />

        <section aria-labelledby="journey-title" className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-col gap-2">
            <StageLabel n={2} id="journey-title">Your journey</StageLabel>
            {state && (
              <p className="font-display text-[1.6rem] font-extrabold leading-tight text-navy">{state.journey.title}</p>
            )}
          </div>

          {state ? (
            <ol className="relative flex flex-col gap-4 before:absolute before:bottom-6 before:left-5 before:top-6 before:w-px before:bg-line">
              {steps.map((s, i) => (
                <StepCard
                  key={s.id}
                  index={i}
                  step={s}
                  decision={state.decisions[s.id]}
                  consents={state.consents[s.id] ?? {}}
                  onDecide={(d) => setState((st) => (st ? decide(st, s.id, d) : st))}
                  onConsent={(f, ok) => setState((st) => (st ? setConsent(st, s.id, f, ok) : st))}
                />
              ))}
            </ol>
          ) : (
            <EmptyJourney declined={status === "declined"} />
          )}
        </section>

        <div className="lg:col-span-2 xl:col-span-1">
          <div className="xl:sticky xl:top-6">
            <ScoreboardPanel board={board} decided={decided} total={steps.length} />
          </div>
        </div>
      </main>
    </div>
  );
}

function EmptyJourney({ declined }: { declined: boolean }) {
  return (
    <div className="grid min-h-[420px] place-items-center rounded-3xl border-2 border-dashed border-line bg-white/60 p-10 text-center">
      <div className="max-w-sm">
        <p className="font-display text-2xl font-semibold text-navy">
          {declined ? "Nothing to show — by choice." : "Your journey appears once you confirm."}
        </p>
        <p className="mt-2 text-mute">
          {declined
            ? "No journey is built and no data is shared with any partner."
            : "KBC never builds a plan on a guess. The customer says yes first."}
        </p>
      </div>
    </div>
  );
}
