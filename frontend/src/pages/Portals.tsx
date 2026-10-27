import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listPortals, createPortal, updatePortal, deletePortal, togglePortal, dryRunPortal } from "../lib/portals";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { PortalEditor } from "./PortalEditor";
import { DryRunModal } from "../components/DryRunModal";
import type { DryRunJob, Portal, PortalCreate } from "../types";
import { Globe, Plus, Pencil, Trash2, Power, PowerOff, Play } from "lucide-react";

export default function PortalsPage() {
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPortal, setEditingPortal] = useState<Portal | undefined>(undefined);
  const [portalToDelete, setPortalToDelete] = useState<Portal | null>(null);
  const [dryRunId, setDryRunId] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<{ jobs: DryRunJob[]; error?: string } | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);

  const { data: portals, isLoading, isError } = useQuery({
    queryKey: ["portals"],
    queryFn: listPortals,
  });

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingPortal(undefined);
  };

  const createMutation = useMutation({
    mutationFn: createPortal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portals"] });
      closeEditor();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PortalCreate }) =>
      updatePortal(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portals"] });
      closeEditor();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deletePortal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portals"] });
      setPortalToDelete(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: togglePortal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portals"] });
    },
  });

  const saveError = createMutation.error ?? updateMutation.error;

  const handleSave = (data: PortalCreate) => {
    if (editingPortal) {
      updateMutation.mutate({ id: editingPortal.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditor = (portal?: Portal) => {
    createMutation.reset();
    updateMutation.reset();
    setEditingPortal(portal);
    setEditorOpen(true);
  };

  const openDeleteConfirm = (portal: Portal) => {
    deleteMutation.reset();
    setPortalToDelete(portal);
  };

  const handleDryRun = async (id: string) => {
    setDryRunId(id);
    setDryRunLoading(true);
    setDryRunResult(null);
    try {
      const result = await dryRunPortal(id);
      setDryRunResult(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Dry run failed";
      setDryRunResult({ jobs: [], error: message });
    } finally {
      setDryRunLoading(false);
    }
  };

  const closeDryRun = () => {
    setDryRunId(null);
    setDryRunResult(null);
  };

  if (isLoading) {
    return (
      <>
        <h1 className="sr-only">Portals</h1>
        <p role="status" className="text-sm text-slate-400">Loading portals...</p>
      </>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Portals</h1>
          <p className="mt-1 text-sm text-slate-400">
            Configure job portal scraping sources.
          </p>
        </div>
        <Button onClick={() => openEditor()}>
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add Portal
        </Button>
      </div>

      <div role="alert">
        {isError && (
          <p className="mb-4 text-sm text-red-400">Could not load portals.</p>
        )}
        {toggleMutation.isError && (
          <p className="mb-4 text-sm text-red-400">
            Could not update the portal: {toggleMutation.error.message}
          </p>
        )}
      </div>

      {portals && portals.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Globe aria-hidden="true" className="mb-3 h-12 w-12 opacity-40" />
            <p className="text-sm font-medium">No portals configured</p>
            <p className="mt-1 text-xs">
              Add a portal to start scraping job listings
            </p>
          </div>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {portals?.map((portal) => {
            const isToggling = toggleMutation.isPending && toggleMutation.variables === portal.id;
            return (
              <li key={portal.id}>
                <Card className="h-full">
                  <div className="mb-3 flex items-start justify-between">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-white">{portal.name}</h2>
                      <p className="mt-0.5 truncate text-xs text-slate-400">
                        {portal.base_url}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {portal.is_builtin && <Badge variant="info">Built-in</Badge>}
                      <Badge variant={portal.is_enabled ? "success" : "default"}>
                        {portal.is_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>

                  <p className="mb-3 text-xs text-slate-400">
                    Interval: every {portal.scrape_interval_min} min
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => toggleMutation.mutate(portal.id)}
                      disabled={isToggling}
                      title={portal.is_enabled ? "Disable" : "Enable"}
                      aria-label={`${portal.is_enabled ? "Disable" : "Enable"} ${portal.name}`}
                    >
                      {portal.is_enabled ? (
                        <PowerOff aria-hidden="true" className="h-4 w-4" />
                      ) : (
                        <Power aria-hidden="true" className="h-4 w-4" />
                      )}
                    </Button>
                    {!portal.is_builtin && (
                      <>
                        <Button
                          variant="ghost"
                          onClick={() => openEditor(portal)}
                          title="Edit"
                          aria-label={`Edit ${portal.name}`}
                        >
                          <Pencil aria-hidden="true" className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => openDeleteConfirm(portal)}
                          title="Delete"
                          aria-label={`Delete ${portal.name}`}
                        >
                          <Trash2 aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="secondary"
                      onClick={() => handleDryRun(portal.id)}
                      isLoading={dryRunLoading && dryRunId === portal.id}
                      title="Test scrape"
                      aria-label={`Test scrape ${portal.name}`}
                    >
                      <Play aria-hidden="true" className="h-4 w-4" />
                      Test
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Modal isOpen={!!portalToDelete} onClose={() => setPortalToDelete(null)} title="Delete Portal">
        <p className="mb-4 text-sm text-slate-300">
          Are you sure you want to delete {portalToDelete?.name}? This action cannot be undone.
        </p>
        {deleteMutation.isError && (
          <p role="alert" className="mb-4 text-sm text-red-400">
            Could not delete the portal: {deleteMutation.error.message}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setPortalToDelete(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => portalToDelete && deleteMutation.mutate(portalToDelete.id)}
            isLoading={deleteMutation.isPending}
          >
            Delete
          </Button>
        </div>
      </Modal>

      {/* Mounted only while open (keyed by portal) so the form state resets for every edit */}
      {editorOpen && (
        <PortalEditor
          key={editingPortal?.id ?? "new"}
          isOpen
          onClose={closeEditor}
          onSave={handleSave}
          portal={editingPortal}
          isLoading={createMutation.isPending || updateMutation.isPending}
          error={saveError?.message}
        />
      )}

      <DryRunModal
        isOpen={!!dryRunId}
        onClose={closeDryRun}
        jobs={dryRunResult?.jobs ?? []}
        error={dryRunResult?.error}
        isLoading={dryRunLoading}
      />
    </div>
  );
}
