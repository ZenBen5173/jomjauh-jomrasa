import { DesktopHint } from "@/components/planner/desktop-hint";
import { Guide } from "@/components/planner/guide";
import { TopBar } from "@/components/planner/top-bar";
import { ThemeShell } from "@/lib/theme";

/** Planner experience. Light by default; the top bar switches to the dark "control room" look. The traveller app under /trip has its own layout. */
export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeShell>
      <TopBar />
      <main className="mx-auto max-w-[1500px] px-4 py-4 md:px-6">{children}</main>
      <Guide />
      <DesktopHint />
    </ThemeShell>
  );
}
