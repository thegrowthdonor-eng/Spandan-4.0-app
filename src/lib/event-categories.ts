export const eventCategoryLabels = { sport: "Sports", cultural: "Cultural", literary: "Literary", creative: "Arts", other: "Gaming & Specials" } as const;
export function eventCategoryLabel(category: string) {
  return eventCategoryLabels[category as keyof typeof eventCategoryLabels] ?? category;
}
export function countRolePeople(members: { profile_id: string; role: string }[], role: string) {
  return new Set(members.filter(member => member.role === role).map(member => member.profile_id)).size;
}
