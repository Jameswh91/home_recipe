"use client";

import { useEffect, useState } from "react";
import { formatQuantity, type ShoppingAisle } from "@/lib/shopping";

// Ticks live in this browser only (localStorage), per week, so the phone in the shop keeps its own state.
const storageKey = (week: string) => `shopping-ticks:${week}`;

export function Checklist({ week, aisles }: { week: string; aisles: ShoppingAisle[] }) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(week));
      setTicked(new Set(saved ? (JSON.parse(saved) as string[]) : []));
    } catch {
      setTicked(new Set());
    }
  }, [week]);

  const save = (next: Set<string>) => {
    setTicked(next);
    try {
      localStorage.setItem(storageKey(week), JSON.stringify([...next]));
    } catch {
      // Private mode or storage full: ticks still work for this visit.
    }
  };

  const toggle = (key: string) => {
    const next = new Set(ticked);
    if (!next.delete(key)) next.add(key);
    save(next);
  };

  const all = aisles.flatMap((a) => a.items);
  const left = all.filter((i) => !ticked.has(i.key)).length;

  return (
    <>
      <p className="muted" aria-live="polite">
        {left === 0 ? "All done." : `${left} of ${all.length} left`}
        {ticked.size > 0 && (
          <>
            {" · "}
            <button type="button" className="link" onClick={() => save(new Set())}>
              Clear ticks
            </button>
          </>
        )}
      </p>
      {aisles.map(({ aisle, items }) => (
        <section key={aisle} className="card aisle">
          <h2>{aisle}</h2>
          <ul>
            {items.map((item) => {
              const qty = formatQuantity(item);
              return (
                <li key={item.key}>
                  <label className={`shop-item${ticked.has(item.key) ? " done" : ""}`}>
                    <input type="checkbox" checked={ticked.has(item.key)} onChange={() => toggle(item.key)} />
                    <span className="what">
                      <span className="name">
                        {item.name}
                        {qty && <span className="qty"> · {qty}</span>}
                      </span>
                      <span className="meta">{item.used_in.join(", ")}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
