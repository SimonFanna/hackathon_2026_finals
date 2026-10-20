// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { body, eventsBody, handle, parse, slugParam } from "@/backend/http";
import { injectFor } from "@/backend/service";

/** Demo: inject a preset (income_drop, cost_overrun, partner_delay) or a raw event. */
export async function POST(req: Request, ctx: RouteContext<"/api/customers/[slug]/events">) {
  return handle(async () => {
    const slug = parse(slugParam, (await ctx.params).slug);
    return { injected: await injectFor(slug, await body(req, eventsBody), serverDeps()) };
  });
}
