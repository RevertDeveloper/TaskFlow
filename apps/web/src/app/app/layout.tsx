import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

export default function PrivateAppLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}