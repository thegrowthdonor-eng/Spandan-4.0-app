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
    // Median colour sampled from the PNG's outer 4% so its square cannot flash.
    background_color: "#001a1e",
    theme_color: "#001a1e",
    categories: ["education", "entertainment"],
    icons: [
      { src: "/spandan-logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/spandan-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/spandan-logo.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/spandan-logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Explore events", short_name: "Events", url: "/events" },
      { name: "Festival schedule", short_name: "Schedule", url: "/schedule" },
    ],
  };
}
