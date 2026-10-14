import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "SPANDAN 4.0 | GMC Firozabad", short_name: "SPANDAN 4.0", description: "The festival space for GMC Firozabad.", start_url: "/", display: "standalone", background_color: "#261923", theme_color: "#261923", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}
