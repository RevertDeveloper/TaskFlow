import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TaskFlow - tareas personales",
    short_name: "TaskFlow",
    description: "Gestion personal de tareas con autoridad Cloud o Device.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07100e",
    theme_color: "#07100e",
    lang: "es",
    icons: [
      {
        src: "/LogoFavicon/favicon_io/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/LogoFavicon/favicon_io/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/LogoFavicon/favicon_io/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/LogoFavicon/favicon_io/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
