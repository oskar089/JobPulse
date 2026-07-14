import { api } from "./api";
import type { AdminAnalytics, UserListResponse, AdminUser } from "../types";

export async function getAdminAnalytics(window: string): Promise<AdminAnalytics> {
  return api<AdminAnalytics>(`/admin/analytics?window=${encodeURIComponent(window)}`);
}

export async function getAdminUsers(page: number, limit: number): Promise<UserListResponse> {
  return api<UserListResponse>(`/admin/users?page=${page}&limit=${limit}`);
}

export async function toggleUserRole(userId: string, role: string): Promise<AdminUser> {
  return api<AdminUser>(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}
