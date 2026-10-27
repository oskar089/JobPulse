import { api } from "./api";
import type { DryRunResult, Portal, PortalCreate } from "../types";

export function listPortals(): Promise<Portal[]> {
  return api<Portal[]>("/portals");
}

export function createPortal(data: PortalCreate): Promise<Portal> {
  return api<Portal>("/portals", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getPortal(id: string): Promise<Portal> {
  return api<Portal>(`/portals/${encodeURIComponent(id)}`);
}

export function updatePortal(id: string, data: PortalCreate): Promise<Portal> {
  return api<Portal>(`/portals/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deletePortal(id: string): Promise<void> {
  return api<void>(`/portals/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function togglePortal(id: string): Promise<Portal> {
  return api<Portal>(`/portals/${encodeURIComponent(id)}/toggle`, { method: "PATCH" });
}

export function dryRunPortal(id: string, testUrl?: string): Promise<DryRunResult> {
  const query = testUrl ? `?test_url=${encodeURIComponent(testUrl)}` : "";
  return api<DryRunResult>(`/portals/${encodeURIComponent(id)}/dry-run${query}`, { method: "POST" });
}
