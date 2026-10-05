import { MEALS, type PlanDay, type PlanEntry, type WeekPlan } from "@/lib/plan";
import { formatDay } from "@/lib/week";

const minutes = (e: PlanEntry) => {
  const total = (e.prep_minutes ?? 0) + (e.cook_minutes ?? 0);
  return total ? `${total} min` : null;
};

function Entry({ entry }: { entry: PlanEntry }) {
  const meta = [minutes(entry), entry.kcal_per_serving ? `${entry.kcal_per_serving} kcal` : null].filter(Boolean);
  return (
    <li className="entry">
      <span className="recipe">{entry.recipe_name}</span>
      {meta.length > 0 && <span className="meta">{meta.join(" · ")}</span>}
      {entry.portions.length > 0 && (
        <span className="portions">{entry.portions.map((p) => `${p.person} ×${p.servings}`).join(", ")}</span>
      )}
      {entry.notes && <span className="meta">{entry.notes}</span>}
    </li>
  );
}

function Totals({ day }: { day: PlanDay }) {
  if (!day.kcal_by_person.length) return null;
  return (
    <p className="totals">
      {day.kcal_by_person.map((t) => (
        <span key={t.person}>
          {t.person} {t.kcal.toLocaleString("en-GB")}
          {t.target ? ` / ${t.target.toLocaleString("en-GB")}` : ""} kcal
          {t.entries_missing_kcal > 0 && " *"}
        </span>
      ))}
    </p>
  );
}

export function WeekGrid({ plan, today }: { plan: WeekPlan; today: string }) {
  const understated = plan.days.some((d) => d.kcal_by_person.some((t) => t.entries_missing_kcal > 0));
  return (
    <div className="week">
      {plan.days.map((day) => (
        <section key={day.date} className={`day${day.date === today ? " today" : ""}`}>
          <h2>{formatDay(day.date)}</h2>
          {MEALS.map((meal) => (
            <div key={meal} className="slot">
              <h3>{meal}</h3>
              {day.meals[meal].length ? (
                <ul>{day.meals[meal].map((e) => <Entry key={e.id} entry={e} />)}</ul>
              ) : (
                <p className="empty">—</p>
              )}
            </div>
          ))}
          <Totals day={day} />
        </section>
      ))}
      {understated && <p className="muted">* Some recipes have no kcal on record, so this total is understated.</p>}
    </div>
  );
}
