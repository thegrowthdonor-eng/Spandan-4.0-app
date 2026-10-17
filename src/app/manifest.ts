import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SPANDAN 4.0 | ASMC Firozabad",
    short_name: "SPANDAN 4.0",
    description: "The festival space for ASMC Firozabad.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Android uses this while the installed app is starting, before React loads.
    // This is sampled from the official SPANDAN crest so launch never flashes purple.
    background_color: "#003438",
    theme_color: "#003438",
    categories: ["education", "entertainment"],
    icons: [
      { src: "/spandan-logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/spandan-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Explore events", short_name: "Events", url: "/events" },
      { name: "Festival schedule", short_name: "Schedule", url: "/schedule" },
    ],
  };
}
