import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Linkedin, Globe, Plus, Trash2, Upload } from "lucide-react";
import { cn, focusRing } from "../lib/utils";
import { getMyProfile, updateMyProfile, importLinkedin, importInfojobs, previewSave, uploadCv, downloadCv, deleteCv } from "../lib/profiles";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Textarea } from "../components/ui/Textarea";
import { TagInput } from "../components/profile/TagInput";
import { SkillTagInput } from "../components/profile/SkillTagInput";
import type { Profile, ImportedProfile, EducationItem, ExperienceItem, CVParseResult } from "../types";

const EXPERIENCE_LEVELS = ["junior", "mid", "senior", "lead"].map((level) => ({
  value: level,
  label: level.charAt(0).toUpperCase() + level.slice(1),
}));

const IMPORT_PROVIDERS = [
  { id: "linkedin" as const, label: "LinkedIn", Icon: Linkedin },
  { id: "infojobs" as const, label: "Infojobs", Icon: Globe },
];

const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;
const SUCCESS_MESSAGE_MS = 3000;

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<Profile>({
    id: "",
    user_id: "",
    target_roles: [],
    tech_stack: [],
    experience_level: "mid",
    min_salary: null,
    max_salary: null,
    locations: [],
    remote_only: false,
    languages: [],
    is_active: true,
    headline: null,
    summary: null,
    skills: [],
    education: [],
    work_experience: [],
    linkedin_url: null,
    infojobs_url: null,
    cv_file_url: null,
  });

  // Import section state
  const [provider, setProvider] = useState<"linkedin" | "infojobs">("linkedin");
  const [importUrl, setImportUrl] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [editData, setEditData] = useState<ImportedProfile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [saveError, setSaveError] = useState("");

  // CV section state
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState("");
  const [cvResult, setCvResult] = useState<CVParseResult | null>(null);
  const [previewMode, setPreviewMode] = useState<"import" | "cv">("import");
  const cvInputRef = useRef<HTMLInputElement>(null);
  const cvInputId = useId();
  const cvHintId = useId();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: getMyProfile,
  });

  useEffect(() => {
    if (profile) {
      setForm(profile);
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      setSuccess("Profile saved successfully");
      setTimeout(() => setSuccess(""), SUCCESS_MESSAGE_MS);
    },
  });

  const previewMutation = useMutation({
    mutationFn: previewSave,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      setIsPreviewOpen(false);
      setEditData(null);
      setImportUrl("");
      setSuccess("Profile imported successfully");
      setTimeout(() => setSuccess(""), SUCCESS_MESSAGE_MS);
    },
    onError: (err: Error) => {
      setSaveError(`Could not save: ${err.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess("");
    mutation.mutate({
      target_roles: form.target_roles,
      tech_stack: form.tech_stack,
      experience_level: form.experience_level,
      min_salary: form.min_salary,
      max_salary: form.max_salary,
      locations: form.locations,
      remote_only: form.remote_only,
      languages: form.languages,
      is_active: form.is_active,
    });
  };

  const handleImport = async () => {
    if (!importUrl.trim()) {
      setImportError("The profile URL is required");
      return;
    }
    setImportError("");
    setIsImporting(true);
    try {
      const data = provider === "linkedin"
        ? await importLinkedin(importUrl.trim())
        : await importInfojobs(importUrl.trim());
      setEditData(data);
      setPreviewMode("import");
      setIsPreviewOpen(true);
      setSaveError("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not import the profile";
      setImportError(message);
    } finally {
      setIsImporting(false);
    }
  };

  const handlePreviewSave = () => {
    if (!editData) return;
    setSaveError("");
    previewMutation.mutate({ preview_data: editData, strategy: "fill-empty" });
  };

  // ---------------------------------------------------------------------------
  // CV upload handlers
  // ---------------------------------------------------------------------------

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleCvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate PDF
    if (file.type && file.type !== "application/pdf") {
      setCvError("Only PDF files are accepted");
      setCvFile(null);
      return;
    }

    // Validate max size
    if (file.size > MAX_CV_SIZE_BYTES) {
      setCvError("The file exceeds the 10 MB limit");
      setCvFile(null);
      return;
    }

    setCvError("");
    setCvFile(file);
  };

  const handleCvUpload = async () => {
    if (!cvFile) return;
    setCvUploading(true);
    setCvError("");
    try {
      const result = await uploadCv(cvFile);
      setCvResult(result);
      setCvFile(null);
      setEditData(result.parsed_data);
      setPreviewMode("cv");
      setIsPreviewOpen(true);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not upload the CV";
      setCvError(message);
    } finally {
      setCvUploading(false);
    }
  };

  const handleDownloadCv = async (cvId: string) => {
    try {
      const blob = await downloadCv(cvId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = cvResult?.file_name || "cv.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not download the CV";
      setCvError(message);
    }
  };

  const handleDeleteCv = async (cvId: string) => {
    if (!confirm("Are you sure you want to delete this CV?")) return;
    try {
      await deleteCv(cvId);
      setCvResult(null);
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not delete the CV";
      setCvError(message);
    }
  };

  // Generic updater for top-level edit fields
  const updateEditField = <K extends keyof ImportedProfile>(key: K, value: ImportedProfile[K]) => {
    setEditData((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateEducation = (index: number, field: keyof EducationItem, value: string | boolean | null) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const education = prev.education.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      );
      return { ...prev, education };
    });
  };

  const addEducation = () => {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        education: [
          ...prev.education,
          {
            institution: "",
            degree: "",
            field: null,
            start_date: "",
            end_date: null,
            description: null,
          },
        ],
      };
    });
  };

  const removeEducation = (index: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      return { ...prev, education: prev.education.filter((_, i) => i !== index) };
    });
  };

  const updateExperience = (index: number, field: keyof ExperienceItem, value: string | boolean | null) => {
    setEditData((prev) => {
      if (!prev) return prev;
      const work_experience = prev.work_experience.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      );
      return { ...prev, work_experience };
    });
  };

  const addExperience = () => {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        work_experience: [
          ...prev.work_experience,
          {
            company: "",
            role: "",
            start_date: "",
            end_date: null,
            description: null,
            current: false,
          },
        ],
      };
    });
  };

  const removeExperience = (index: number) => {
    setEditData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        work_experience: prev.work_experience.filter((_, i) => i !== index),
      };
    });
  };

  if (profileLoading) {
    return (
      <div role="status" className="text-slate-400 text-sm">
        Loading profile...
      </div>
    );
  }

  const addTag = (field: keyof Pick<Profile, "target_roles" | "tech_stack" | "locations" | "languages">) => (tag: string) => {
    setForm((prev) => ({ ...prev, [field]: [...prev[field], tag] }));
  };

  const removeTag = (field: keyof Pick<Profile, "target_roles" | "tech_stack" | "locations" | "languages">) => (index: number) => {
    setForm((prev) => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Profile</h1>
      <p className="text-slate-400 text-sm mb-6">Manage your job search profile and preferences.</p>

      {success && (
        <div role="status" className="mb-4 rounded-lg bg-green-900/40 border border-green-700 px-4 py-2 text-sm text-green-300">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Target Preferences</h2>
          <div className="space-y-4">
            <TagInput
              label="Target Roles"
              tags={form.target_roles}
              onAdd={addTag("target_roles")}
              onRemove={removeTag("target_roles")}
              placeholder="e.g. Frontend Developer"
            />
            <TagInput
              label="Tech Stack"
              tags={form.tech_stack}
              onAdd={addTag("tech_stack")}
              onRemove={removeTag("tech_stack")}
              placeholder="e.g. React, TypeScript"
            />

            <Select
              label="Experience Level"
              value={form.experience_level}
              onChange={(e) => setForm((prev) => ({ ...prev, experience_level: e.target.value }))}
              options={EXPERIENCE_LEVELS}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Salary & Location</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Min Salary"
              type="number"
              min={0}
              value={form.min_salary ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, min_salary: e.target.value ? Number(e.target.value) : null }))}
              placeholder="50000"
            />
            <Input
              label="Max Salary"
              type="number"
              min={0}
              value={form.max_salary ?? ""}
              onChange={(e) => setForm((prev) => ({ ...prev, max_salary: e.target.value ? Number(e.target.value) : null }))}
              placeholder="120000"
            />
          </div>

          <div className="mt-4">
            <TagInput
              label="Locations"
              tags={form.locations}
              onAdd={addTag("locations")}
              onRemove={removeTag("locations")}
              placeholder="e.g. New York, Remote"
            />
          </div>

          <div className="mt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.remote_only}
                onChange={(e) => setForm((prev) => ({ ...prev, remote_only: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-500 bg-slate-800 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400"
              />
              <span className="text-sm text-slate-300">Remote only</span>
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Languages & Status</h2>
          <div className="space-y-4">
            <TagInput
              label="Languages"
              tags={form.languages}
              onAdd={addTag("languages")}
              onRemove={removeTag("languages")}
              placeholder="e.g. English, Spanish"
            />

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                className="w-4 h-4 rounded border-slate-500 bg-slate-800 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400"
              />
              <span className="text-sm text-slate-300">
                Active — include my profile in job matching
              </span>
            </label>
          </div>
        </Card>

        {/* Upload CV section */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Upload CV</h2>
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-500 p-8">
              <Upload aria-hidden="true" className="h-8 w-8 text-slate-400" />
              <p id={cvHintId} className="text-sm text-slate-400 text-center">
                PDF only, up to 10 MB
              </p>
              <input
                ref={cvInputRef}
                id={cvInputId}
                type="file"
                accept=".pdf,application/pdf"
                aria-label="CV file"
                aria-describedby={cvHintId}
                className="sr-only"
                onChange={handleCvFileSelect}
              />
              <Button type="button" variant="secondary" onClick={() => cvInputRef.current?.click()}>
                Choose PDF
              </Button>
            </div>

            {cvError && (
              <p role="alert" className="text-xs text-red-400">{cvError}</p>
            )}

            {/* Selected file info + upload button */}
            {cvFile && !cvUploading && (
              <div className="flex items-center justify-between rounded-lg bg-slate-700/50 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{cvFile.name}</p>
                  <p className="text-xs text-slate-400">{formatFileSize(cvFile.size)}</p>
                </div>
                <Button type="button" variant="primary" onClick={handleCvUpload}>
                  Upload
                </Button>
              </div>
            )}

            {/* Uploading state */}
            {cvUploading && (
              <div role="status" className="flex items-center justify-center py-4">
                <Button type="button" variant="primary" isLoading disabled>
                  Uploading...
                </Button>
              </div>
            )}

            {/* CV list */}
            {cvResult && (
              <div className="rounded-lg border border-slate-700 divide-y divide-slate-700">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{cvResult.file_name}</p>
                    <p className="text-xs text-slate-400">{formatFileSize(cvResult.file_size)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleDownloadCv(cvResult.id)}
                    >
                      Download
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => handleDeleteCv(cvResult.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Import profile section */}
        <Card>
          <h2 className="text-lg font-semibold text-white mb-4">Import profile</h2>
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-slate-300">Provider</legend>
              <div className="flex gap-2">
                {IMPORT_PROVIDERS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setProvider(id)}
                    aria-pressed={provider === id}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                      focusRing,
                      provider === id
                        ? "bg-blue-600 text-white"
                        : "bg-slate-700 text-slate-300 hover:bg-slate-600",
                    )}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <Input
              label="Profile URL"
              type="url"
              value={importUrl}
              error={importError}
              onChange={(e) => {
                setImportUrl(e.target.value);
                if (importError) setImportError("");
              }}
              placeholder={
                provider === "linkedin"
                  ? "https://linkedin.com/in/your-profile"
                  : "https://infojobs.net/your-profile"
              }
            />

            {/* Import button */}
            <Button type="button" variant="primary" isLoading={isImporting} onClick={handleImport}>
              Import
            </Button>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" isLoading={mutation.isPending}>
            Save Profile
          </Button>
        </div>
      </form>

      {/* Preview modal */}
      <Modal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} title={previewMode === "cv" ? "Preview — Parsed CV" : "Preview — Imported profile"}>
        {editData && (
          <div className="space-y-6">
            {/* Headline */}
            <Input
              label="Professional headline"
              value={editData.headline ?? ""}
              onChange={(e) => updateEditField("headline", e.target.value || null)}
            />

            {/* Summary */}
            <Textarea
              label="Summary"
              value={editData.summary ?? ""}
              onChange={(e) => updateEditField("summary", e.target.value || null)}
              rows={4}
            />

            {/* Skills */}
            <SkillTagInput
              skills={editData.skills}
              onAdd={(skill) => updateEditField("skills", [...editData.skills, skill])}
              onRemove={(index) =>
                updateEditField(
                  "skills",
                  editData.skills.filter((_, i) => i !== index),
                )
              }
            />

            {/* Education */}
            <fieldset className="space-y-3">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium text-slate-300">Education</legend>
                <button
                  type="button"
                  onClick={addEducation}
                  className={cn("flex items-center gap-1 rounded text-sm text-blue-400 hover:text-blue-300", focusRing)}
                >
                  <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                  Add education
                </button>
              </div>
              {editData.education.map((item, i) => (
                <Card key={i} className="relative">
                  <button
                    type="button"
                    onClick={() => removeEducation(i)}
                    aria-label={`Remove education entry ${i + 1}`}
                    className={cn("absolute top-2 right-2 rounded text-slate-400 hover:text-red-400", focusRing)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <div className="grid grid-cols-1 gap-3 pr-6 sm:grid-cols-2">
                    <Input
                      label="Institution"
                      value={item.institution}
                      onChange={(e) => updateEducation(i, "institution", e.target.value)}
                    />
                    <Input
                      label="Degree"
                      value={item.degree}
                      onChange={(e) => updateEducation(i, "degree", e.target.value)}
                    />
                    <Input
                      label="Field of study"
                      value={item.field ?? ""}
                      onChange={(e) => updateEducation(i, "field", e.target.value || null)}
                    />
                    <Input
                      label="Start date"
                      type="text"
                      value={item.start_date}
                      onChange={(e) => updateEducation(i, "start_date", e.target.value)}
                    />
                    <Input
                      label="End date"
                      type="text"
                      value={item.end_date ?? ""}
                      onChange={(e) => updateEducation(i, "end_date", e.target.value || null)}
                    />
                  </div>
                  <div className="mt-3">
                    <Textarea
                      label="Description"
                      value={item.description ?? ""}
                      onChange={(e) => updateEducation(i, "description", e.target.value || null)}
                      rows={2}
                    />
                  </div>
                </Card>
              ))}
            </fieldset>

            {/* Work Experience */}
            <fieldset className="space-y-3">
              <div className="flex items-center justify-between">
                <legend className="text-sm font-medium text-slate-300">Work experience</legend>
                <button
                  type="button"
                  onClick={addExperience}
                  className={cn("flex items-center gap-1 rounded text-sm text-blue-400 hover:text-blue-300", focusRing)}
                >
                  <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                  Add experience
                </button>
              </div>
              {editData.work_experience.map((item, i) => (
                <Card key={i} className="relative">
                  <button
                    type="button"
                    onClick={() => removeExperience(i)}
                    aria-label={`Remove experience entry ${i + 1}`}
                    className={cn("absolute top-2 right-2 rounded text-slate-400 hover:text-red-400", focusRing)}
                  >
                    <Trash2 aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <div className="grid grid-cols-1 gap-3 pr-6 sm:grid-cols-2">
                    <Input
                      label="Company"
                      value={item.company}
                      onChange={(e) => updateExperience(i, "company", e.target.value)}
                    />
                    <Input
                      label="Role"
                      value={item.role}
                      onChange={(e) => updateExperience(i, "role", e.target.value)}
                    />
                    <Input
                      label="Start date"
                      type="text"
                      value={item.start_date}
                      onChange={(e) => updateExperience(i, "start_date", e.target.value)}
                    />
                    <Input
                      label="End date"
                      type="text"
                      value={item.end_date ?? ""}
                      onChange={(e) => updateExperience(i, "end_date", e.target.value || null)}
                    />
                  </div>
                  <div className="mt-3 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.current}
                        onChange={(e) => updateExperience(i, "current", e.target.checked)}
                        className="w-4 h-4 rounded border-slate-500 bg-slate-800 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-400"
                      />
                      <span className="text-sm text-slate-300">Current job</span>
                    </label>
                    <Textarea
                      label="Description"
                      value={item.description ?? ""}
                      onChange={(e) => updateExperience(i, "description", e.target.value || null)}
                      rows={2}
                    />
                  </div>
                </Card>
              ))}
            </fieldset>

            {/* Save error */}
            {saveError && (
              <div role="alert" className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-2 text-sm text-red-300">
                {saveError}
              </div>
            )}

            {/* Modal footer buttons */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
              <Button type="button" variant="secondary" onClick={() => setIsPreviewOpen(false)}>
                Cancel
              </Button>
              {previewMode === "cv" ? (
                <Button
                  type="button"
                  variant="primary"
                  isLoading={previewMutation.isPending}
                  onClick={handlePreviewSave}
                >
                  Save to profile
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  isLoading={previewMutation.isPending}
                  onClick={handlePreviewSave}
                >
                  Save
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
