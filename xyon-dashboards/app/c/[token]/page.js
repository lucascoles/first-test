import { readTab } from "@/lib/sheets";
import { readCreatorRows } from "@/lib/bigquery";
import { TOKENS_TAB, EVENTS } from "@/lib/config";
import Charts from "./Charts";
export const revalidate = 300; // cache token + data reads for 5 minutes
// Normalize the month column to "2026-06" so labels are clean and sort
// correctly. BigQuery returns DATE columns as objects whose .value is
// the "2026-06-01" string form.
const monthStr = (v) => {
  const s = String(
    v && typeof v === "object" && "value" in v ? v.value : v ?? ""
  ).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}`;
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}`;
  return s || "n/a";
};
async function getCreatorData(token) {
  // 1. Which creator does this token belong to? (Tokens live in the sheet.)
  const tokenRows = await readTab(process.env.TOKENS_SHEET_ID, TOKENS_TAB);
  const match = tokenRows.find((r) => r["Token"] === token);
  if (!match) return null;
  const creatorId = match["Creator Code"];
  // 2. Ask BigQuery for this creator's rows only. The filtering happens in
  //    the query itself, so other creators' data never reaches the browser.
  const mine = await readCreatorRows(creatorId);
  const creatorName = mine[0]?.creatorName || creatorId;
  // 3. Clean values into plain numbers and month labels.
  const num = (v) => Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
  const rows = mine.map((r) => ({
    date: monthStr(r.date),
    event: String(r.event ?? ""),
    qty: num(r.qty),
    amount: num(r.amount),
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
