import { useEffect, useRef, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import { listNotifications } from "../lib/notifications";
import {
  LayoutDashboard,
  User,
  Globe,
  Briefcase,
  Bell,
  LogOut,
  Shield,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";

const APP_NAME = "Search Jobs";
const MAX_BADGE_COUNT = 99;
const MOBILE_NAV_ID = "mobile-navigation";

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const focusRing =
  "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-800";

function getNavItems(userRole?: string): NavItem[] {
  return [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Profile", path: "/profile", icon: User },
    { label: "Portals", path: "/portals", icon: Globe },
    { label: "Applications", path: "/applications", icon: Briefcase },
    { label: "Notifications", path: "/notifications", icon: Bell },
    ...(userRole === "admin" ? [{ label: "Admin", path: "/admin", icon: Shield }] : []),
  ];
}

function findPageLabel(navItems: NavItem[], pathname: string): string | undefined {
  const exactMatch = navItems.find((item) => item.path === pathname);
  if (exactMatch) return exactMatch.label;
  return navItems.find((item) => pathname.startsWith(`${item.path}/`))?.label;
}

interface NavLinksProps {
  navItems: NavItem[];
  pathname: string;
  unreadCount: number;
}

function NavLinks({ navItems, pathname, unreadCount }: NavLinksProps) {
  return (
    <ul className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.path;
        const showUnread = item.path === "/notifications" && unreadCount > 0;
        return (
          <li key={item.path}>
            <Link
              to={item.path}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                focusRing,
                isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-700",
              )}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              {item.label}
              {showUnread && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white ring-1 ring-white/40">
                  <span aria-hidden="true">
                    {unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unreadCount}
                  </span>
                  <span className="sr-only">
                    {`${unreadCount} unread ${unreadCount === 1 ? "notification" : "notifications"}`}
                  </span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Layout() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navItems = getNavItems(user?.role);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previousPathname = useRef(pathname);

  const { data: notifs } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
  const unreadCount = notifs?.filter((n) => !n.is_read).length ?? 0;
  const pageLabel = findPageLabel(navItems, pathname);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  useEffect(() => {
    document.title = pageLabel ? `${pageLabel} | ${APP_NAME}` : APP_NAME;
  }, [pageLabel]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    setIsMobileNavOpen(false);
    mainRef.current?.focus();
  }, [pathname]);

  useEffect(() => {
    if (!isMobileNavOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsMobileNavOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavOpen]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900">
        <div role="status" className="text-slate-400 text-sm">
          Loading...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen bg-slate-900">
      <a
        href="#main-content"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white",
          focusRing,
        )}
      >
        Skip to main content
      </a>

      <aside className="hidden md:flex w-64 flex-col bg-slate-800 border-r border-slate-700">
        <div className="flex h-16 items-center px-6 border-b border-slate-700">
          <p className="text-lg font-bold text-white">{APP_NAME}</p>
        </div>
        <nav aria-label="Main navigation" className="flex-1 p-3">
          <NavLinks navItems={navItems} pathname={pathname} unreadCount={unreadCount} />
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button
            type="button"
            onClick={logout}
            className={cn(
              "flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors",
              focusRing,
            )}
          >
            <LogOut className="w-5 h-5" aria-hidden="true" />
            Logout
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="relative border-b border-slate-700 bg-slate-800">
          <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
            <div className="flex items-center gap-2 md:hidden">
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setIsMobileNavOpen((open) => !open)}
                aria-expanded={isMobileNavOpen}
                aria-controls={MOBILE_NAV_ID}
                aria-label={isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
                className={cn("rounded-lg p-2 text-slate-300 hover:bg-slate-700 hover:text-white", focusRing)}
              >
                {isMobileNavOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
              <p className="text-lg font-bold text-white">{APP_NAME}</p>
            </div>
            <p className="truncate text-sm text-slate-300 md:text-base">
              Welcome, <span className="font-semibold text-white">{user?.name || user?.email}</span>
            </p>
            <button
              type="button"
              onClick={logout}
              className={cn("md:hidden rounded-lg px-2 py-1 text-sm text-slate-400 hover:text-white", focusRing)}
            >
              Logout
            </button>
          </div>

          <nav
            id={MOBILE_NAV_ID}
            aria-label="Main navigation"
            hidden={!isMobileNavOpen}
            className="absolute inset-x-0 top-full z-40 border-b border-slate-700 bg-slate-800 p-3 shadow-lg md:hidden"
          >
            <NavLinks navItems={navItems} pathname={pathname} unreadCount={unreadCount} />
          </nav>
        </header>

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 overflow-auto p-6 focus:outline-hidden"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
