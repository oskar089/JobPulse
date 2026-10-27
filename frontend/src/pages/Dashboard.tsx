import { useState, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { runPipeline, getLatestPipelineRuns, cancelPipeline } from "../lib/pipeline";
import { listJobs, clearJobs } from "../lib/jobs";
import { listPortals } from "../lib/portals";
import { cn, focusRing, safeExternalUrl } from "../lib/utils";
import type { LatestRun } from "../lib/pipeline";
import { FileText, Globe, TrendingUp, CheckCircle, Play, Loader2, AlertCircle, XCircle, Square, ExternalLink } from "lucide-react";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  queued: "Queued",
  scraping: "Scraping",
  matching: "Matching",
  applying: "Applying",
  notifying: "Notifying",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  dispatch_failed: "Dispatch failed",
};

const STATUS_BADGE: Record<string, BadgeVariant> = {
  pending: "default",
  queued: "info",
  scraping: "info",
  matching: "warning",
  applying: "warning",
  notifying: "info",
  completed: "success",
  failed: "danger",
  cancelled: "default",
  dispatch_failed: "danger",
};

const ACTIVE_STATUSES = new Set(["pending", "queued", "scraping", "matching", "applying", "notifying"]);
const STORED_JOBS_LIMIT = 20;
const TOP_JOBS_SHOWN = 10;
const HIGH_MATCH_SCORE = 70;
const MEDIUM_MATCH_SCORE = 40;

