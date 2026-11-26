import type { MetadataRoute } from "next";

// TKT-06: "Add to Home Screen" – opens straight to My tickets like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TickLO – university event tickets",
    short_name: "TickLO",
    description: "Your TickLO tickets and QR codes – even offline.",
    start_url: "/me/tickets",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B1F3A",
    theme_color: "#0B1F3A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "My tickets", url: "/me/tickets" },
      { name: "Scan tickets", url: "/scan" },
      { name: "Sell tickets", url: "/sell" },
    ],
  };
}
