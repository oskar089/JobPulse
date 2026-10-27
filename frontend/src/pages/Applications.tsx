import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listApplications } from "../lib/applications";
import { cn, focusRing, safeExternalUrl } from "../lib/utils";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Briefcase, ExternalLink, XCircle, CheckCircle, Loader2 } from "lucide-react";
import type { Application } from "../types";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

const STATUS_LABELS: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: "Pending", variant: "default" },
  applying: { label: "Applying", variant: "info" },
  submitted: { label: "Submitted", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "submitted", label: "Submitted" },
  { value: "failed", label: "Failed" },
];

const HIGH_MATCH_SCORE = 70;
const MEDIUM_MATCH_SCORE = 40;
const REFETCH_INTERVAL_MS = 15_000;

function statusInfo(status: string): { label: string; variant: BadgeVariant } {
  return STATUS_LABELS[status] ?? { label: status, variant: "default" };
}

function matchScoreClass(score: number): string {
  if (score >= HIGH_MATCH_SCORE) return "text-green-400";
  if (score >= MEDIUM_MATCH_SCORE) return "text-amber-400";
  return "text-slate-400";
}

export default function ApplicationsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);

  // Unfiltered list feeds the stats so the counters stay correct while a filter is active
  const { data: allApplications = [] } = useQuery({
    queryKey: ["applications", ""],
    queryFn: () => listApplications(),
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  const { data: applications = [], isLoading, isError } = useQuery({
    queryKey: ["applications", statusFilter],
    queryFn: () => listApplications(statusFilter || undefined),
    refetchInterval: REFETCH_INTERVAL_MS,
  });

  const submitted = allApplications.filter((a) => a.status === "submitted").length;
  const failed = allApplications.filter((a) => a.status === "failed").length;
  const pending = allApplications.filter((a) => a.status === "pending" || a.status === "applying").length;
  const activeFilterLabel = FILTERS.find((f) => f.value === statusFilter)?.label ?? "All";
  const selectedJobUrl = safeExternalUrl(selectedApp?.job_url);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Applications</h1>
      <p className="mb-6 text-sm text-slate-400">
        Track your submitted job applications.
      </p>

      {/* Stats */}
      <h2 className="sr-only">Summary</h2>
      <dl className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <dt className="text-xs text-slate-400">Submitted</dt>
          <dd className="text-2xl font-bold text-green-400">{submitted}</dd>
        </Card>
        <Card>
          <dt className="text-xs text-slate-400">Pending</dt>
          <dd className="text-2xl font-bold text-amber-400">{pending}</dd>
        </Card>
        <Card>
          <dt className="text-xs text-slate-400">Failed</dt>
          <dd className="text-2xl font-bold text-red-400">{failed}</dd>
        </Card>
      </dl>

      {/* Filters */}
      <h2 className="sr-only">Application list</h2>
      <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={statusFilter === f.value}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              focusRing,
              statusFilter === f.value
                ? "bg-blue-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <div role="status" className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" />
            <span className="text-sm">Loading applications...</span>
          </div>
        </Card>
      ) : isError ? (
        <Card>
          <p role="alert" className="py-16 text-center text-sm text-red-400">
            Could not load applications.
          </p>
        </Card>
      ) : applications.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Briefcase aria-hidden="true" className="mb-3 h-12 w-12 opacity-40" />
            <p className="text-sm font-medium">No applications yet</p>
            <p className="mt-1 max-w-sm text-center text-xs">
              Applications will appear here once the pipeline runs and matches jobs to your profile.
            </p>
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Applications ({activeFilterLabel}). Select a job title to see its details.
            </caption>
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50 text-left text-slate-400">
                <th scope="col" className="px-4 py-3 font-medium">Job</th>
                <th scope="col" className="px-4 py-3 font-medium">Company</th>
                <th scope="col" className="hidden px-4 py-3 font-medium sm:table-cell">Portal</th>
                <th scope="col" className="px-4 py-3 font-medium">Match</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="hidden px-4 py-3 font-medium md:table-cell">Cover letter</th>
                <th scope="col" className="px-4 py-3 font-medium">
                  <span className="sr-only">Link</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const info = statusInfo(app.status);
                const jobUrl = safeExternalUrl(app.job_url);
                return (
                  <tr
                    key={app.id}
                    className="border-b border-slate-800 text-white transition-colors hover:bg-slate-800/50"
                  >
                    <td className="max-w-56 truncate px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedApp(app)}
                        className={cn("max-w-full truncate rounded text-left hover:text-blue-300 hover:underline", focusRing)}
                      >
                        {app.job_title}
                      </button>
                    </td>
                    <td className="max-w-36 truncate px-4 py-3 text-slate-300">{app.company}</td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <Badge variant="info" className="text-[10px]">{app.portal_name}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {app.match_score != null ? (
                        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", matchScoreClass(app.match_score))}>
                          {Math.round(app.match_score)}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">Not scored</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={info.variant}>{info.label}</Badge>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      {app.cover_letter_generated ? (
                        <>
                          <CheckCircle aria-hidden="true" className="h-4 w-4 text-green-400" />
                          <span className="sr-only">Generated</span>
                        </>
                      ) : (
                        <>
                          <XCircle aria-hidden="true" className="h-4 w-4 text-slate-400" />
                          <span className="sr-only">Not generated</span>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {jobUrl && (
                        <a
                          href={jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`View ${app.job_title} posting (opens in a new tab)`}
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

      {/* Detail Modal */}
      <Modal
        isOpen={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        title={selectedApp?.job_title || "Application Detail"}
      >
        {selectedApp && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-slate-400">Company</dt>
                <dd className="text-sm font-medium text-white">{selectedApp.company}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Portal</dt>
                <dd className="text-sm text-white">{selectedApp.portal_name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Match Score</dt>
                <dd className="text-sm font-medium text-white">
                  {selectedApp.match_score != null ? `${Math.round(selectedApp.match_score)}%` : "Not scored"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Status</dt>
                <dd>
                  <Badge variant={statusInfo(selectedApp.status).variant}>
                    {statusInfo(selectedApp.status).label}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Created</dt>
                <dd className="text-sm text-white">{new Date(selectedApp.created_at).toLocaleDateString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Submitted</dt>
                <dd className="text-sm text-white">
                  {selectedApp.submitted_at ? new Date(selectedApp.submitted_at).toLocaleDateString() : "Not yet"}
                </dd>
              </div>
            </dl>

            {selectedApp.cover_letter_generated && selectedApp.cover_letter_text && (
              <section aria-labelledby="cover-letter-heading">
                <h3 id="cover-letter-heading" className="mb-1 text-xs font-medium text-slate-400">Cover Letter</h3>
                <div
                  role="region"
                  aria-labelledby="cover-letter-heading"
                  // Scrollable region must be keyboard focusable (WCAG 2.1.1)
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                  tabIndex={0}
                  className={cn("max-h-48 overflow-y-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-300 whitespace-pre-wrap", focusRing)}
                >
                  {selectedApp.cover_letter_text}
                </div>
              </section>
            )}

            {selectedApp.error_message && (
              <section aria-labelledby="error-heading">
                <h3 id="error-heading" className="mb-1 text-xs font-medium text-red-400">Error</h3>
                <div className="rounded-lg bg-red-900/20 border border-red-700/50 p-3 text-xs text-red-300">
                  {selectedApp.error_message}
                </div>
              </section>
            )}

            {selectedJobUrl ? (
              <a
                href={selectedJobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 w-fit",
                  focusRing,
                )}
              >
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                View Job Posting
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              selectedApp.job_url && (
                <p className="break-all text-xs text-slate-400">{selectedApp.job_url}</p>
              )
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
