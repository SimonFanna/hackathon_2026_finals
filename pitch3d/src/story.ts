// Pure: turns the Supabase snapshot (src/data/lucas.json) into the story the scene tells.
// Every label and provider comes from the rows; only the step order and city coordinates are ours.

export interface Snapshot {
  snapshotAt: string;
  customer: { first_name: string; birth_date: string; city: string };
  employment: { status: string; sector: string; employer_name: string | null; monthly_net_income_eur: number }[];
  events: { id: number; occurred_at: string; event_type: string; ecosystem_item_id: number | null; detail: Record<string, unknown> }[];
  ecosystemItems: { id: number; name: string; ecosystem_id: number; partner_id: number | null }[];
  ecosystems: { id: number; name: string }[];
  partners: { id: number; name: string }[];
  cityCounts: { city: string; region: string; customers: number }[];
}

export interface Signal { itemId: number; label: string; count: number; lastAt: string }
export interface Step {
  id: "startit" | "account" | "invoicing" | "protection" | "collections" | "capital";
  title: string;
  items: string[];
  provider: string;
  isPartner: boolean;
  /** Only partner steps carry a consent decision; KBC steps keep data inside KBC. */
  consent: "shared" | "declined" | "kbc";
  products: number;
}
export interface District { id: "home" | "mobility" | "pension"; label: string; items: string[]; views: number }
export interface CityLight { city: string; lat: number; lon: number; customers: number }
export interface Story {
  hero: { firstName: string; age: number; city: string; sector: string; employer: string; monthlyNetIncomeEur: number };
  signals: Signal[];
  kateQuestions: string[];
  steps: Step[];
  districts: District[];
  cityLights: CityLight[];
  tally: { stepsDone: number; kbcProducts: number; partnerLeads: number; partnersDeclined: number };
}

const ENTREPRENEUR_ECOSYSTEMS = new Set(["Business", "Business protection", "Work and employees"]);
const BUSINESS_QUESTION = /business|invoice|vat|freelanc|self-employed|company/i;

// Journey order (ours) over catalogue items (theirs). Item ids are public.ecosystem_items ids.
const STEP_PLAN: { id: Step["id"]; title: string; itemIds: number[]; consent?: "shared" | "declined" }[] = [
  { id: "startit", title: "Get coached by Start it @KBC", itemIds: [153] },
  { id: "account", title: "Open a business account", itemIds: [128] },
  { id: "invoicing", title: "Send invoices from day one", itemIds: [2], consent: "shared" },
  { id: "protection", title: "Protect your income and your work", itemIds: [73, 66] },
  { id: "collections", title: "Collect unpaid invoices", itemIds: [12], consent: "declined" },
  { id: "capital", title: "Plan your working capital", itemIds: [162] },
];

const DISTRICT_PLAN: { id: District["id"]; label: string; itemIds: number[] }[] = [
  { id: "home", label: "Home", itemIds: [223, 213] },
  { id: "mobility", label: "Mobility", itemIds: [194, 205] },
  { id: "pension", label: "Pension", itemIds: [184] },
];

// Approximate city centres (WGS84).
const CITY_COORDS: Record<string, [number, number]> = {
  Antwerpen: [51.219, 4.402], Gent: [51.054, 3.717], Leuven: [50.879, 4.701], Mechelen: [51.026, 4.478],
  Hasselt: [50.931, 5.338], Brugge: [51.209, 3.225], Aalst: [50.938, 4.04], Kortrijk: [50.827, 3.265],
  Brussel: [50.847, 4.357], Genk: [50.965, 5.5], Roeselare: [50.946, 3.123], "Sint-Niklaas": [51.165, 4.143],
  Turnhout: [51.322, 4.945], Ixelles: [50.833, 4.367], Namur: [50.467, 4.867], Lier: [51.131, 4.57],
  Schaerbeek: [50.867, 4.377], Dendermonde: [51.028, 4.101], "Liège": [50.633, 5.567], Charleroi: [50.411, 4.444],
  Mons: [50.454, 3.952], Wavre: [50.717, 4.611], Ieper: [50.851, 2.886],
};

function ageOn(birth: string, today: string): number {
  const [by, bm, bd] = birth.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function buildStory(s: Snapshot): Story {
  const item = new Map(s.ecosystemItems.map((i) => [i.id, i]));
  const ecosystem = new Map(s.ecosystems.map((e) => [e.id, e.name]));
  const partner = new Map(s.partners.map((p) => [p.id, p.name]));
  const job = s.employment[0];

  const views = new Map<number, { count: number; lastAt: string }>();
  for (const e of s.events) {
    if (e.event_type !== "page_view" || e.ecosystem_item_id == null) continue;
    const v = views.get(e.ecosystem_item_id) ?? { count: 0, lastAt: e.occurred_at };
    v.count += 1;
    if (e.occurred_at > v.lastAt) v.lastAt = e.occurred_at;
    views.set(e.ecosystem_item_id, v);
  }

  const signals: Signal[] = [...views.entries()]
    .filter(([id]) => ENTREPRENEUR_ECOSYSTEMS.has(ecosystem.get(item.get(id)?.ecosystem_id ?? -1) ?? ""))
    .map(([id, v]) => ({ itemId: id, label: `Viewed ${item.get(id)!.name}`, count: v.count, lastAt: v.lastAt }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const kateQuestions = s.events
    .filter((e) => e.event_type === "kate_question")
    .map((e) => String(e.detail.question ?? ""))
    .filter((q) => BUSINESS_QUESTION.test(q));

  const steps: Step[] = STEP_PLAN.map((p) => {
    const its = p.itemIds.map((id) => item.get(id)).filter((i): i is NonNullable<typeof i> => !!i);
    const partnerId = its.find((i) => i.partner_id != null)?.partner_id ?? null;
    const isPartner = partnerId != null;
    return {
      id: p.id,
      title: p.title,
      items: its.map((i) => i.name),
      provider: isPartner ? partner.get(partnerId)! : "KBC",
      isPartner,
      consent: isPartner ? (p.consent ?? "shared") : "kbc",
      products: isPartner ? 0 : its.length,
    };
  });

  const districts: District[] = DISTRICT_PLAN.map((d) => ({
    id: d.id,
    label: d.label,
    items: d.itemIds.map((id) => item.get(id)?.name ?? "").filter(Boolean),
    views: d.itemIds.reduce((a, id) => a + (views.get(id)?.count ?? 0), 0),
  })).filter((d) => d.views > 0);

  const cityLights: CityLight[] = s.cityCounts
    .filter((c) => CITY_COORDS[c.city])
    .map((c) => ({ city: c.city, lat: CITY_COORDS[c.city][0], lon: CITY_COORDS[c.city][1], customers: c.customers }));

  const done = steps.filter((st) => st.consent !== "declined");
  return {
    hero: {
      firstName: s.customer.first_name,
      age: ageOn(s.customer.birth_date, s.snapshotAt),
      city: s.customer.city,
      sector: job?.sector ?? "",
      employer: job?.employer_name ?? "",
      monthlyNetIncomeEur: job?.monthly_net_income_eur ?? 0,
    },
    signals,
    kateQuestions,
    steps,
    districts,
    cityLights,
    tally: {
      stepsDone: done.length,
      kbcProducts: done.reduce((a, st) => a + st.products, 0),
      partnerLeads: steps.filter((st) => st.consent === "shared").length,
      partnersDeclined: steps.filter((st) => st.consent === "declined").length,
    },
  };
}
