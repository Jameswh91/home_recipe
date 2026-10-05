import Link from "next/link";
import { loadWeek } from "@/lib/plan";
import { addDays, formatDay, isIsoDate, mondayOf, todayIso } from "@/lib/week";
import { WeekGrid } from "./week-grid";

// Always read the live plan; it changes whenever Claude saves one.
export const dynamic = "force-dynamic";

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const today = todayIso();
  const monday = mondayOf(week && isIsoDate(week) ? week : today);

  let plan;
  let error: string | null = null;
  try {
    plan = await loadWeek(monday);
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load the plan";
  }

  const planned = plan?.days.reduce((n, d) => n + Object.values(d.meals).flat().length, 0) ?? 0;

  return (
    <main className="wide">
      <h1>Week of {formatDay(monday)}</h1>
      <nav className="weeknav" aria-label="Week">
        <Link href={`/plan?week=${addDays(monday, -7)}`}>← Previous</Link>
        <Link href="/plan">This week</Link>
        <Link href={`/plan?week=${addDays(monday, 7)}`}>Next →</Link>
      </nav>
      {error && <p className="error">{error}</p>}
      {plan && planned === 0 && (
        <p className="muted">Nothing planned for this week. Ask Claude to plan it and it will show up here.</p>
      )}
      {plan && <WeekGrid plan={plan} today={today} />}
    </main>
  );
}
