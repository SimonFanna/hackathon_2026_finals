// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { handle, parse, slugParam } from "@/backend/http";
import { runPipeline } from "@/backend/pipeline";

export async function GET(_req: Request, ctx: RouteContext<"/api/customers/[slug]/pipeline">) {
  return handle(async () => runPipeline(parse(slugParam, (await ctx.params).slug), serverDeps()));
}
