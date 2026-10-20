// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { goalIdParam, handle, parse } from "@/backend/http";
import { getOutcome } from "@/backend/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/goals/[id]/outcome">) {
  return handle(async () => getOutcome(parse(goalIdParam, (await ctx.params).id), serverDeps()));
}
