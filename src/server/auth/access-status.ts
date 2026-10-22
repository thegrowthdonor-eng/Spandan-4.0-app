export type AccessState = "pending" | "active" | "rejected" | "suspended";

/** Shown only after the password has been authenticated. */
export function accessDeniedMessage(state: unknown): string {
  switch (state) {
    case "pending":
      return "Your profile is awaiting Treasurer verification. Sign-in will unlock after activation.";
    case "rejected":
      return "Your registration could not be activated. Please contact the festival registration desk for help.";
    case "suspended":
      return "Your festival access is currently suspended. Please contact the festival help desk for assistance.";
    default:
      return "Your festival access is unavailable. Please contact the festival help desk for assistance.";
  }
}
