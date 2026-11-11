import { notFound } from "next/navigation";
import { z } from "zod";
import { PublicCompetitionClient } from "./competition-client";

export const metadata = { title:"Competition | Spandan 4.0" };
export default async function CompetitionPage({params}:{params:Promise<{eventId:string}>}) {
  const {eventId} = await params;
  if (!z.string().uuid().safeParse(eventId).success) notFound();
  return <PublicCompetitionClient eventId={eventId} />;
}
