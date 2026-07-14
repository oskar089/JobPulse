import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { getAdminUsers, toggleUserRole } from "../lib/admin";
import type { UserListResponse } from "../types";
import { Loader2, ChevronLeft, ChevronRight, Shield, ShieldOff } from "lucide-react";

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, error } = useQuery<UserListResponse>({
    queryKey: ["admin-users", page],
    queryFn: () => getAdminUsers(page, limit),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: (params: { userId: string; role: string }) =>
      toggleUserRole(params.userId, params.role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });

  const totalPages = data?.pages ?? 1;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-slate-400 text-sm mt-1">
          View and manage all registered users.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
        </div>
      )}

      {error && (
        <Card className="mb-6">
          <div className="text-red-400 text-sm">Failed to load users.</div>
        </Card>
      )}

      {data && (
        <Card>
          {data.users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <ShieldOff className="w-12 h-12 mb-3 opacity-40" />
              <p className="text-sm font-medium">No users found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left text-slate-400">
                      <th className="pb-3 pr-4 font-medium">Name</th>
                      <th className="pb-3 pr-4 font-medium">Email</th>
                      <th className="pb-3 pr-4 font-medium">Role</th>
                      <th className="pb-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((user) => (
                      <tr key={user.id} className="border-b border-slate-800 text-white hover:bg-slate-800/50">
                        <td className="py-3 pr-4">
                          <span className="truncate max-w-32 inline-block">
                            {user.name || "—"}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-300 truncate max-w-48">
                          {user.email}
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={user.role === "admin" ? "info" : "default"}
                            className="capitalize"
                          >
                            {user.role === "admin" ? (
                              <Shield className="w-3 h-3 mr-1" />
                            ) : null}
                            {user.role}
                          </Badge>
                        </td>
                        <td className="py-3">
                          {user.role === "admin" ? (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                mutation.mutate({ userId: user.id, role: "user" })
                              }
                              title="Demote to user"
                              disabled={mutation.isPending}
                              className="text-xs px-2 py-1"
                            >
                              {mutation.variables?.userId === user.id && mutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <ShieldOff className="h-3 w-3" />
                              )}
                              Demote
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              onClick={() =>
                                mutation.mutate({ userId: user.id, role: "admin" })
                              }
                              title="Promote to admin"
                              disabled={mutation.isPending}
                              className="text-xs px-2 py-1"
                            >
                              {mutation.variables?.userId === user.id && mutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Shield className="h-3 w-3" />
                              )}
                              Promote
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-700 mt-4">
                <span className="text-sm text-slate-400">
                  Page {page} of {totalPages} ({data.total} total)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-3 py-1.5 text-xs"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-3 py-1.5 text-xs"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
