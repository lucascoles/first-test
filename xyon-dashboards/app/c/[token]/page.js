import { readTab } from "@/lib/sheets";
import { DATA_TAB, TOKENS_TAB, COLUMNS, EVENTS } from "@/lib/config";
import Charts from "./Charts";
export const revalidate = 300; // cache sheet reads for 5 minutes
// The feed's month column renders like "01/06/2026" (day/month/year).
// Normalize to "2026-06" so labels are clean and sort correctly.
const monthStr = (v) => {
  const s = String(v ?? "").trim();
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}`;
  const ymd = s.match(/^(\d{4})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}`;
  return s || "n/a";
};
async function getCreatorData(token) {
  // 1. Which creator does this token belong to?
  const tokenRows = await readTab(process.env.TOKENS_SHEET_ID, TOKENS_TAB);
  const match = tokenRows.find((r) => r["Token"] === token);
  if (!match) return null;
  const creatorId = match["Creator Code"];
  // 2. Read the whole feed, then keep only this creator's rows. This
  //    filtering happens on the server, so other creators' data never
  //    reaches the browser.
  const all = await readTab(process.env.DATA_SHEET_ID, DATA_TAB);
  const mine = all.filter((r) => r[COLUMNS.creatorId] === creatorId);
  const creatorName = mine[0]?.[COLUMNS.creatorName] || creatorId;
  // 3. Clean strings into numbers and month labels.
  const num = (v) => Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
  const rows = mine.map((r) => ({
    date: monthStr(r[COLUMNS.date]),
    event: String(r[COLUMNS.event] ?? ""),
    qty: num(r[COLUMNS.qty]),
    amount: num(r[COLUMNS.amount]),
  }));
  // 4. Totals across all of this creator's rows. Rows whose event we don't
  //    recognize still count toward total conversions and earnings.
  const totals = rows.reduce(
    (t, r) => {
      if (r.event === EVENTS.consultation) t.consultations += r.qty;
      if (r.event === EVENTS.retailSale) t.retailSales += r.qty;
      t.conversions += r.qty;
      t.earnings += r.amount;
      return t;
    },
    { consultations: 0, retailSales: 0, conversions: 0, earnings: 0 }
  );
  // 5. Group rows by month so the chart is one clean point per month.
  const byDate = {};
  for (const r of rows) {
    if (!byDate[r.date]) {
      byDate[r.date] = { date: r.date, consultations: 0, retailSales: 0, earnings: 0 };
    }
    if (r.event === EVENTS.consultation) byDate[r.date].consultations += r.qty;
    if (r.event === EVENTS.retailSale) byDate[r.date].retailSales += r.qty;
    byDate[r.date].earnings += r.amount;
  }
  const series = Object.values(byDate).sort((a, b) => (a.date > b.date ? 1 : -1));
  return { creatorName, series, totals };
}
export default async function Page({ params }) {
  const { token } = await params;
  const data = await getCreatorData(token);
  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-400">
        <p>This dashboard link is not valid.</p>
      </main>
    );
  }
  const { creatorName, series, totals } = data;
  const money = (n) =>
    "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs tracking-[0.15em] uppercase text-[#8A8972] mb-2">
          XYON Creator Dashboard
        </p>
        <h1 className="text-3xl font-light mb-8">{creatorName}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Stat label="Consultations" value={totals.consultations.toLocaleString()} />
          <Stat label="Retail Sales" value={totals.retailSales.toLocaleString()} />
          <Stat label="Total Conversions" value={totals.conversions.toLocaleString()} />
          <Stat label="Earnings (USD)" value={money(totals.earnings)} />
        </div>
        <Charts series={series} />
      </div>
    </main>
  );
}
function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-xs text-neutral-400 mb-1">{label}</div>
      <div className="text-2xl font-light">{value}</div>
    </div>
  );
}
