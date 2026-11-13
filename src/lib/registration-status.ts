type RegistrationEvent = {
  state: string;
  registration_enabled: boolean;
  application_opens_at: string | null;
  application_closes_at: string | null;
};

export function registrationStatus(event: RegistrationEvent, now = new Date()) {
  if (event.state === "cancelled") return "cancelled";
  if (event.state === "completed") return "completed";
  if (!event.registration_enabled) return "information";
  if (event.state === "closed") return "closed";
  const opens = event.application_opens_at ? Date.parse(event.application_opens_at) : NaN;
  const closes = event.application_closes_at ? Date.parse(event.application_closes_at) : NaN;
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens) return "unavailable";
  if (now.getTime() >= closes) return "closed";
  if (["open", "published"].includes(event.state) && now.getTime() < opens) return "scheduled";
  return event.state === "open" ? "open" : "unavailable";
}

export function registrationTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) + " IST" : "Not scheduled";
}

const registrationErrors = {
  scheduled: { status: 409, error: "Registration has not opened yet. Check the opening date shown on this event." },
  closed: { status: 409, error: "Registration is closed for this event." },
  unavailable: { status: 409, error: "This event is not accepting registrations." },
  access_inactive: { status: 403, error: "Your festival account must be active before you register. Check verification in My Fest." },
  gender_mismatch: { status: 403, error: "This event is outside your registered gender division." },
  invalid_answers: { status: 400, error: "Complete the required event questions using the listed choices." },
  capacity_full: { status: 409, error: "This individual event has reached its application capacity." },
  profile_unavailable: { status: 503, error: "Unable to load your registration profile. Refresh and try again." },
} as const;

export function registrationError(details?: string | null) {
  if (!details || !Object.hasOwn(registrationErrors, details)) return null;
  const reason = details as keyof typeof registrationErrors;
  return { ...registrationErrors[reason], reason };
}

export function applicationStatus(review: string, selection: string, grouped: boolean, proposed = false) {
  if (review === "withdrawn") return "Withdrawn";
  if (review === "rejected") return "Registration declined";
  if (review === "waitlisted") return "Waitlisted";
  if (review !== "approved") return "Registration under review";
  if (["selected", "confirmed"].includes(selection)) return grouped ? "Selected · final roster" : "Selected";
  if (selection === "not_selected") return grouped ? "Approved · not selected in final roster" : "Approved · not selected";
  if (proposed) return "Approved · proposed for roster";
  return grouped ? "Approved · awaiting team selection" : "Registration approved";
}
