export type ResultPosition = {
  placing: number;
  batch_id: string | null;
  batch_label: string | null;
  winner_name: string | null;
  winner_roll: string | null;
  participant_category: string | null;
  application_id: string | null;
  group_id: string | null;
  points: number;
  note: string | null;
};

export type PublishedEventResult = {
  event_id: string;
  event_title: string;
  event_slug: string;
  category: string;
  published_at: string | null;
  podium_photo_url: string | null;
  podium_caption: string | null;
  positions: ResultPosition[];
};

export type Standing = {
  batch_id: string;
  label: string;
  course_label: string | null;
  points: number;
};

export type StandingWithFinishes = Standing & {
  finishes: Array<ResultPosition & Pick<PublishedEventResult, "event_id" | "event_title" | "event_slug">>;
};

export function batchName(label: string | null) {
  if (!label) return "Batch";
  return /^MBBS\s/i.test(label) ? label : `Batch ${label}`;
}

export function resultIdentity(position: ResultPosition) {
  const batch = batchName(position.batch_label);
  if (position.group_id) return { primary: position.winner_name || batch, secondary: batch };
  if (position.application_id) {
    return {
      primary: position.winner_name || "Winner",
      secondary: position.participant_category === "ug"
        ? [position.winner_roll && `Roll No. ${position.winner_roll}`, batch].filter(Boolean).join(" · ")
        : position.participant_category?.toUpperCase() || "Participant",
    };
  }
  return { primary: position.winner_name || batch, secondary: batch };
}

export function placingLabel(placing: number) {
  if (placing === 1) return "🥇 1st Place";
  if (placing === 2) return "🥈 2nd Place";
  if (placing === 3) return "🥉 3rd Place";
  return `#${placing}`;
}

export function groupStandings(standings: Standing[], results: PublishedEventResult[]): StandingWithFinishes[] {
  return standings.map((standing) => ({
    ...standing,
    finishes: results.flatMap((result) => result.positions
      .filter((position) => position.batch_id === standing.batch_id)
      .map((position) => ({
        ...position,
        event_id: result.event_id,
        event_title: result.event_title,
        event_slug: result.event_slug,
      }))),
  }));
}
