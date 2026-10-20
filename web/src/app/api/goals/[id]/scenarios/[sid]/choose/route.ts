// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { goalIdParam, handle, parse, scenarioIdParam } from "@/backend/http";
import { chooseScenarioFor } from "@/backend/service";

/** The customer picks scenario A or B: new plan version, outcome recomputed. */
export async function POST(_req: Request, ctx: RouteContext<"/api/goals/[id]/scenarios/[sid]/choose">) {
  return handle(async () => {
    const p = await ctx.params;
    return chooseScenarioFor(parse(goalIdParam, p.id), parse(scenarioIdParam, p.sid), serverDeps());
  });
}
