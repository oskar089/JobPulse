import { Modal } from "./ui/Modal";
import { safeExternalUrl } from "../lib/utils";
import type { DryRunJob } from "../types";

interface DryRunModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: DryRunJob[];
  error?: string;
  isLoading: boolean;
}

export function DryRunModal({ isOpen, onClose, jobs, error, isLoading }: DryRunModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Dry Run Results">
      {isLoading ? (
        <p role="status" className="text-sm text-slate-400">Running dry run...</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">{error}</p>
      ) : jobs.length === 0 ? (
        <p role="status" className="text-sm text-slate-400">No jobs found.</p>
      ) : (
        <div className="space-y-4">
          <p role="status" className="text-sm text-slate-400">{jobs.length} job(s) found</p>
          <ul className="space-y-4">
            {jobs.map((job, i) => {
              const jobUrl = safeExternalUrl(job.url);
              return (
                <li key={`${job.url}-${i}`} className="rounded-lg border border-slate-700 p-4">
                  <h3 className="font-semibold text-white">{job.title}</h3>
                  <p className="text-sm text-slate-300">
                    {job.company}
                    {job.location ? ` - ${job.location}` : ""}
                  </p>
                  {job.salary_range && (
                    <p className="mt-1 text-xs text-green-400">{job.salary_range}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400 line-clamp-2">{job.description}</p>
                  {jobUrl ? (
                    <a
                      href={jobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block rounded text-xs text-blue-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      View job<span className="sr-only">: {job.title} (opens in a new tab)</span>
                    </a>
                  ) : (
                    job.url && <p className="mt-2 break-all text-xs text-slate-400">{job.url}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
