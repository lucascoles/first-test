import { readTab } from "@/lib/sheets";
import { DATA_TAB, TOKENS_TAB, COLUMNS } from "@/lib/config";
import Charts from "./Charts";
export const revalidate = 300; // cache sheet reads for 5 minutes
async function getCreatorData(token) {
  // 1. Which creator does this token belong to?
  const tokenRows = await readTab(TOKENS_TAB);
  const match = tokenRows.find((r) => r["Token"] === token);
  if (!match) return null;
  const creatorCode = match["Creator Code"];
  // 2. Read everything, then keep only this creator's rows. This filtering
  //    happens on the server, so other creators' data never reaches the browser.
  const all = await readTab(DATA_TAB);
  const mine = all.filter((r) => r[COLUMNS.creatorCode] === creatorCode);
  // 3. Clean strings into numbers.
  const num = (v) => Number(String(v).replace(/[^0-9.-]/g, "")) || 0;
  const rows = mine.map((r) => ({
    date: r[COLUMNS.date] || "n/a",
    clicks: num(r[COLUMNS.clicks]),
    redemptions: num(r[COLUMNS.redemptions]),
    revenue: num(r[COLUMNS.revenue]),
    commission: num(r[COLUMNS.commission]),
  }));
  // 4. Totals across all of this creator's rows.
  const totals = rows.reduce(
    (t, r) => ({
      clicks: t.clicks + r.clicks,
      redemptions: t.redemptions + r.redemptions,
      revenue: t.revenue + r.revenue,
      commission: t.commission + r.commission,
    }),
    { clicks: 0, redemptions: 0, revenue: 0, commission: 0 }
  );
  // 5. Group rows by date so the chart is one clean point per day.
  const byDate = {};
  for (const r of rows) {
    if (!byDate[r.date]) {
      byDate[r.date] = { date: r.date, clicks: 0, redemptions: 0, revenue: 0, commission: 0 };
    }
    byDate[r.date].clicks += r.clicks;
    byDate[r.date].redemptions += r.redemptions;
    byDate[r.date].revenue += r.revenue;
    byDate[r.date].commission += r.commission;
  }
  const series = Object.values(byDate).sort((a, b) => (a.date > b.date ? 1 : -1));
  return { creatorCode, series, totals };
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
  const { creatorCode, series, totals } = data;
  const money = (n) =>
    "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return (
    <main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
      <div className="max-w-4xl mx-auto">
        <p className="text-xs tracking-[0.15em] uppercase text-[#8A8972] mb-2">
          XYON Creator Dashboard
        </p>
        <h1 className="text-3xl font-light mb-8">{creatorCode}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
          <Stat label="Redemptions" value={totals.redemptions.toLocaleString()} />
          <Stat label="Revenue" value={money(totals.revenue)} />
          <Stat label="Your Commission" value={money(totals.commission)} />
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
