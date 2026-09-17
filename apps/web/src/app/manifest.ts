import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TaskFlow - tareas personales",
    short_name: "TaskFlow",
    description: "Gestion personal de tareas con autoridad Cloud o Device.",
    start_url: "/app/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f4f1eb",
    theme_color: "#1b1d1c",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "maskable" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
