// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { serverDeps } from "@/backend/data/server";
import { body, goalBody, handle } from "@/backend/http";
import { createGoalFor } from "@/backend/service";

/** Kate's "yes" + the set-up answers → goal + plan + outcome. */
export async function POST(req: Request) {
  return handle(async () => {
    const { slug, ...input } = await body(req, goalBody);
    return createGoalFor(slug, input, serverDeps());
  });
}
