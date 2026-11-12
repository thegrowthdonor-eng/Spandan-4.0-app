import { eventMethod, type OperatingMethod } from "./event-operations";
export type WorkspaceEvent = { id: string; title: string; category: string; format: string; state: string; pending?: number; operating_method?: OperatingMethod; registration_enabled?: boolean };
export type ManagementSummary = {
  isAdmin: boolean; canVerify: boolean; canCreate: boolean; canNotice: boolean;
  canGallery: boolean; canLive: boolean; canHelp: boolean; roles: string[];
  events: WorkspaceEvent[]; editableEvents: WorkspaceEvent[]; pendingVerification: number | null;
};
function mergeUniqueEvents(primary: WorkspaceEvent[], extra: WorkspaceEvent[]) {
  const byId = new Map<string, WorkspaceEvent>();
  for (const event of primary) byId.set(event.id, event);
  for (const event of extra) if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}
export function competitionEventsFromSummary(s: ManagementSummary) {
  return mergeUniqueEvents(s.events, s.editableEvents.filter(event => event.registration_enabled === false));
}
export function adminEventsFromSummary(s: ManagementSummary) {
  return mergeUniqueEvents(s.editableEvents, s.events);
}
export function managementLinks(s: ManagementSummary) {
  return [
    { href: "/admin", label: "Overview", show: true },
    { href: "/admin/events", label: "Events", show: s.canCreate },
    { href: "/admin/review", label: "Participants", show: s.events.length > 0 },
    { href: "/admin/groups", label: "Pairs, groups & teams", show: s.events.some(e => ["pair","group","sport"].includes(e.format)) },
    { href: "/admin/scoring", label: "Live scoring", show: s.events.some(e => eventMethod(e) === "live_matches") },
    { href: "/admin/fixtures", label: "Competition & Schedule", show: s.events.length > 0 },
    { href: "/admin/results", label: "Results", show: s.events.some(e => eventMethod(e) !== "programme") },
    { href: "/admin/activation", label: "Student verification", show: s.canVerify },
    { href: "/admin/live", label: "Live desk", show: s.canLive },
    { href: "/admin/notices", label: "Notices", show: s.canNotice },
    { href: "/admin/gallery", label: "Gallery", show: s.canGallery },
    { href: "/admin/help", label: "Helpdesk", show: s.canHelp },
    { href: "/admin/merchandise", label: "Merchandise", show: s.isAdmin },
    { href: "/admin/sponsors", label: "Sponsors & Partners", show: s.isAdmin },
    { href: "/admin/control", label: "Administration", show: s.isAdmin },
  ].filter(link => link.show);
}
export function canEnterManagement(s: ManagementSummary) {
  return managementLinks(s).length > 1;
}
