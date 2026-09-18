import { TopBar } from "@/components/planner/top-bar";

/** Planner experience: dark "control room" dashboard. The traveller app under /trip has its own light layout. */
export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <TopBar />
      <main className="mx-auto max-w-[1500px] px-4 py-4 md:px-6">{children}</main>
    </div>
  );
}
