import { fixtureCommandSchema, fixtureCreateSchema } from "@/server/auth/contracts";

export type FixtureCommand =
  | { action: "create"; eventId: string; stage: string; participantALabel: string; participantBLabel: string; venue?: string; reportingAt: string | null; startsAt: string | null }
  | { action: "reschedule"; fixtureId: string; reportingAt: string | null; startsAt: string | null; venue?: string; reason: string }
  | { action: "score"; fixtureId: string; expectedVersion: number; scorePayload: Record<string, unknown>; status: "scheduled" | "live" | "paused" | "final" | "cancelled" }
  | { action: "reminders"; fixtureId: string; body?: string };

export type FixturePayloadResult =
  | { success: true; command: FixtureCommand }
  | { success: false; error: string };

/**
 * Parse both the current command envelope and the legacy fixture-create body.
 * JSON `null`, arrays, and primitives are valid JSON values but never valid
 * fixture requests.
 */
export function parseFixturePayload(body: unknown): FixturePayloadResult {
  const isCommand = typeof body === "object" && body !== null && "action" in body;
  if (isCommand) {
    const parsed = fixtureCommandSchema.safeParse(body);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid fixture command." };
    }
    return { success: true, command: parsed.data };
  }

  const parsed = fixtureCreateSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid fixture creation details." };
  }
  return { success: true, command: { action: "create", ...parsed.data } };
}
