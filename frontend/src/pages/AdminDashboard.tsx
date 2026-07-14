import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { getAdminAnalytics } from "../lib/admin";
import { Activity, TrendingUp, FileText, Users, Loader2 } from "lucide-react";

const WINDOWS = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function AdminDashboard() {
  const [window, setWindow] = useState("30d");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-analytics", window],
    queryFn: () => getAdminAnalytics(window),
  });

  // Build time-series for applications chart
  const appTimeseries = data?.applications.timeseries.map((pt) => ({
    date: formatDate(pt.date),
    applications: pt.count,
  })) ?? [];

  // Build portal comparison chart data
  const portalComparison = data?.portals.map((p) => ({
    name: p.portal_name,
    "Jobs Found": p.jobs_found,
    "Applications": p.applications_submitted,
  })) ?? [];

  // Build jobs by portal time-series
  const portalColors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];
  const portalNames = data ? Object.keys(data.jobs.by_portal) : [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">System-wide analytics and metrics.</p>
        </div>

        {/* Window selector */}
        <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                window === w.value
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <span>Failed to load analytics data.</span>
          </div>
        </Card>
      )}

      {data && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Pipeline Runs</p>
                  <p className="text-2xl font-bold text-white mt-1">{data.pipeline.total_runs}</p>
                </div>
                <Activity className="w-8 h-8 text-blue-400 opacity-80" />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Success Rate</p>
                  <p className="text-2xl font-bold text-white mt-1">{data.pipeline.success_rate}%</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-400 opacity-80" />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Applications</p>
                  <p className="text-2xl font-bold text-white mt-1">{data.applications.total_submitted}</p>
                </div>
                <FileText className="w-8 h-8 text-amber-400 opacity-80" />
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Conversion Rate</p>
                  <p className="text-2xl font-bold text-white mt-1">{data.conversion_rate}%</p>
                </div>
                <Users className="w-8 h-8 text-purple-400 opacity-80" />
              </div>
            </Card>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Applications time-series */}
            <Card>
              <h2 className="text-sm font-semibold text-white mb-4">Applications Over Time</h2>
              {appTimeseries.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={appTimeseries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          borderRadius: "8px",
                          fontSize: "13px",
                        }}
                        labelStyle={{ color: "#e2e8f0" }}
                      />
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
                <p className="text-sm text-slate-500 py-8 text-center">No application data in this window.</p>
              )}
            </Card>

            {/* Portal comparison bar chart */}
            <Card>
              <h2 className="text-sm font-semibold text-white mb-4">Portal Performance</h2>
              {portalComparison.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={portalComparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          borderRadius: "8px",
                          fontSize: "13px",
                        }}
                        labelStyle={{ color: "#e2e8f0" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px", color: "#94a3b8" }} />
                      <Bar dataKey="Jobs Found" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Applications" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-500 py-8 text-center">No portal data in this window.</p>
              )}
            </Card>
          </div>

          {/* Jobs by portal time-series */}
          {portalNames.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-white mb-4">Jobs Scraped by Portal</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                    <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #334155",
                        borderRadius: "8px",
                        fontSize: "13px",
                      }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px", color: "#94a3b8" }} />
                    {portalNames.map((name, i) => {
                      const series = data.jobs.by_portal[name].map((pt) => ({
                        date: formatDate(pt.date),
                        [name]: pt.count,
                      }));
                      return (
                        <Line
                          key={name}
                          data={series}
                          type="monotone"
                          dataKey={name}
                          stroke={portalColors[i % portalColors.length]}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* Portal performance table */}
          {data.portals.length > 0 && (
            <Card className="mt-6">
              <h2 className="text-sm font-semibold text-white mb-4">Portal Details</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Portal</th>
                      <th className="pb-2 pr-4 font-medium">Jobs Found</th>
                      <th className="pb-2 pr-4 font-medium">Applications</th>
                      <th className="pb-2 font-medium">Success Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.portals.map((portal) => (
                      <tr key={portal.portal_name} className="border-b border-slate-800 text-white hover:bg-slate-800/50">
                        <td className="py-2.5 pr-4">{portal.portal_name}</td>
                        <td className="py-2.5 pr-4 text-slate-300">{portal.jobs_found}</td>
                        <td className="py-2.5 pr-4 text-slate-300">{portal.applications_submitted}</td>
                        <td className="py-2.5">
                          <Badge
                            variant={
                              portal.success_rate >= 50
                                ? "success"
                                : portal.success_rate >= 20
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
