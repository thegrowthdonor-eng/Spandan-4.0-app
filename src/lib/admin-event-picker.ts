import { eventCategoryLabel } from "./event-categories";

export type PickableEvent = {
  id: string;
  title: string;
  category?: string;
  format?: string;
  state?: string;
};

/** Return distinct non-empty event categories in insertion order. */
export function pickableCategories(events: PickableEvent[]) {
  return [...new Set(events.map((event) => event.category).filter(Boolean))] as string[];
}

/** Filter pickable events by search query (title, format, status, category) and category. */
export function filterPickableEvents(events: PickableEvent[], query: string, category: string) {
  const search = query.trim().toLowerCase();
  return events.filter((event) => {
    if (category !== "all" && event.category !== category) return false;
    if (!search) return true;
    const categoryName = event.category ? eventCategoryLabel(event.category) : "";
    return `${event.title} ${event.category ?? ""} ${categoryName} ${event.format ?? ""} ${event.state ?? ""}`.toLowerCase().includes(search);
  });
}

