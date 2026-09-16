import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "@/themes/ThemeProvider";

import "./globals.css";

export const metadata: Metadata = {
  title: "TaskFlow",
  description: "Gestor personal de tareas",
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