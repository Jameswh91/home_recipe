import assert from "node:assert/strict";
import { addDays, formatDay, isIsoDate, mondayOf, todayIso } from "./week.js";

assert.equal(mondayOf("2026-10-05"), "2026-10-05"); // already Monday
assert.equal(mondayOf("2026-10-11"), "2026-10-05"); // Sunday belongs to the week that started Monday
assert.equal(mondayOf("2026-10-07"), "2026-10-05");
assert.equal(mondayOf("2026-01-01"), "2025-12-29"); // crosses a year boundary
assert.equal(addDays("2026-10-25", 1), "2026-10-26"); // clocks go back that night; dates must not drift
assert.equal(addDays("2026-03-01", -1), "2026-02-28");
assert.ok(isIsoDate("2026-02-28") && !isIsoDate("2026-02-30") && !isIsoDate("tomorrow"));
assert.equal(formatDay("2026-10-05"), "Mon 5 Oct");
// 23:30 UTC on 4 Oct is already 5 Oct in London (BST); the server's clock must not decide "today".
assert.equal(todayIso("Europe/London", new Date("2026-10-04T23:30:00Z")), "2026-10-05");
console.log("week tests passed");
