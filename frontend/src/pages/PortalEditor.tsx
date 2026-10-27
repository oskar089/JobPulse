import { useState, type FormEvent } from "react";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import type { Portal, PortalCreate, PortalSelectors } from "../types";

interface PortalEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PortalCreate) => void;
  portal?: Portal;
  isLoading?: boolean;
  error?: string;
}

const DEFAULT_SCRAPE_INTERVAL_MIN = 60;

const emptySelectors: PortalSelectors = {
  job_card: "",
  title: "",
  company: "",
  location: "",
  description: "",
  url: "",
  salary: "",
  posted_date: "",
  apply_button: "",
};

const selectorFields: Array<{ key: keyof PortalSelectors; label: string; required: boolean }> = [
  { key: "job_card", label: "Job Card Selector", required: true },
  { key: "title", label: "Title Selector", required: true },
  { key: "company", label: "Company Selector", required: true },
  { key: "location", label: "Location Selector (optional)", required: false },
  { key: "description", label: "Description Selector", required: true },
  { key: "url", label: "URL Selector", required: true },
  { key: "salary", label: "Salary Selector (optional)", required: false },
  { key: "posted_date", label: "Posted Date Selector (optional)", required: false },
  { key: "apply_button", label: "Apply Button Selector (optional)", required: false },
];

export function PortalEditor({ isOpen, onClose, onSave, portal, isLoading, error }: PortalEditorProps) {
  const isEdit = !!portal;
  const [name, setName] = useState(portal?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(portal?.base_url ?? "");
  const [jobListingUrl, setJobListingUrl] = useState(portal?.job_listing_url ?? "");
  const [selectors, setSelectors] = useState<PortalSelectors>(portal?.selectors ?? emptySelectors);
  const [scrapeInterval, setScrapeInterval] = useState(
    portal?.scrape_interval_min?.toString() ?? String(DEFAULT_SCRAPE_INTERVAL_MIN),
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      base_url: baseUrl,
      job_listing_url: jobListingUrl,
      selectors: {
        job_card: selectors.job_card,
        title: selectors.title,
        company: selectors.company,
        location: selectors.location || null,
        description: selectors.description,
        url: selectors.url,
        salary: selectors.salary || null,
        posted_date: selectors.posted_date || null,
        apply_button: selectors.apply_button || null,
      },
      scrape_interval_min: Number(scrapeInterval) || DEFAULT_SCRAPE_INTERVAL_MIN,
    });
  };

  const updateSelector = (key: keyof PortalSelectors, value: string) => {
    setSelectors((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? "Edit Portal" : "Add Portal"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="My Portal"
        />
        <Input
          label="Base URL"
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          required
          placeholder="https://example.com"
        />
        <Input
          label="Job Listing URL"
          type="url"
          value={jobListingUrl}
          onChange={(e) => setJobListingUrl(e.target.value)}
          required
          placeholder="https://example.com/jobs"
        />

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-300">Selectors</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {selectorFields.map(({ key, label, required }) => (
              <Input
                key={key}
                label={label}
                value={selectors[key] ?? ""}
                onChange={(e) => updateSelector(key, e.target.value)}
                required={required}
              />
            ))}
          </div>
        </fieldset>

        <Input
          label="Scrape Interval (minutes)"
          type="number"
          min={1}
          value={scrapeInterval}
          onChange={(e) => setScrapeInterval(e.target.value)}
          placeholder={String(DEFAULT_SCRAPE_INTERVAL_MIN)}
        />

        {error && (
          <p role="alert" className="text-sm text-red-400">
            Could not save the portal: {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            {isEdit ? "Save Changes" : "Create Portal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
