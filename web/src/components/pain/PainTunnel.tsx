"use client";

import { useCallback, useEffect, useState } from "react";
import { getPersona } from "@/engine";
import { KbcLogo } from "../journey/KbcLogo";
import { CHAPTERS, LAST_FRAME, buildPainRun, chapterFor, frameFor, money } from "./model";
import { facts, providers, scenes, unknowns } from "./copy";
import { HouseWorld, ThomasSprite } from "./World";
import "./pain.css";

const persona = getPersona("house");
const snapshots = buildPainRun(persona.outcome);
const price = 320000; // Synthetic listing price; the complete project budget comes from the engine.

export function PainTunnel({ initialFrame = 0, still = false, onReplay, onSkip }: {
  initialFrame?: number; still?: boolean; onReplay: () => void; onSkip: () => void;
}) {
  const [frame, setFrame] = useState(initialFrame);
  const chapter = chapterFor(frame);
  const copy = scenes[frame];
  const eventIndex = frame === LAST_FRAME ? 0 : Math.min(4, Math.max(0, frame - 3));
  const snapshot = snapshots[eventIndex];
  const { run, health } = snapshot;
  const event = frame >= 4 && frame <= 7 ? persona.outcome.disruptions[frame - 4] : null;
  const eventDetail = event?.kind === "income"
    ? "An email confirms his contract ends this month. His household income drops until he finds work."
    : event?.detail;
  const damaged = frame >= 4 && frame < 9;
  const forward = useCallback(() => {
    if (frame === LAST_FRAME) onReplay();
    else setFrame((current) => Math.min(LAST_FRAME, current + 1));
  }, [frame, onReplay]);
  const back = useCallback(() => setFrame((current) => Math.max(0, current - 1)), []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if ((event.key === "Enter" || event.key === " ") && target?.closest("button, a")) return;
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(event.key)) { event.preventDefault(); forward(); }
      if (["ArrowLeft", "PageUp"].includes(event.key)) { event.preventDefault(); back(); }
      if (event.key === "Escape") { event.preventDefault(); onSkip(); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [forward, back, onSkip]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("intro");
    url.searchParams.delete("demo");
    url.searchParams.delete("player");
    url.searchParams.set("pain", String(chapterFor(frame) + 1));
    if (frame >= 4 && frame <= 7) url.searchParams.set("hit", String(frame - 3));
    else url.searchParams.delete("hit");
    window.history.replaceState(null, "", url);
  }, [frame]);

  return (
    <main className={`pain-game ${damaged ? "pain-danger" : ""} ${frame === 9 ? "pain-retry" : ""} ${still ? "pain-still" : ""}`} data-pain-frame={frame}>
      <div className="pain-grain" aria-hidden="true" />
      <header className="pain-header">
        <a href="?intro=0" onClick={(e) => { e.preventDefault(); onSkip(); }} className="pain-brand" aria-label="KBC Outcome Engine demo">
          <span className="pain-logo"><KbcLogo size={26} /></span>
          <span>KBC <span className="pain-brand-sub">/ Outcome Engine</span></span>
        </a>
        <span className="pain-header-center"><span className="pain-status-light" /> AN INTERACTIVE STORY</span>
        <button className="pain-skip" onClick={onSkip}>Skip intro <span aria-hidden="true">↗</span></button>
      </header>

      <div className="pain-hud" aria-label="Thomas’s project status">
        <div className="pain-player"><span className="pain-player-icon"><ThomasSprite tired={damaged} /></span><span><span className="pain-micro">PLAYER 01</span><strong>THOMAS <span>LVL. 1</span></strong></span></div>
        <div className="pain-health"><div><span className="pain-micro">PROJECT HEALTH</span><strong>{health}<span>/100</span></strong></div><div className="pain-health-track"><span style={{ width: `${health}%` }} /></div><span className="pain-health-note">Illustrative plan score</span></div>
        <div className="pain-hud-stat"><span className="pain-micro">PROJECT COST</span><strong>{frame === 0 ? "—" : money(run.plan.values.cost)}</strong></div>
        <div className="pain-hud-stat"><span className="pain-micro">MOVE-IN</span><strong>{frame === 0 ? "THE DREAM" : `MONTH ${run.plan.values.finish}`}</strong></div>
        <div className="pain-mode"><span className="pain-micro">PLAYING MODE</span><strong>{frame === 9 ? "CO-PILOT READY" : "ON HIS OWN"}</strong></div>
      </div>

      <section key={frame} className="pain-scene" aria-live="polite" aria-atomic="true">
        <div className="pain-narrative">
          <div className="pain-eyebrow"><span className="pain-cross">✦</span> {copy.eyebrow}</div>
          <h1>{copy.title.split("\n").map((line, index) => <span key={line} className={index === copy.title.split("\n").length - 1 ? "pain-title-accent" : ""}>{line}</span>)}</h1>
          <p className="pain-description">{copy.body}</p>
          {frame === 0 && <div className="pain-quest"><span className="pain-micro">YOUR MISSION</span><p>Buy it. Renovate it. Move in on time.</p><span>One year. One very real life goal.</span></div>}
          {frame === 2 && <a className="pain-fact" href={facts.grants} target="_blank" rel="noreferrer"><strong>71%</strong><span>don’t know which renovation grants or help exist.<small>CBC survey cited by KBC, 2026 ↗</small></span></a>}
          {frame === 3 && <div className="pain-coordination"><strong>One project.</strong><span>So many separate conversations.</span><small>Illustrative conversations</small></div>}
          {event && <div className="pain-impact"><span className="pain-micro">MONTH {event.month} · HIT {frame - 3}/4</span><strong>{frame === 4 ? `+${money(event.delta.values?.monthly ?? 0)} / month` : frame === 5 ? `+${money(event.delta.values?.cost ?? 0)}` : frame === 6 ? `+${event.delta.values?.finish ?? 0} months` : `${money(run.plan.limits.monthly)} / month`}</strong><span>{frame === 7 ? "His new affordable repayment limit" : "One change. More than one consequence."}</span></div>}
          {frame === 8 && <div className="pain-result-line"><span>✕</span> {snapshot.checks.filter((check) => !check.ok).length} of 4 project limits broken</div>}
          {frame === 9 && <div className="pain-retry-features"><span>01 <b>Connect the steps</b></span><span>02 <b>Adapt when life changes</b></span><span>03 <b>Keep Thomas in control</b></span></div>}
        </div>

        <div className={`pain-visual pain-visual-${frame}`}>
          <div className="pain-world-grid" aria-hidden="true" />
          {(frame === 0 || frame === 9) && <>
            <span className="pain-world-tag">{frame === 9 ? "CHECKPOINT / A FRESH START" : "GENT, BELGIUM / A NEW CHAPTER"}</span>
            <HouseWorld restored={frame === 9} />
            <div className="pain-house-label"><span>{frame === 9 ? "SAME HOUSE. SAME GOAL." : "1975 · A GARDEN · LOTS OF POTENTIAL"}</span><strong>{frame === 9 ? "A plan that adapts." : money(price)}</strong><small>{frame === 9 ? "With KBC and its ecosystem partners" : "Illustrative asking price"}</small></div>
            <div className="pain-hero-sprite"><div className="pain-speech">{copy.thought}</div><ThomasSprite />{frame === 9 && <span className="pain-kate-sprite"><ThomasSprite companion /><span>KATE</span></span>}</div>
            {frame === 0 && <div className="pain-heart" aria-hidden="true">♥</div>}
          </>}
          {frame === 1 && <div className="pain-receipt-wrap"><div className="pain-receipt-shadow" /><div className="pain-receipt"><span className="pain-micro">THOMAS’S FIRST HOME</span><h2>The full picture.</h2><div className="pain-receipt-rule" /><ReceiptLine label="The house" amount={price} /><ReceiptLine label="Purchase & financing costs" amount={16000} /><ReceiptLine label="Planned renovation" amount={run.plan.values.cost - price - 16000} /><div className="pain-receipt-rule" /><div className="pain-receipt-total"><span>PROJECT TOTAL</span><strong>{money(run.plan.values.cost)}</strong></div><p>{money(run.plan.values.cost - price)} beyond the asking price.</p><small>Illustrative breakdown, not a quote.<br />Total matches the demo’s starting plan.</small><div className="pain-barcode" aria-hidden="true" /></div><span className="pain-receipt-stamp">MORE THAN<br />A MORTGAGE</span></div>}
          {frame === 2 && <><HouseWorld compact /><div className="pain-question-cloud">{unknowns.map((word, index) => <span key={word} style={{ "--i": index } as React.CSSProperties}>{word}</span>)}</div><div className="pain-overwhelmed"><div className="pain-speech">{copy.thought}</div><ThomasSprite tired /></div></>}
          {frame === 3 && <div className="pain-messages"><span className="pain-micro">5 CONVERSATIONS. 1 PERSON CONNECTING THEM.</span>{providers.map((provider, index) => <div className="pain-message" key={provider.name} style={{ "--i": index } as React.CSSProperties}><span className="pain-message-icon">{provider.icon}</span><div><strong>{provider.name}</strong><p>{provider.message}</p></div><small>{index + 1}m</small></div>)}<div className="pain-message-bottom"><ThomasSprite tired /><span>Thomas is the project manager.<br /><strong>It’s his first day on the job.</strong></span></div></div>}
          {event && <><HouseWorld damaged compact /><div className="pain-event-window"><div className="pain-window-bar"><span><i /><i /><i /></span> LIFE_EVENT_{String(frame - 3).padStart(2, "0")}.EXE</div><div className="pain-event-content"><span className="pain-event-symbol" aria-hidden="true">{["↗", "€", "◷", "!"][frame - 4]}</span><span className="pain-micro">{frame === 7 ? "THOMAS’S LIFE CHANGED" : "NEW UPDATE RECEIVED"}</span><h2>{event.title}</h2><p>{eventDetail}</p><div className="pain-broken-list">{snapshot.checks.filter((check) => !check.ok).map((check) => <span key={check.key}>✕ {persona.outcome.constraints.find((def) => def.key === check.key)?.label}</span>)}</div><div className="pain-damage"><span>PROJECT HEALTH</span><strong>−{snapshots[eventIndex - 1].health - health} HP</strong></div></div></div><div className="pain-event-thought"><ThomasSprite tired /><span>{copy.thought}</span></div></>}
          {frame === 8 && <div className="pain-gameover"><span className="pain-micro">MONTH {run.plan.limits.finish} / CHECKPOINT MISSED</span><h2>PLAN<br /><span>OVERLOAD.</span></h2><div className="pain-final-score"><strong>{health}</strong><span>/ 100<br />PROJECT HEALTH</span></div><div className="pain-final-checks">{snapshot.checks.map((check) => <div key={check.key} className={check.ok ? "pain-check-ok" : ""}><span>{check.ok ? "✓" : "✕"} {persona.outcome.constraints.find((def) => def.key === check.key)?.label}</span><strong>{check.key === "finish" ? `M${check.value} / M${check.limit}` : `${money(check.value)} / ${money(check.limit)}`}</strong></div>)}</div><p>Simulation: the original plan is kept unchanged<br />through all four events.</p></div>}
        </div>
      </section>

      <footer className="pain-footer">
        <div className="pain-footer-top"><button className="pain-back" onClick={back} disabled={frame === 0} aria-label="Previous scene">←</button><span className="pain-keyboard">{String(frame + 1).padStart(2, "0")} <span>/ 10</span><small>← → TO PLAY</small></span><button className={`pain-next ${frame === 9 ? "pain-next-kate" : ""}`} onClick={forward}>{copy.action}<span aria-hidden="true">{frame === 9 ? "↻" : "→"}</span></button></div>
        <nav className="pain-chapters" aria-label="Story chapters">{CHAPTERS.map((label, index) => <button key={label} aria-current={chapter === index ? "step" : undefined} onClick={() => setFrame(frameFor(index + 1))} className={chapter === index ? "active" : chapter > index ? "complete" : ""}><span>{String(index + 1).padStart(2, "0")}</span><b>{label}</b><i /></button>)}</nav>
        <div className="pain-fineprint"><span>A fictional year. Real complexity. Illustrative figures.</span><span>KBC & its partners already offer support. This story explores a plan that isn’t adapted.</span></div>
      </footer>
    </main>
  );
}

function ReceiptLine({ label, amount }: { label: string; amount: number }) {
  return <div className="pain-receipt-line"><span>{label}</span><strong>{money(amount)}</strong></div>;
}
