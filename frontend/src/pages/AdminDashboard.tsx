import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { getAdminAnalytics } from "../lib/admin";
import { cn, focusRing } from "../lib/utils";
import { Activity, TrendingUp, FileText, Users, Loader2 } from "lucide-react";

const WINDOWS = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];

const PORTAL_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
const HIGH_SUCCESS_RATE = 50;
const MEDIUM_SUCCESS_RATE = 20;

const TOOLTIP_STYLE = {
  backgroundColor: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "8px",
  fontSize: "13px",
};
const TOOLTIP_LABEL_STYLE = { color: "#e2e8f0" };
const LEGEND_STYLE = { fontSize: "12px", color: "#94a3b8" };

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminDashboard() {
  const [timeWindow, setTimeWindow] = useState("30d");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-analytics", timeWindow],
    queryFn: () => getAdminAnalytics(timeWindow),
  });

  const windowLabel = WINDOWS.find((w) => w.value === timeWindow)?.label ?? timeWindow;

  const appTimeseries = data?.applications.timeseries.map((pt) => ({
    date: formatDate(pt.date),
    applications: pt.count,
  })) ?? [];

  const portalComparison = data?.portals.map((p) => ({
    name: p.portal_name,
    "Jobs Found": p.jobs_found,
    "Applications": p.applications_submitted,
  })) ?? [];

  // Merge every portal's series into one row per date so all lines share the same X axis
  const portalNames = data ? Object.keys(data.jobs.by_portal) : [];
  const jobsByDate = new Map<string, Record<string, string | number>>();
  for (const name of portalNames) {
    for (const pt of data?.jobs.by_portal[name] ?? []) {
      const row = jobsByDate.get(pt.date) ?? { date: formatDate(pt.date) };
      row[name] = pt.count;
      jobsByDate.set(pt.date, row);
    }
  }
  const jobsByPortalSeries = [...jobsByDate.entries()]
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([, row]) => row);

  const totalApplicationsInSeries = appTimeseries.reduce((sum, pt) => sum + pt.applications, 0);
  const applicationsChartSummary = `Line chart of applications over the last ${windowLabel}: ${totalApplicationsInSeries} applications across ${appTimeseries.length} dates.`;
  const portalChartSummary = `Bar chart comparing jobs found and applications per portal: ${portalComparison
    .map((p) => `${p.name}, ${p["Jobs Found"]} jobs found and ${p.Applications} applications`)
    .join("; ")}.`;
  const jobsByPortalSummary = `Line chart of jobs scraped per portal over the last ${windowLabel}: ${portalNames
    .map((name) => `${name}, ${(data?.jobs.by_portal[name] ?? []).reduce((sum, pt) => sum + pt.count, 0)} jobs`)
    .join("; ")}.`;

  const stats = data
    ? [
        { label: "Pipeline Runs", value: String(data.pipeline.total_runs), icon: Activity, color: "text-blue-400" },
        { label: "Success Rate", value: `${data.pipeline.success_rate}%`, icon: TrendingUp, color: "text-green-400" },
        { label: "Total Applications", value: String(data.applications.total_submitted), icon: FileText, color: "text-amber-400" },
        { label: "Conversion Rate", value: `${data.conversion_rate}%`, icon: Users, color: "text-purple-400" },
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">System-wide analytics and metrics.</p>
        </div>

        <div role="group" aria-label="Time window" className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              type="button"
              aria-pressed={timeWindow === w.value}
              onClick={() => setTimeWindow(w.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                focusRing,
                timeWindow === w.value
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white",
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div role="status" className="flex items-center justify-center py-20">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-blue-400 motion-reduce:animate-none" />
          <span className="sr-only">Loading analytics...</span>
        </div>
      )}

      {error && (
        <Card className="mb-6">
          <p role="alert" className="text-red-400 text-sm">Failed to load analytics data.</p>
        </Card>
      )}

      {data && (
        <>
          <h2 className="sr-only">Summary</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <li key={stat.label}>
                  <Card>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-400">{stat.label}</p>
                        <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                      </div>
                      <Icon aria-hidden="true" className={`w-8 h-8 ${stat.color} opacity-80`} />
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card>
              <h2 className="text-sm font-semibold text-white mb-4">Applications Over Time</h2>
              {appTimeseries.length > 0 ? (
                <div role="img" aria-label={applicationsChartSummary} className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={appTimeseries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                      <Line
                        type="monotone"
                        dataKey="applications"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: "#3b82f6", r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-400 py-8 text-center">No application data in this window.</p>
              )}
            </Card>

            <Card>
              <h2 className="text-sm font-semibold text-white mb-4">Portal Performance</h2>
              {portalComparison.length > 0 ? (
                <div role="img" aria-label={portalChartSummary} className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={portalComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                      <Legend wrapperStyle={LEGEND_STYLE} />
                      <Bar dataKey="Jobs Found" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Applications" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-400 py-8 text-center">No portal data in this window.</p>
              )}
            </Card>
          </div>

          {portalNames.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-white mb-4">Jobs Scraped by Portal</h2>
              <div role="img" aria-label={jobsByPortalSummary} className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={jobsByPortalSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} />
                    <Legend wrapperStyle={LEGEND_STYLE} />
                    {portalNames.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={PORTAL_COLORS[i % PORTAL_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {data.portals.length > 0 && (
            <Card className="mt-6">
              <h2 className="text-sm font-semibold text-white mb-4">Portal Details</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Per-portal results for the last {windowLabel}</caption>
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-slate-400">
                      <th scope="col" className="pb-2 pr-4 font-medium">Portal</th>
                      <th scope="col" className="pb-2 pr-4 font-medium">Jobs Found</th>
                      <th scope="col" className="pb-2 pr-4 font-medium">Applications</th>
                      <th scope="col" className="pb-2 font-medium">Success Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.portals.map((portal) => (
                      <tr key={portal.portal_name} className="border-b border-slate-800 text-white hover:bg-slate-800/50">
                        <th scope="row" className="py-2.5 pr-4 text-left font-normal">{portal.portal_name}</th>
                        <td className="py-2.5 pr-4 text-slate-300">{portal.jobs_found}</td>
                        <td className="py-2.5 pr-4 text-slate-300">{portal.applications_submitted}</td>
                        <td className="py-2.5">
                          <Badge
                            variant={
                              portal.success_rate >= HIGH_SUCCESS_RATE
                                ? "success"
                                : portal.success_rate >= MEDIUM_SUCCESS_RATE
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            {portal.success_rate}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
