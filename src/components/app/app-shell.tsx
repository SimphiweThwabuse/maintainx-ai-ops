import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Bot,
  Building2,
  CalendarClock,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Ticket,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { AssistantChat } from "./assistant-chat";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAccount } from "@/hooks/useAccount";
import { useNotifications } from "@/hooks/useNotifications";
import { ROLE_LABELS } from "@/lib/domain";
import { cn } from "@/lib/utils";


type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Roles allowed to see the item; empty means everyone. */
  roles?: string[];
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tickets", label: "Tickets", icon: Ticket },
  // Receptionist: Tickets, Clients, AI, Settings (no Schedule)
  { to: "/clients", label: "Clients", icon: Building2, roles: ["receptionist", "hotel_manager", "admin"] },
  { to: "/ai", label: "AI", icon: Bot, roles: ["receptionist", "hotel_manager", "admin"] },
  // Technician: Dashboard, Tickets, AI, Schedule, Settings (no Technicians/Clients/Reports)
  { to: "/schedule", label: "My Jobs", icon: CalendarClock, roles: ["technician", "admin"] },
  // Hotel Manager: Dashboard, Tickets, Technicians, Clients, Reports, Settings (no Assets/AI/Schedule)
  { to: "/technicians", label: "Technicians", icon: Users, roles: ["hotel_manager", "receptionist", "admin"] },
  { to: "/reports", label: "Reports", icon: TrendingUp, roles: ["hotel_manager", "admin"] },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { account, roles, primaryRole } = useAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notifications, unreadCount, newJobCount, markRead, markAllRead } = useNotifications();
  const isTechnicianOnly = roles.includes("technician" as never) && roles.length === 1;
  const showBell = !isTechnicianOnly;

  const items = NAV.filter((item) => !item.roles || item.roles.some((r) => roles.includes(r as never)));


  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const orgName =
    (account?.profile as { hotels?: { name?: string } | null })?.hotels?.name ??
    (account?.profile as { maintenance_companies?: { name?: string } | null })
      ?.maintenance_companies?.name ??
    "MaintainX";

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        <Brand inverted />
        <button
          className="rounded-md p-1 text-sidebar-foreground lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Main navigation">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-sidebar-primary data-[status=active]:text-sidebar-primary-foreground"
            activeProps={{ "aria-current": "page" }}
          >
            <item.icon className="size-4 shrink-0" aria-hidden />
            {item.label}
            {item.to === "/schedule" && newJobCount > 0 && (
              <span
                className="ml-auto flex min-w-5 items-center justify-center rounded-full bg-priority-critical px-1.5 py-0.5 text-[11px] font-bold text-priority-critical-foreground"
                aria-label={`${newJobCount} new assigned jobs`}
              >
                {newJobCount > 9 ? "9+" : newJobCount}
              </span>
            )}
          </Link>

        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="mb-2 px-1">
          <p className="truncate text-sm font-medium">{account?.profile?.full_name || "Staff"}</p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            {primaryRole ? ROLE_LABELS[primaryRole] : "—"} · {orgName}
          </p>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-navy/60"
            onClick={() => setOpen(false)}
            aria-label="Close navigation overlay"
          />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
        </div>
      )}

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-background/90 px-4 py-2 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1 basis-40">
            <h1 className="truncate text-base font-semibold sm:text-lg">{title}</h1>
            {description && (
              <p className="truncate text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          <div className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2")}>
            {actions}
            {showBell && (
              <NotificationBell
                notifications={notifications}
                unreadCount={unreadCount}
                markRead={markRead}
                markAllRead={markAllRead}
              />
            )}
            <ThemeToggle />
          </div>
        </header>
        <main className="min-w-0 overflow-x-hidden p-4 sm:p-6">{children}</main>
      </div>
      <AssistantChat audience={primaryRole ?? "receptionist"} />
    </div>
  );
}

export function PlaceholderPage({
  title,
  description,
  sprint,
  points,
}: {
  title: string;
  description: string;
  sprint: string;
  points: string[];
}) {
  return (
    <AppShell title={title} description={description}>
      <div className="surface-panel max-w-2xl p-6">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{sprint}</p>
        <h2 className="mt-2 text-lg font-semibold">Foundation ready</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This module is part of the permanent MaintainX structure. Sprint 1 establishes the
          navigation, data model and access rules; the functionality below is scheduled for a later
          sprint.
        </p>
        <ul className="mt-4 space-y-2">
          {points.map((point) => (
            <li key={point} className="flex gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </AppShell>
  );
}
