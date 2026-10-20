// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { body, consentBody, goalIdParam, handle, parse } from "@/backend/http";
import { consentFor } from "@/backend/service";

/** Grant or revoke one field for one partner on one step. */
export async function POST(req: Request, ctx: RouteContext<"/api/goals/[id]/consents">) {
  return handle(async () => consentFor(parse(goalIdParam, (await ctx.params).id), await body(req, consentBody), await serverDeps()), { req, route: "consents" });
}
