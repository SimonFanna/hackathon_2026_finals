// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { body, feedbackBody, handle, parse, slugParam } from "@/backend/http";
import { feedbackFor } from "@/backend/service";

/** Kate replies: "no" / "not_now" change what the next pipeline run says. */
export async function POST(req: Request, ctx: RouteContext<"/api/customers/[slug]/feedback">) {
  return handle(async () => {
    const slug = parse(slugParam, (await ctx.params).slug);
    return { feedback: await feedbackFor(slug, await body(req, feedbackBody), await serverDeps()) };
  }, { req, route: "feedback" });
}
