import { describe, expect, it } from "vitest";
import { personas, type Journey } from "../../engine";
import { buildStepAlias, withLocalAliases } from "./stepAlias";

const local = personas.find((p) => p.id === "house")!.journey;
// A backend-shaped journey: other ids and chapters, same catalogue items (one renamed, one unknown).
const actual: Journey = {
  ...local,
  steps: [
    ...local.steps.map((s, i) => ({ ...s, id: `be-${i + 1}`, catalogueItem: i === 0 ? "" : s.catalogueItem })),
    { ...local.steps[0], id: "be-x", title: "Something new", catalogueItem: "Not in the local plan" },
  ],
};

describe("step aliases between a backend journey and the local one", () => {
  it("matches steps by catalogue item, then by title", () => {
    const a = buildStepAlias(local, actual);
    expect(a.toLocal.get("be-4")).toBe("home-loan");
    expect(a.toLocal.get("be-1")).toBe("search"); // falls back to the title
    expect(a.toLocal.get("be-x")).toBeUndefined();
    expect(a.toActual.get("heating")).toBe(`be-${local.steps.findIndex((s) => s.id === "heating") + 1}`);
  });
  it("is empty for the local journey itself", () => {
    const a = buildStepAlias(local, local);
    expect(a.toLocal.size).toBe(0);
  });
  it("adds the local aliases so requiresStep resolves", () => {
    const a = buildStepAlias(local, actual);
    const set = withLocalAliases(["be-4", "be-x"], a);
    expect(set.has("home-loan")).toBe(true);
    expect(set.has("be-4")).toBe(true);
    expect(set.has("be-x")).toBe(true);
  });
  it("treats local steps the journey never offered as not skipped", () => {
    const a = buildStepAlias(local, { ...actual, steps: actual.steps.slice(0, 3) });
    expect(a.unoffered.has("home-loan")).toBe(true);
    expect(withLocalAliases([], a).has("home-loan")).toBe(true);
    expect(withLocalAliases([], a).has("search")).toBe(false);
  });
});