function isActive(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function matchScoreClass(score: number): string {
  if (score >= HIGH_MATCH_SCORE) return "text-green-400";
  if (score >= MEDIUM_MATCH_SCORE) return "text-amber-400";
  return "text-slate-400";
}

function RunStatusIcon({ status }: { status: string }) {
  if (isActive(status)) {
    return <Loader2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-400 motion-reduce:animate-none" />;
  }
  if (status === "cancelled") {
    return <Square aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-400" />;
  }
  if (status === "failed" || status === "dispatch_failed") {
    return <XCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-red-400" />;
  }
  return <CheckCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-green-400" />;
}

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [showPipelineStatus, setShowPipelineStatus] = useState(true);
  const [clearingJobs, setClearingJobs] = useState(false);
  const [runToCancel, setRunToCancel] = useState<LatestRun | null>(null);
  const [confirmClearJobs, setConfirmClearJobs] = useState(false);

  // Poll pipeline status every 5s while there are active runs
  const { data: pipelineStatus, isError: pipelineStatusError } = useQuery({
    queryKey: ["pipeline-latest"],
    queryFn: getLatestPipelineRuns,
    refetchInterval: (query) => (query.state.data?.has_active_runs ? 5_000 : false),
  });

  const { data: storedJobs = [], isLoading: jobsLoading, isError: jobsError } = useQuery({
    queryKey: ["stored-jobs"],
    queryFn: () => listJobs(STORED_JOBS_LIMIT),
    refetchInterval: 30_000,
  });

  const { data: portals } = useQuery({
    queryKey: ["portals"],
    queryFn: listPortals,
  });

  const runs = pipelineStatus?.runs ?? [];
  const activeCount = runs.filter((r) => isActive(r.status)).length;
  const completedCount = runs.filter((r) => r.status === "completed").length;
  const isPipelineCardVisible = showPipelineStatus && runs.length > 0;
  const pipelineSummary = !isPipelineCardVisible
    ? ""
    : pipelineStatus?.has_active_runs
      ? `Search in progress: ${activeCount} active run${activeCount !== 1 ? "s" : ""}.`
      : `Last search finished: ${completedCount} of ${runs.length} runs completed.`;

  const scoredJobs = storedJobs.filter((job) => job.match_score != null);
  const matchAverage = scoredJobs.length
    ? `${Math.round(scoredJobs.reduce((sum, job) => sum + (job.match_score ?? 0), 0) / scoredJobs.length)}%`
    : "--";
  const topJobs = [...storedJobs]
    .sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1))
    .slice(0, TOP_JOBS_SHOWN);

  const stats = [
    { label: "Jobs found", value: String(storedJobs.length), icon: FileText, color: "text-blue-500" },
    {
      label: "Active portals",
      value: portals ? String(portals.filter((p) => p.is_enabled).length) : "--",
      icon: Globe,
      color: "text-green-500",
    },
    {
      label: "Searches completed",
      value: runs.length > 0 ? `${completedCount}/${runs.length}` : "--",
      icon: TrendingUp,
      color: "text-purple-500",
    },
    { label: "Match average", value: matchAverage, icon: CheckCircle, color: "text-amber-500" },
  ];

  const handleRunPipeline = useCallback(async () => {
    setIsRunning(true);
    setResult(null);
    setShowPipelineStatus(true);
    try {
      const res = await runPipeline();
      setResult({ type: "success", message: res.message });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-latest"] });
      queryClient.invalidateQueries({ queryKey: ["stored-jobs"] });
    } catch (err) {
      setResult({ type: "error", message: errorMessage(err, "Failed to start the search") });
    } finally {
      setIsRunning(false);
    }
  }, [queryClient]);

  const handleCancel = useCallback(async (runId: string) => {
    setCancelling((prev) => new Set(prev).add(runId));
    try {
      await cancelPipeline(runId);
      queryClient.invalidateQueries({ queryKey: ["pipeline-latest"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (err) {
      setResult({ type: "error", message: errorMessage(err, "Failed to cancel the search") });
    } finally {
      setCancelling((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
    }
  }, [queryClient]);

  const handleDismissPipeline = useCallback(() => {
    queryClient.removeQueries({ queryKey: ["pipeline-latest"] });
    setShowPipelineStatus(false);
    setResult(null);
  }, [queryClient]);

  const handleClearJobs = useCallback(async () => {
    setClearingJobs(true);
    try {
      await clearJobs();
      queryClient.invalidateQueries({ queryKey: ["stored-jobs"] });
    } catch (err) {
      setResult({ type: "error", message: errorMessage(err, "Failed to clear stored jobs") });
    } finally {
      setClearingJobs(false);
    }
  }, [queryClient]);

  const confirmCancelRun = () => {
    if (runToCancel) handleCancel(runToCancel.pipeline_run_id);
    setRunToCancel(null);
  };

  const confirmClear = () => {
    setConfirmClearJobs(false);
    handleClearJobs();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Welcome, {user?.name || user?.email}. Overview of your job search activity.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRunPipeline}
          disabled={isRunning}
          className={cn(
            "flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60",
            focusRing,
          )}
        >
          {isRunning ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Play aria-hidden="true" className="h-4 w-4" />
          )}
          {isRunning ? "Searching..." : "Start search"}
        </button>
      </div>

      {/* Success / error banner (live regions stay mounted so updates are announced) */}
      <div role="status">
        {result?.type === "success" && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-green-700/50 bg-green-900/20 px-4 py-3 text-sm text-green-400">
            <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {result.message}
          </div>
        )}
      </div>
      <div role="alert">
        {result?.type === "error" && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            {result.message}
          </div>
        )}
        {pipelineStatusError && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
            <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
            Could not load the search status.
          </div>
        )}
      </div>

      {/* Polling updates the list every 5s; only this summary is announced, and only when it changes */}
      <p className="sr-only" aria-live="polite">
        {pipelineSummary}
      </p>

      {/* Live pipeline status */}
      {isPipelineCardVisible && (
        <Card className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            {pipelineStatus?.has_active_runs ? (
              <>
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-blue-400 motion-reduce:animate-none" />
                <h2 className="text-sm font-semibold text-white">Search in progress</h2>
                <span className="text-xs text-slate-400">({activeCount} active)</span>
              </>
            ) : (
              <>
                <CheckCircle aria-hidden="true" className="h-4 w-4 text-green-400" />
                <h2 className="text-sm font-semibold text-white">Last search</h2>
              </>
            )}
            <button
              type="button"
              onClick={handleDismissPipeline}
              className={cn(
                "ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-white",
                focusRing,
              )}
              title="Dismiss search history"
            >
              <XCircle aria-hidden="true" className="h-3 w-3" />
              Dismiss
            </button>
          </div>

          <ul className="space-y-2">
            {runs.map((run) => {
              const isCancelling = cancelling.has(run.pipeline_run_id);
              return (
                <li
                  key={run.pipeline_run_id}
                  className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <RunStatusIcon status={run.status} />
                    <span className="truncate text-sm text-white">{run.portal_name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {run.status === "failed" && run.error_msg && (
                      <span className="hidden sm:block max-w-48 truncate text-xs text-red-400" title={run.error_msg}>
                        {run.error_msg}
                      </span>
                    )}
                    <Badge variant={STATUS_BADGE[run.status] || "default"}>
                      {STATUS_LABELS[run.status] || run.status}
                    </Badge>
                    {isActive(run.status) && (
                      <button
                        type="button"
                        onClick={() => setRunToCancel(run)}
                        disabled={isCancelling}
                        aria-label={`Cancel search on ${run.portal_name}`}
                        className={cn(
                          "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-red-400 disabled:opacity-50",
                          focusRing,
                        )}
                      >
                        {isCancelling ? (
                          <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <XCircle aria-hidden="true" className="h-3 w-3" />
                        )}
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Stats */}
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

      {/* Found jobs */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Jobs found</h2>
          {storedJobs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{storedJobs.length} job(s)</span>
              <button
                type="button"
                onClick={() => setConfirmClearJobs(true)}
                disabled={clearingJobs}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-red-400 disabled:opacity-50",
                  focusRing,
                )}
                title="Clear all stored jobs"
              >
                {clearingJobs ? (
                  <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                ) : (
                  <XCircle aria-hidden="true" className="h-3 w-3" />
                )}
                Clear all
              </button>
            </div>
          )}
        </div>

        {jobsLoading ? (
          <p role="status" className="py-16 text-center text-sm text-slate-400">Loading jobs...</p>
        ) : jobsError ? (
          <p role="alert" className="py-16 text-center text-sm text-red-400">Could not load stored jobs.</p>
        ) : storedJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <FileText aria-hidden="true" className="w-12 h-12 mb-3 opacity-40" />
            <p className="text-sm font-medium">No jobs yet</p>
            <p className="text-xs mt-1">
              Click &ldquo;Start search&rdquo; to look for openings on your enabled portals.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Top {topJobs.length} stored jobs, sorted by match score</caption>
              <thead>
                <tr className="border-b border-slate-700 text-left text-slate-400">
                  <th scope="col" className="pb-2 pr-4 font-medium">Job</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Company</th>
                  <th scope="col" className="pb-2 pr-4 font-medium hidden sm:table-cell">Portal</th>
                  <th scope="col" className="pb-2 pr-4 font-medium hidden md:table-cell">Location</th>
                  <th scope="col" className="pb-2 pr-4 font-medium">Match</th>
                  <th scope="col" className="pb-2 font-medium">
                    <span className="sr-only">Link</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {topJobs.map((job) => {
                  const jobUrl = safeExternalUrl(job.url);
                  return (
                    <tr key={job.id} className="border-b border-slate-800 text-white hover:bg-slate-800/50">
                      <td className="py-2.5 pr-4 max-w-56 truncate">{job.title}</td>
                      <td className="py-2.5 pr-4 text-slate-300 max-w-36 truncate">{job.company}</td>
                      <td className="py-2.5 pr-4 hidden sm:table-cell">
                        <Badge variant="info" className="text-[10px]">{job.portal_name}</Badge>
                      </td>
                      <td className="py-2.5 pr-4 hidden md:table-cell text-slate-400">{job.location || "—"}</td>
                      <td className="py-2.5 pr-4">
                        {job.match_score != null ? (
                          <span className={cn("inline-flex items-center gap-1 text-xs font-medium", matchScoreClass(job.match_score))}>
                            {Math.round(job.match_score)}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Not scored</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {jobUrl && (
                          <a
                            href={jobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`View ${job.title} at ${job.company} (opens in a new tab)`}
                            className={cn("inline-flex items-center gap-1 rounded text-blue-400 hover:text-blue-300 transition-colors", focusRing)}
                          >
                            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={!!runToCancel} onClose={() => setRunToCancel(null)} title="Cancel search">
        <p className="mb-4 text-sm text-slate-300">
          Stop the running search on {runToCancel?.portal_name}?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setRunToCancel(null)}>
            Keep running
          </Button>
          <Button variant="danger" onClick={confirmCancelRun}>
            Cancel search
          </Button>
        </div>
      </Modal>

      <Modal isOpen={confirmClearJobs} onClose={() => setConfirmClearJobs(false)} title="Clear all jobs">
        <p className="mb-4 text-sm text-slate-300">
          Delete all stored jobs? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmClearJobs(false)}>
            Keep jobs
          </Button>
          <Button variant="danger" onClick={confirmClear}>
            Clear all
          </Button>
        </div>
      </Modal>
    </div>
  );
}
