// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { body, goalIdParam, handle, parse, stepBody, stepIdParam } from "@/backend/http";
import { stepActionFor } from "@/backend/service";

export async function POST(req: Request, ctx: RouteContext<"/api/goals/[id]/steps/[stepId]">) {
  return handle(async () => {
    const p = await ctx.params;
    const { action } = await body(req, stepBody);
    return stepActionFor(parse(goalIdParam, p.id), parse(stepIdParam, p.stepId), action, await serverDeps());
  }, { req, route: "steps" });
}
