import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Visible keyboard focus indicator for custom-styled buttons and links. */
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900";

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Returns the URL only when it is an absolute http(s) URL, so untrusted values
 * (scraped job links, imported profiles) can never become `javascript:` or
 * `data:` hrefs. Returns null for anything else.
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.trim());
    return SAFE_URL_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}
