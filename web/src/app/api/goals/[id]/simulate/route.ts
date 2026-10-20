// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { body, goalIdParam, handle, parse, whatIfBody } from "@/backend/http";
import { simulateFor } from "@/backend/service";

/** What-if: scenarios for a changed budget, income, term, rate or deadline. Nothing is saved. */
export async function POST(req: Request, ctx: RouteContext<"/api/goals/[id]/simulate">) {
  return handle(async () => ({ scenarios: await simulateFor(parse(goalIdParam, (await ctx.params).id), await body(req, whatIfBody), serverDeps()) }));
}
