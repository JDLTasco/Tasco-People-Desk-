// Victorian statutory public holidays 2026-2027 (John, 2026-10-03), as
// published by Business Victoria. Loaded into non_working_days by migration
// 20261003000300_business_calendar (existing databases) and prisma/seed.ts
// (fresh ones) -- keep the two lists identical.
//
// Not included, on purpose:
// - AFL Grand Final Friday 2027 -- not gazetted yet (set each year once the
//   AFL fixture is confirmed). Add it on Admin -> Calendar when announced.
// - Tasco shutdown dates -- none supplied; add them on Admin -> Calendar.
// - Regional substitutes: Melbourne Cup Day is statewide unless a council
//   substitutes a local holiday (parts of Mildura Rural City have in some
//   years) -- adjust on Admin -> Calendar if it applies.
export const VIC_PUBLIC_HOLIDAYS: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-26", name: "Australia Day" },
  { date: "2026-03-09", name: "Labour Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-04", name: "Easter Saturday" },
  { date: "2026-04-05", name: "Easter Sunday" },
  { date: "2026-04-06", name: "Easter Monday" },
  { date: "2026-04-25", name: "ANZAC Day" },
  { date: "2026-06-08", name: "King's Birthday" },
  { date: "2026-09-25", name: "AFL Grand Final Friday" },
  { date: "2026-11-03", name: "Melbourne Cup Day" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Boxing Day" },
  { date: "2026-12-28", name: "Boxing Day (additional holiday)" },
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-01-26", name: "Australia Day" },
  { date: "2027-03-08", name: "Labour Day" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-03-27", name: "Easter Saturday" },
  { date: "2027-03-28", name: "Easter Sunday" },
  { date: "2027-03-29", name: "Easter Monday" },
  { date: "2027-04-25", name: "ANZAC Day" },
  { date: "2027-06-14", name: "King's Birthday" },
  { date: "2027-11-02", name: "Melbourne Cup Day" },
  { date: "2027-12-25", name: "Christmas Day" },
  { date: "2027-12-26", name: "Boxing Day" },
  { date: "2027-12-27", name: "Christmas Day (additional holiday)" },
  { date: "2027-12-28", name: "Boxing Day (additional holiday)" },
];
