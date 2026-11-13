import { notFound } from "next/navigation";
import { z } from "zod";
import { PublicCompetitionClient } from "./competition-client";
import { cookies } from "next/headers";
import { createRequestClient } from "@/server/supabase/server";

export const metadata = { title:"Competition | Spandan 4.0" };
export default async function CompetitionPage({params}:{params:Promise<{eventId:string}>}) {
  const {eventId} = await params;
  if (!z.string().uuid().safeParse(eventId).success) notFound();
  let canSubmit = true;
  if ((await cookies()).getAll().some(cookie => cookie.name.startsWith("sb-"))) {
    const client = await createRequestClient();
    const { data: auth } = await client.auth.getUser();
    if (auth.user) {
      const profile = await client.from("profiles").select("participant_category").eq("id", auth.user.id).single();
      canSubmit = !profile.error && profile.data?.participant_category === "ug";
    }
  }
  return <PublicCompetitionClient eventId={eventId} canSubmit={canSubmit} />;
}
