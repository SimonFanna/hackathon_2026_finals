import type { Story } from "../story";

// HTML layer over the canvas: one caption per beat, a beat-specific panel, progress, quality badge.
// Copy is in English; every figure is either a count from the data or labelled as a demo count.

export interface Overlay {
  root: HTMLElement;
  setBeat(beat: number): void;
  /** Live values from the director (build steps, finale phase). */
  tick(levels: { build: number; consent: number; districts: number; realLights: number; field: number }): void;
  setQuality(label: string | null): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function buildOverlay(story: Story, beatCount: number): Overlay {
  const { hero } = story;
  const root = el("div", "overlay");
  const caption = el("section", "caption");
  const title = el("h1", "caption-title");
  const body = el("div", "caption-body");
  caption.append(title, body);
  const panel = el("aside", "panel");
  const foot = el("footer", "foot");
  const dots = el("ol", "dots");
  for (let i = 0; i < beatCount; i++) dots.append(el("li"));
  const keys = el("p", "keys", "→ next · ← back · R restart · Q quality");
  const badge = el("p", "badge");
  badge.hidden = true;
  foot.append(dots, keys);
  root.append(caption, panel, foot, badge);

  const p = (text: string, cls = "line") => el("p", cls, text);
  const note = (text: string) => el("p", "note", text);

  const steps = story.steps.map((s) => {
    const li = el("li", `step ${s.isPartner ? "partner" : "kbc"}`);
    const mark = el("span", "mark");
    const txt = el("span", "step-text");
    txt.append(el("b", "", s.title), el("span", "step-meta", `${s.provider}${s.isPartner ? " · partner" : ""} · ${s.items.join(" + ")}`));
    const state = el("span", "step-state");
    li.append(mark, txt, state);
    return { li, state, s };
  });

  const counters = [
    { who: hero.firstName, value: story.tally.stepsDone, unit: "steps done in one flow" },
    { who: "KBC", value: story.tally.kbcProducts, unit: "products activated" },
    { who: "Partners", value: story.tally.partnerLeads, unit: `consented lead · ${story.tally.partnersDeclined} declined` },
  ].map((c) => {
    const box = el("div", "counter");
    const num = el("span", "counter-num", "0");
    box.append(el("span", "counter-who", c.who), num, el("span", "counter-unit", c.unit));
    return { box, num, target: c.value };
  });

  const beats: (() => { title: string; body: HTMLElement[]; panel: HTMLElement[] })[] = [
    () => ({
      title: `${hero.firstName}, ${hero.age} · ${hero.city}`,
      body: [p(`${hero.sector} employee at ${hero.employer}.`), p("Lately, he's been thinking of going solo.")],
      panel: [note("A synthetic customer from our Supabase bank: every label in this scene comes from his rows.")],
    }),
    () => ({
      title: "KBC already sees the signals",
      body: [p("Not his browser history. Only what he does in KBC Mobile, KBC Touch and Kate.")],
      panel: [
        listOf(story.signals.slice(0, 6).map((s) => `${s.label} ×${s.count}`), "signals"),
        ...story.kateQuestions.map((q) => el("blockquote", "kate-q", `“${q}”`)),
        note("From 137 app events, April to September 2026."),
      ],
    }),
    () => ({
      title: "Kate asks before assuming",
      body: [kateBubble("Thinking of starting your own business? I can help you plan it, step by step."), el("p", "answer", "Yes, let's plan it")],
      panel: [zones(), note("Below the ask level, Kate stays silent. The confidence model belongs to our DB + ML team.")],
    }),
    () => ({
      title: "His business, built step by step",
      body: [p("Each step he accepts builds his studio. KBC and partners, in the right order.")],
      panel: [listEl(steps.map((x) => x.li), "steps")],
    }),
    () => ({
      title: "Consent is light",
      body: [p("He shares his invoicing details with Billit: the beam lights the partner up."), p("He says no to Go Solid. No data, no lead: it stays dark.")],
      panel: [listEl(steps.map((x) => x.li), "steps")],
    }),
    () => ({
      title: "One goal leads to the next",
      body: [p("New districts light up around him, from what he already looks at.")],
      panel: [listOf(story.districts.map((d) => `${d.label}: viewed ${d.items.join(", ")}`), "districts"), note("Kate will ask again when the time is right.")],
    }),
    () => ({
      title: "Same engine, every customer",
      body: [el("p", "line phase-a", "2,000 lights: every customer of our synthetic bank, on their own city."), el("p", "line phase-b", "One loop for everyone: signal, ask, plan, consent, outcome.")],
      panel: [el("div", "counters"), note("Demo counts from Lucas's journey, not forecasts."), note("Kate already serves 5.8M digital customers (KBC newsroom, Nov 2025).")],
    }),
  ];

  function listOf(items: string[], cls: string) {
    const ul = el("ul", cls);
    items.forEach((t) => ul.append(el("li", "", t)));
    return ul;
  }
  function listEl(items: HTMLElement[], cls: string) {
    const ul = el("ul", cls);
    ul.append(...items);
    return ul;
  }
  function kateBubble(text: string) {
    const b = el("div", "kate");
    b.append(el("span", "kate-dot"), el("p", "kate-text", text));
    return b;
  }
  function zones() {
    const z = el("div", "zones");
    for (const [label, on] of [["No action", false], ["Ask", true], ["Suggest", false]] as const) z.append(el("span", on ? "zone on" : "zone", label));
    return z;
  }

  let current = -1;
  let counterStart = 0;
  return {
    root,
    setBeat(beat) {
      if (beat === current) return;
      current = beat;
      document.body.dataset.beat = String(beat);
      const b = beats[beat]();
      caption.classList.remove("show");
      panel.classList.remove("show");
      requestAnimationFrame(() => {
        title.textContent = b.title;
        body.replaceChildren(...b.body);
        panel.replaceChildren(...b.panel);
        if (beat === 6) {
          panel.querySelector(".counters")!.append(...counters.map((c) => c.box));
          counterStart = performance.now();
        }
        caption.classList.add("show");
        panel.classList.add("show");
      });
      [...dots.children].forEach((d, i) => d.classList.toggle("on", i <= beat));
    },
    tick(l) {
      steps.forEach(({ li, state, s }, i) => {
        const done = l.build >= i + 1;
        let label = done ? "done" : "";
        if (s.consent === "shared") label = l.consent > 0.5 ? "shared · lit" : done ? "asks consent" : "";
        if (s.consent === "declined") label = l.consent > 0.5 ? "declined · dark" : done ? "asks consent" : "";
        state.textContent = label;
        li.classList.toggle("done", done && s.consent !== "declined");
        li.classList.toggle("declined", s.consent === "declined" && l.consent > 0.5);
      });
      document.body.classList.toggle("phase-b", l.field > 0.15);
      if (current === 6) {
        const k = Math.min(1, Math.max(0, (performance.now() - counterStart - 2400) / 1600));
        counters.forEach((c) => (c.num.textContent = String(Math.round(c.target * k))));
      }
    },
    setQuality(label) {
      badge.hidden = !label;
      badge.textContent = label ?? "";
    },
  };
}
