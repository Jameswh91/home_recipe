import Link from "next/link";
import { loadShoppingList } from "@/lib/shopping-load";
import { addDays, formatDay, isIsoDate, mondayOf, todayIso } from "@/lib/week";
import { Checklist } from "./checklist";

// Always read the live plan; it changes whenever Claude saves one.
export const dynamic = "force-dynamic";

export default async function ShoppingPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const monday = mondayOf(week && isIsoDate(week) ? week : todayIso());

  let aisles;
  let error: string | null = null;
  try {
    aisles = await loadShoppingList(monday);
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't load the shopping list";
  }

  return (
    <main>
      <h1>Shopping, week of {formatDay(monday)}</h1>
      <nav className="weeknav" aria-label="Week">
        <Link href={`/shopping?week=${addDays(monday, -7)}`}>← Previous</Link>
        <Link href={`/plan?week=${monday}`}>View plan</Link>
        <Link href={`/shopping?week=${addDays(monday, 7)}`}>Next →</Link>
      </nav>
      {error && <p className="error">{error}</p>}
      {aisles && aisles.length === 0 && (
        <p className="muted">Nothing planned for this week, so nothing to buy. Ask Claude to plan it first.</p>
      )}
      {aisles && aisles.length > 0 && <Checklist week={monday} aisles={aisles} />}
    </main>
  );
}
