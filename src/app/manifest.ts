import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SPANDAN 4.0 | ASMC Firozabad",
    short_name: "SPANDAN 4.0",
    description: "The festival space for ASMC Firozabad.",
    start_url: "/",
    display: "standalone",
    background_color: "#261923",
    theme_color: "#261923",
    icons: [
      { src: "/spandan-logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/spandan-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
