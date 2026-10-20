// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { handle, parse, slugParam } from "@/backend/http";
import { resetFor } from "@/backend/service";

/** Demo: wipe this persona's goals, plans, consents, feedback and injected events. */
export async function POST(_req: Request, ctx: RouteContext<"/api/customers/[slug]/reset">) {
  return handle(async () => {
    await resetFor(parse(slugParam, (await ctx.params).slug), serverDeps());
    return { ok: true };
  });
}
