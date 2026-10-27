import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markNotificationRead,
  getNotificationPreferences,
  updateNotificationPreferences,
} from "../lib/notifications";
import { cn, focusRing } from "../lib/utils";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Toggle } from "../components/ui/Toggle";
import { Bell, CheckCircle, Check } from "lucide-react";
import type { NotificationPreferences } from "../types";

const SAVED_MESSAGE_MS = 2500;

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const typeVariants: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  match: "success",
  error: "danger",
  info: "info",
  warning: "warning",
};

const PREFERENCE_LABELS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  {
    key: "in_app",
    label: "In-app notifications",
    description: "Receive notifications inside the application",
  },
  {
    key: "email",
    label: "Email notifications",
    description: "Receive notifications via email",
  },
  {
    key: "on_submit",
    label: "Successful submissions",
    description: "Notify when an application is submitted successfully",
  },
  {
    key: "on_fail",
    label: "Failed applications",
    description: "Notify when an application fails",
  },
  {
    key: "on_match",
    label: "New job matches",
    description: "Notify when new jobs match your profile",
  },
];

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const { data: notifications, isLoading, isError } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
  });

  const { data: preferences, isError: preferencesError } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: getNotificationPreferences,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const updatePrefsMutation = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (saved) => {
      // Write the saved value straight into the cache so the next toggle never reads stale preferences
      queryClient.setQueryData(["notification-preferences"], saved);
      setShowSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setShowSaved(false), SAVED_MESSAGE_MS);
    },
  });

  const handleToggle = (key: keyof NotificationPreferences) => {
    if (!preferences) return;
    setShowSaved(false);
    updatePrefsMutation.mutate({
      ...preferences,
      [key]: !preferences[key],
    });
  };

  if (isLoading) {
    return (
      <>
        <h1 className="sr-only">Notifications</h1>
        <p role="status" className="text-sm text-slate-400">Loading notifications...</p>
      </>
    );
  }

  const sorted = notifications
    ? [...notifications].sort(
        (a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime(),
      )
    : [];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Notifications</h1>
      <p className="mb-6 text-sm text-slate-400">
        Stay updated on your applications and matches.
      </p>

      {/* Notification Preferences */}
      <Card className="mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Notification Preferences</h2>
          <span role="status" className="flex items-center gap-1 text-xs text-green-400">
            {showSaved && (
              <>
                <Check aria-hidden="true" className="h-3.5 w-3.5" />
                Preferences saved
              </>
            )}
          </span>
        </div>
        <p className="mb-4 mt-1 text-xs text-slate-400">
          Choose which notification types and channels you want to receive.
        </p>
        <div role="alert">
          {preferencesError && (
            <p className="mb-3 text-sm text-red-400">Could not load your preferences.</p>
          )}
          {updatePrefsMutation.isError && (
            <p className="mb-3 text-sm text-red-400">
              Could not save your preferences: {updatePrefsMutation.error.message}
            </p>
          )}
        </div>
        <ul className="space-y-3">
          {PREFERENCE_LABELS.map(({ key, label, description }) => (
            <li key={key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-200">{label}</p>
                <p className="text-xs text-slate-400">{description}</p>
              </div>
              <Toggle
                label={label}
                checked={preferences?.[key] ?? false}
                onChange={() => handleToggle(key)}
                disabled={!preferences || updatePrefsMutation.isPending}
              />
            </li>
          ))}
        </ul>
      </Card>

      {/* Notifications List */}
      <h2 className="sr-only">Notification history</h2>
      <div role="alert">
        {isError && <p className="mb-3 text-sm text-red-400">Could not load notifications.</p>}
        {markReadMutation.isError && (
          <p className="mb-3 text-sm text-red-400">
            Could not mark the notification as read: {markReadMutation.error.message}
          </p>
        )}
      </div>
      {sorted.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Bell aria-hidden="true" className="mb-3 h-12 w-12 opacity-40" />
            <p className="text-sm font-medium">No notifications yet</p>
            <p className="mt-1 text-xs">
              You&apos;ll get notified when new jobs match your profile
            </p>
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {sorted.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                "rounded-lg border p-4 transition-colors",
                notification.is_read
                  ? "border-slate-700 bg-slate-800/50"
                  : "border-blue-700/50 bg-slate-800",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    notification.is_read ? "bg-slate-600" : "bg-blue-500",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={cn(
                        "truncate text-sm font-medium",
                        notification.is_read ? "text-slate-400" : "text-white",
                      )}
                    >
                      <span className="sr-only">{notification.is_read ? "Read: " : "Unread: "}</span>
                      {notification.title}
                    </h3>
                    <Badge variant={typeVariants[notification.type] || "default"}>
                      {notification.type}
                    </Badge>
                    {notification.is_read && (
                      <CheckCircle aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-green-400" />
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                    {notification.body}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                    <time dateTime={notification.sent_at} className="text-xs text-slate-400">
                      {timeAgo(notification.sent_at)}
                    </time>
                    {!notification.is_read && (
                      <button
                        type="button"
                        onClick={() => markReadMutation.mutate(notification.id)}
                        disabled={markReadMutation.isPending && markReadMutation.variables === notification.id}
                        className={cn(
                          "flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-400 transition-colors hover:bg-slate-700 hover:text-blue-300 disabled:opacity-50",
                          focusRing,
                        )}
                      >
                        <Check aria-hidden="true" className="h-3 w-3" />
                        Mark as read
                        <span className="sr-only">: {notification.title}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
