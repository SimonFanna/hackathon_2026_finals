// T7 API — see backend/T7-data-pipeline-api.md. Input validated with zod (src/backend/http.ts).
import { snapshotFacts } from "@/backend/data/snapshot";
import { DEMO_SLUGS, PERSONA_SUMMARY } from "@/backend/data/personas";

/** The demo personas for the picker (static: prerendered at build time). */
export async function GET() {
  return Response.json(
    DEMO_SLUGS.map((slug) => ({ slug, firstName: snapshotFacts(slug).customer.firstName, summary: PERSONA_SUMMARY[slug] })),
  );
}
