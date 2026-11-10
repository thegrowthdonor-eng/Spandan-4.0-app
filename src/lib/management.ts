export type WorkspaceEvent = { id: string; title: string; category: string; format: string; state: string; pending?: number };
export type ManagementSummary = {
  isAdmin: boolean; canVerify: boolean; canCreate: boolean; canNotice: boolean;
  canGallery: boolean; canLive: boolean; canHelp: boolean; roles: string[];
  events: WorkspaceEvent[]; editableEvents: WorkspaceEvent[]; pendingVerification: number | null;
};
export function managementLinks(s: ManagementSummary) {
  return [
    { href: "/admin", label: "Overview", show: true },
    { href: "/admin/events", label: "Events", show: s.canCreate },
    { href: "/admin/review", label: "Participants", show: s.events.length > 0 },
    { href: "/admin/groups", label: "Pairs, groups & teams", show: s.events.some(e => ["pair","group","sport"].includes(e.format)) },
    { href: "/admin/scoring", label: "Score matches", show: s.events.length > 0 },
    { href: "/admin/fixtures", label: "Fixtures & scores", show: s.events.length > 0 },
    { href: "/admin/results", label: "Results", show: s.events.length > 0 },
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
