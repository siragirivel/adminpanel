import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sirigirvel Workshop",
    short_name: "Sirigirvel",
    description: "Workshop management system for vehicles, billing, inventory, and accounts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f2f7",
    theme_color: "#6366f1",
    orientation: "portrait",
    icons: [
      {
        src: "/Siragiri.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/favicon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/Siragiri.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
