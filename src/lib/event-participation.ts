export function participationTools(format: string | undefined) {
  if (format === "solo") return { href: "/admin/selection", label: "Roster", noun: "participants", leader: null };
  if (format === "pair") return { href: "/admin/groups", label: "Pairs", noun: "pairs", leader: null };
  if (format === "group") return { href: "/admin/groups", label: "Groups", noun: "groups", leader: "Group Leader" };
  if (format === "sport") return { href: "/admin/groups", label: "Teams", noun: "teams", leader: "Captain" };
  return null;
}
