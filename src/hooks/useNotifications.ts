import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  markTicketNotificationsRead,
  type AppNotification,
} from "@/lib/notifications.functions";
import { useAccount } from "@/hooks/useAccount";

/**
 * Role-based in-app notifications. Every row is already scoped to the
 * signed-in user by RLS, so a user only ever sees their own alerts.
 */
export function useNotifications() {
  const fetchNotifications = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const markTicket = useServerFn(markTicketNotificationsRead);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { account, isTechnician } = useAccount();
  const userId = account?.userId ?? account?.profile?.id ?? null;
  const toasted = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(),
    staleTime: 15_000,
  });

  const notifications = (query.data ?? []) as AppNotification[];
  const unread = notifications.filter((n) => !n.read_at);

  // Popup toasts for anything that arrives after the first load.
  useEffect(() => {
    if (query.isLoading) return;
    if (!seeded.current) {
      for (const n of notifications) toasted.current.add(n.id);
      seeded.current = true;
      return;
    }
    for (const n of notifications) {
      if (toasted.current.has(n.id) || n.read_at) continue;
      toasted.current.add(n.id);
      showToast(n);
    }
    function showToast(n: AppNotification) {
      const options = {
        description: n.message ?? undefined,
        duration: n.severity === "critical" ? 12_000 : 7_000,
        action: n.ticket_id
          ? {
              label: n.kind === "new_job" ? "My Jobs" : "View ticket",
              onClick: () => {
                void markRead({ data: { id: n.id } }).then(() =>
                  queryClient.invalidateQueries({ queryKey: ["notifications"] }),
                );
                if (n.kind === "new_job") navigate({ to: "/schedule" });
                else navigate({ to: "/tickets/$ticketId", params: { ticketId: n.ticket_id! } });
              },
            }
          : undefined,
      };
      if (n.severity === "critical") toast.error(n.title, options);
      else if (n.severity === "warning") toast.warning(n.title, options);
      else toast.success(n.title, options);
    }
  }, [notifications, query.isLoading, markRead, navigate, queryClient]);

  // Realtime delivery of the user's own notifications.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`app_notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const readOne = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: invalidate,
  });
  const readAll = useMutation({ mutationFn: () => markAll(), onSuccess: invalidate });
  const readTicket = useMutation({
    mutationFn: (ticketId: string) => markTicket({ data: { ticketId } }),
    onSuccess: invalidate,
  });

  return {
    notifications,
    unread,
    unreadCount: unread.length,
    newJobCount: unread.filter((n) => n.kind === "new_job").length,
    isTechnician,
    markRead: (id: string) => readOne.mutate(id),
    markAllRead: () => readAll.mutate(),
    markTicketRead: (ticketId: string) => readTicket.mutate(ticketId),
  };
}
