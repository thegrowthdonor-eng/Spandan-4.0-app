import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  let str = String(val);
  // Sanitize formula injection triggers (=, +, -, @, \t, \r) for spreadsheet security (Doc 07 T18)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Export is currently unavailable." }, { status: 503, headers });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("event");

  if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return NextResponse.json({ error: "A valid event ID is required." }, { status: 400, headers });
  }

  const denied = NextResponse.json({ error: "Not authorised to export participants for this event." }, { status: 403, headers });
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)),
      },
    }
  );

  const authUser = (await client.auth.getUser()).data.user;
  if (!authUser) return denied;

  // Fetch participant export via security-definer audited RPC
  const { data, error } = await client.rpc("export_event_participants", { p_event_id: eventId });

  if (error) {
    if (error.code === "42501" || error.code === "28000") return denied;
    return NextResponse.json({ error: "Unable to export participants right now." }, { status: 500, headers });
  }

  const rows = (data ?? []) as Array<{
    fest_id: string;
    full_name: string;
    batch_label: string;
    course_label: string | null;
    roll_canonical: string;
    review_state: string;
    selection_state: string;
    group_name: string | null;
    captain: boolean | null;
    submitted_at: string;
  }>;

  // Build CSV
  const headerCols = [
    "Fest ID",
    "Full Name",
    "Batch",
    "Course",
    "Roll Number",
    "Review State",
    "Selection State",
    "Group Name",
    "Captain",
    "Submitted At (IST)",
  ];

  const csvRows = [headerCols.join(",")];

  for (const row of rows) {
    const istTime = row.submitted_at
      ? new Intl.DateTimeFormat("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Asia/Kolkata",
        }).format(new Date(row.submitted_at))
      : "";

    const line = [
      escapeCsvCell(row.fest_id),
      escapeCsvCell(row.full_name),
      escapeCsvCell(row.batch_label),
      escapeCsvCell(row.course_label ?? ""),
      escapeCsvCell(row.roll_canonical),
      escapeCsvCell(row.review_state),
      escapeCsvCell(row.selection_state),
      escapeCsvCell(row.group_name ?? "Solo / None"),
      escapeCsvCell(row.captain ? "Yes" : "No"),
      escapeCsvCell(istTime),
    ].join(",");

    csvRows.push(line);
  }

  const csvContent = "\uFEFF" + csvRows.join("\r\n"); // UTF-8 BOM for Excel compatibility

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="spandan-participants-${eventId.slice(0, 8)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
