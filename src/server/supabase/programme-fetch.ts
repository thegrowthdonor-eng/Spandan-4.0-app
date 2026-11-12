export const programmeCacheTag = "public-programme";

/** Only anonymous catalogue/programme reads; never cache scores, auth or commands. */
export function programmeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const cacheable = method === "GET" && url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL
    && !headers.has("cookie") && headers.get("authorization") === `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
    && ["/rest/v1/events", "/rest/v1/schedule_entries"].includes(url.pathname);
  return fetch(input, cacheable ? { ...init, cache: "force-cache", next: { revalidate: 30, tags: [programmeCacheTag] } } : init);
}
