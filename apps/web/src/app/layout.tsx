import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/themes/ThemeProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "TaskFlow",
  description: "Gestor personal de tareas",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/LogoFavicon/favicon_io/favicon.ico", type: "image/x-icon" },
      { url: "/LogoFavicon/favicon_io/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/LogoFavicon/favicon_io/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/LogoFavicon/favicon_io/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}