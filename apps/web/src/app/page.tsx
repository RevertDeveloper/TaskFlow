import { AppShell } from "@/components/layout/AppShell";
import { DashboardView } from "@/features/dashboard/components/DashboardView";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell>
      <DashboardView />
    </AppShell>
  );
}