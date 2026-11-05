import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { failIfError, requireQaEnvironment } from "./qa-guard";
import { QA_EVENT_SLUGS, qaEventDefinition } from "./qa-data";

async function main() {
  const admin = requireQaEnvironment();
  const { data: editions, error: editionError } = await admin
    .from("editions")
    .select("id,name")
    .ilike("name", "%Visual QA%")
    .limit(2);
  failIfError(editionError, "Find QA edition");

  if (editions?.length !== 1) {
    throw new Error(`Expected exactly one Visual QA edition, found ${editions?.length ?? 0}. Run qa:seed first.`);
  }

  const editionId = editions[0].id as string;
  const eventInputs = [];

  for (const [index, slug] of QA_EVENT_SLUGS.entries()) {
    const storagePath = `qa/event-posters/${slug}.webp`;
    const body = await readFile(join(process.cwd(), "public", "event-posters", `${slug}.webp`));
    const { error: uploadError } = await admin.storage
      .from("fest-media")
      .upload(storagePath, body, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
    failIfError(uploadError, `Upload QA poster ${slug}`);
    const { data: publicAsset } = admin.storage.from("fest-media").getPublicUrl(storagePath);

    eventInputs.push({
      edition_id: editionId,
      ...qaEventDefinition(slug, index),
      poster_url: publicAsset.publicUrl,
      application_opens_at: "2026-10-01T00:00:00+05:30",
      application_closes_at: "2026-11-30T23:59:00+05:30",
    });
  }

  const { data: synced, error: syncError } = await admin
    .from("events")
    .upsert(eventInputs, { onConflict: "edition_id,slug" })
    .select("id,slug,category,eligibility");
  failIfError(syncError, "Sync QA event catalogue");

  const syncedSlugs = new Set((synced ?? []).map((event: { slug: string }) => event.slug));
  const missing = QA_EVENT_SLUGS.filter((slug) => !syncedSlugs.has(slug));
  const sportsWithoutDiscipline = (synced ?? []).filter((event: {
    category: string;
    eligibility: { sub_category?: string } | null;
  }) => event.category === "sport" && !event.eligibility?.sub_category);

  if (missing.length || sportsWithoutDiscipline.length) {
    throw new Error(`QA event verification failed: ${missing.length} missing, ${sportsWithoutDiscipline.length} sports without discipline.`);
  }

  console.log(`QA event sync complete: ${synced?.length ?? 0} fictional events in project ${process.env.QA_PROJECT_REF}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
