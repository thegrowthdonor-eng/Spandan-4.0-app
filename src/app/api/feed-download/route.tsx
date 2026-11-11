import { ImageResponse } from "next/og";
import { feedDownloadFilename, latestResults } from "@/lib/feed";
import { getPublishedResults } from "@/lib/published-results";
import type { Standing } from "@/lib/results";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { mediaUrls } from "@/server/media/urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function attachment(filename: string, contentType: string) {
  return { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" };
}

function png(filename: string, label: string, title: string, lines: string[]) {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: "#fffaf2", color: "#261923", padding: "72px" }}>
      <div style={{ display: "flex", color: "#a45345", fontSize: 24, letterSpacing: 3 }}>{label.toUpperCase()}</div>
      <div style={{ display: "flex", marginTop: 28, fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>{title.slice(0, 100)}</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 42, borderTop: "2px solid #d7c8b4", paddingTop: 26, gap: 16 }}>
        {lines.slice(0, 6).map((line, index) => <div key={`${index}-${line}`} style={{ display: "flex", fontSize: index === 0 ? 34 : 28, color: index === 0 ? "#261923" : "#66535d" }}>{line.slice(0, 130)}</div>)}
      </div>
      <div style={{ display: "flex", marginTop: "auto", color: "#735c35", fontSize: 22, letterSpacing: 2 }}>SPANDAN 4.0 · ASMC FIROZABAD</div>
    </div>,
    { width: 1080, height: 1350, headers: attachment(filename, "image/png") },
  );
}

export async function GET(request: Request) {
  if (!hasPublicSupabaseConfiguration()) return new Response("Downloads are unavailable.", { status: 503 });
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id") ?? "";
  if (!type || !["result", "standings", "moment", "notice"].includes(type) || (type !== "standings" && !uuidPattern.test(id))) return new Response("Invalid download.", { status: 400 });

  const client = createPublicClient();
  if (type === "moment") {
    const { data, error } = await client.rpc("get_published_gallery_moments");
    const moment = !error && Array.isArray(data) ? data.find((item) => (item as { id?: string }).id === id) as { storage_path: string } | undefined : undefined;
    if (!moment?.storage_path.startsWith("gallery/")) return new Response("Moment not found.", { status: 404 });
    const source = (await mediaUrls([moment.storage_path]))(moment.storage_path);
    const file = await fetch(source);
    if (!file.ok || !file.body) return new Response("Photo unavailable.", { status: 404 });
    return new Response(file.body, { headers: attachment(feedDownloadFilename("moment", id), "image/webp") });
  }

  if (type === "notice") {
    const { data, error } = await client.from("notices").select("id,title,body,urgency,events(title)").eq("id", id).maybeSingle();
    if (error || !data) return new Response("Notice not found.", { status: 404 });
    const eventTitle = (data.events as { title?: string } | null)?.title;
    return png(feedDownloadFilename("notice", id), `${data.urgency} notice`, data.title, [eventTitle ?? "Official festival update", data.body]);
  }

  const results = latestResults(await getPublishedResults(client));
  if (type === "result") {
    const result = results.find((item) => item.event_id === id);
    if (!result) return new Response("Result not found.", { status: 404 });
    const lines = result.positions.map((position) => {
      const medal = position.placing === 1 ? "1st" : position.placing === 2 ? "2nd" : position.placing === 3 ? "3rd" : `#${position.placing}`;
      const identity = position.winner_name ?? position.batch_label ?? "Winner";
      return `${medal} · ${identity}${position.winner_roll ? ` · Roll No. ${position.winner_roll}` : ""}${position.batch_label ? ` · ${position.batch_label}` : ""}`;
    });
    return png(feedDownloadFilename("result", id), "Official result", result.event_title, lines.length ? lines : ["Official festival result"]);
  }

  const { data, error } = await client.from("published_batch_standing_board").select("batch_id,label,course_label,points").order("points", { ascending: false }).order("label");
  if (error || !data || !results.length) return new Response("Standings unavailable.", { status: 404 });
  const rows = data as Standing[];
  return png(feedDownloadFilename("standings", "current"), "Batch championship", "Current batch standings", rows.slice(0, 6).map((standing, index) => `#${index + 1} · ${standing.label} · ${standing.points} pts`));
}
