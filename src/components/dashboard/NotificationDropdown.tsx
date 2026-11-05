"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Bell,
  CheckCheck,
  Search,
  BookOpen,
  Clock,
  Target,
  Inbox,
  Check,
  X,
  ArrowRight,
  ExternalLink,
  ClipboardList,
  UserCheck,
  Timer,
  Lock,
} from "lucide-react";
import { useQuery, useMutation } from "@apollo/client";
import { GET_NOTIFICATIONS } from "@/lib/graphql/queries/notifications";
import {
  UPDATE_NOTIFICATION,
  REMOVE_NOTIFICATION,
  MARK_ALL_NOTIFICATIONS_READ,
} from "@/lib/graphql/mutations/notifications";
import { usePendingApprovalsBadge } from "@/providers/PendingApprovalsProvider";
import { useAuthContext } from "@/providers/AuthProvider";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type NotificationTab =
  | "all"
  | "logbook"
  | "checkin"
  | "strategy"
  | "requests";

export function getNotificationCategory(notification: {
  notificationType?: string | null;
  relatedEntityType?: string | null;
  title?: string | null;
  message?: string | null;
}): "logbook" | "checkin" | "strategy" | "requests" {
  const type = (notification.notificationType || "").toUpperCase();
  const entity = (notification.relatedEntityType || "").toUpperCase();
  const text = `${notification.title || ""} ${notification.message || ""}`.toLowerCase();

  // 1. Logbook category
  if (
    type.includes("LOGBOOK") ||
    entity.includes("LOGBOOK") ||
    text.includes("logbook") ||
    text.includes("deliverables") ||
    text.includes("quarterly quota") ||
    text.includes("quota adjustment")
  ) {
    return "logbook";
  }

  // 2. Check-in / Out category
  if (
    type.includes("CHECKIN") ||
    type.includes("CHECKOUT") ||
    type.includes("SESSION") ||
    entity.includes("CHECKIN") ||
    entity.includes("TASK") ||
    text.includes("check-in") ||
    text.includes("checkin") ||
    text.includes("checkout") ||
    text.includes("standup")
  ) {
    return "checkin";
  }

  // 3. Approval Requests category
  if (
    type.includes("APPROVAL") ||
    type.includes("REQUEST") ||
    type.includes("EVIDENCE") ||
    entity.includes("APPROVAL") ||
    entity.includes("SUBMISSION") ||
    text.includes("requested approval") ||
    text.includes("approval request") ||
    text.includes("redistribution")
  ) {
    return "requests";
  }

  // 4. Strategy / Objectives / KPIs category
  if (
    type.includes("OBJECTIVE") ||
    type.includes("KPI") ||
    type.includes("STRATEGY") ||
    type.includes("ASSIGNMENT") ||
    type.includes("EVALUATION") ||
    entity.includes("OBJECTIVE") ||
    entity.includes("KPI") ||
    text.includes("objective") ||
    text.includes("scorecard")
  ) {
    return "strategy";
  }

  return "strategy";
}

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationTab>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [readOverrides, setReadOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const [resolvedActions, setResolvedActions] = useState<
    Record<string, "APPROVED" | "REJECTED">
  >({});

  const { user } = useAuthContext();
  const router = useRouter();

  const isApprover =
    user?.role === "MANAGER" ||
    user?.role === "DIRECTOR" ||
    user?.role === "ADMIN" ||
    user?.role === "SUPER_ADMIN" ||
    user?.role === "COORDINATOR";

  // Polling every 10 minutes (600,000 ms) as specified by leadership
  const { data, loading, refetch } = useQuery(GET_NOTIFICATIONS, {
    variables: {
      page: 1,
      limit: 50,
      recipientUserId: user?.employeeId,
    },
    skip: !user?.employeeId,
    pollInterval: 600_000,
    fetchPolicy: "cache-and-network",
  });

  useEffect(() => {
    if (open && user?.employeeId) {
      void refetch();
    }
  }, [open, refetch, user?.employeeId]);

  const [updateNotification] = useMutation(UPDATE_NOTIFICATION);
  const [removeNotification] = useMutation(REMOVE_NOTIFICATION);
  const [markAllReadMutation] = useMutation(MARK_ALL_NOTIFICATIONS_READ);

  const rawNotifications = useMemo(() => {
    return (data?.notifications?.items || []).filter(
      (n: any) => n.recipient != null && !dismissedIds.has(n.notificationId),
    );
  }, [data?.notifications?.items, dismissedIds]);

  // Helper: check if notification is read accounting for local instant overrides
  const isNotificationRead = (n: any) => {
    if (readOverrides[n.notificationId] !== undefined) {
      return readOverrides[n.notificationId];
    }
    return n.status === "READ";
  };

  const unreadCount = useMemo(() => {
    return rawNotifications.filter((n: any) => !isNotificationRead(n)).length;
  }, [rawNotifications, readOverrides]);

  // The bell badge count strictly reflects unread notifications so marking as read immediately clears it
  const bellBadgeCount = unreadCount;

  // Category counts (unread counts per tab)
  const categoryCounts = useMemo(() => {
    const counts = {
      all: 0,
      logbook: 0,
      checkin: 0,
      strategy: 0,
      requests: 0,
    };

    rawNotifications.forEach((n: any) => {
      const cat = getNotificationCategory(n);
      if (!isNotificationRead(n)) {
        counts.all += 1;
        counts[cat] += 1;
      }
    });

    return counts;
  }, [rawNotifications, readOverrides]);

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    let list = rawNotifications;

    // Tab filter
    if (activeTab !== "all") {
      list = list.filter((n: any) => getNotificationCategory(n) === activeTab);
    }

    // Unread only toggle
    if (unreadOnly) {
      list = list.filter((n: any) => !isNotificationRead(n));
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (n: any) =>
          (n.title && n.title.toLowerCase().includes(q)) ||
          (n.message && n.message.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [rawNotifications, activeTab, unreadOnly, searchQuery, readOverrides]);

  // Toggle single notification between READ and UNREAD
  const toggleNotificationReadStatus = async (
    notification: any,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    const currentIsRead = isNotificationRead(notification);
    const nextStatus = currentIsRead ? "UNREAD" : "READ";

    // 1. Instant local state update (0ms lag)
    setReadOverrides((prev) => ({
      ...prev,
      [notification.notificationId]: !currentIsRead,
    }));

    // 2. Persist to backend
    try {
      await updateNotification({
        variables: {
          updateNotificationInput: {
            notificationId: notification.notificationId,
            status: nextStatus,
            readAt: nextStatus === "READ" ? new Date().toISOString() : null,
          },
        },
      });
      toast.success(
        nextStatus === "READ" ? "Marked as read" : "Marked as unread",
      );
      void refetch();
    } catch (err) {
      console.error("Failed to update notification status:", err);
    }
  };

  // Mark all notifications as read with instant UI update
  const markAllAsRead = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    const unreads = rawNotifications.filter((n: any) => !isNotificationRead(n));
    if (unreads.length === 0) return;

    // 1. Instantly override local state so unread badge drops to 0 immediately
    const updatedOverrides: Record<string, boolean> = { ...readOverrides };
    unreads.forEach((n: any) => {
      updatedOverrides[n.notificationId] = true;
    });
    setReadOverrides(updatedOverrides);

    // 2. Persist via backend mutation
    try {
      if (user?.employeeId) {
        await markAllReadMutation({
          variables: { recipientUserId: user.employeeId },
        });
      }
      // Also update individual unreads as reliable fallback
      await Promise.allSettled(
        unreads.map((n: any) =>
          updateNotification({
            variables: {
              updateNotificationInput: {
                notificationId: n.notificationId,
                status: "READ",
                readAt: new Date().toISOString(),
              },
            },
          }),
        ),
      );
      toast.success("All notifications marked as read");
      void refetch();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const handleDismiss = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds((prev) => new Set([...prev, notificationId]));
    try {
      await removeNotification({
        variables: { notificationId },
      });
      toast.success("Notification dismissed");
      void refetch();
    } catch (err) {
      // Silent fail
    }
  };

  const handleInlineAction = (
    notification: any,
    action: "APPROVE" | "REJECT",
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setResolvedActions((prev) => ({
      ...prev,
      [notification.notificationId]: action,
    }));
    // Also mark as read locally
    setReadOverrides((prev) => ({
      ...prev,
      [notification.notificationId]: true,
    }));

    if (action === "APPROVE") {
      toast.success(
        `Approved request for ${notification.title.slice(0, 30)}...`,
      );
    } else {
      toast.error(`Rejected request for ${notification.title.slice(0, 30)}...`);
    }

    if (
      notification.relatedEntityType === "logbook_entry" ||
      notification.relatedEntityType === "logbookentry"
    ) {
      router.push("/dashboard/approvals?tab=logbook");
      setOpen(false);
    } else {
      router.push("/dashboard/approvals");
      setOpen(false);
    }
  };

  const handleNotificationClick = async (notification: any) => {
    if (!isNotificationRead(notification)) {
      setReadOverrides((prev) => ({
        ...prev,
        [notification.notificationId]: true,
      }));
      void updateNotification({
        variables: {
          updateNotificationInput: {
            notificationId: notification.notificationId,
            status: "READ",
            readAt: new Date().toISOString(),
          },
        },
      });
    }

    if (notification.relatedEntityType && notification.relatedEntityId) {
      const entityType = notification.relatedEntityType.toLowerCase();
      let url = "/dashboard";

      switch (entityType) {
        case "objective":
          url = `/dashboard/objectives/${notification.relatedEntityId}`;
          break;
        case "kpi":
          url = `/dashboard/kpis/${notification.relatedEntityId}`;
          break;
        case "checkinoutsession":
          url = `/dashboard/checkin`;
          break;
        case "evaluation":
          url = `/dashboard/evaluations`;
          break;
        case "approval":
          url = `/dashboard/approvals`;
          break;
        case "logbook_entry":
        case "logbookentry":
          url = isApprover
            ? `/dashboard/approvals?tab=logbook`
            : `/dashboard/logbook`;
          break;
        case "logbook_evidence_approval":
          url = "/dashboard/evidence-requests";
          break;
        case "logbook_evidence_result":
          url = "/dashboard/logbook";
          break;
        default:
          url = "/dashboard";
      }

      setOpen(false);
      router.push(url);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative p-2.5 rounded-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors focus:outline-none"
          title="Notifications"
        >
          <Bell className="w-5 h-5 text-gray-700 dark:text-gray-200" />
          {bellBadgeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center">
              <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-red-400 opacity-40"></span>
              <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                {bellBadgeCount > 99 ? "99+" : bellBadgeCount}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[calc(100vw-1.5rem)] sm:w-[460px] max-w-[460px] p-0 overflow-hidden rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] z-50 animate-in fade-in-50 zoom-in-95"
      >
        {/* Header with clear Title and "Mark all as read" button */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-sm">
                {unreadCount} Unread
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline px-2 py-1 rounded-md transition-colors"
                title="Mark all notifications as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark all as read</span>
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                router.push("/dashboard/notifications");
              }}
              title="Open full page"
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Unread Filter Bar */}
        <div className="px-4 py-2.5 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/30">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={() => setUnreadOnly((prev) => !prev)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all flex items-center gap-1.5",
              unreadOnly
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                unreadOnly ? "bg-white" : "bg-blue-600",
              )}
            />
            Unread only
          </button>
        </div>

        {/* 4 Segmented Category Tabs with Live Badges */}
        <div className="px-3 pt-2.5 pb-2 flex items-center gap-1.5 overflow-x-auto custom-scrollbar border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0B0F17]">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 shrink-0",
              activeTab === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
            )}
          >
            <span>All</span>
            {categoryCounts.all > 0 && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                  activeTab === "all"
                    ? "bg-white/20 text-white"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
                )}
              >
                {categoryCounts.all}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("logbook")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 shrink-0",
              activeTab === "logbook"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Logbook</span>
            {categoryCounts.logbook > 0 && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                  activeTab === "logbook"
                    ? "bg-white/20 text-white"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
                )}
              >
                {categoryCounts.logbook}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("checkin")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 shrink-0",
              activeTab === "checkin"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Check In / Out</span>
            {categoryCounts.checkin > 0 && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                  activeTab === "checkin"
                    ? "bg-white/20 text-white"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
                )}
              >
                {categoryCounts.checkin}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("strategy")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 shrink-0",
              activeTab === "strategy"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
            )}
          >
            <Target className="w-3.5 h-3.5" />
            <span>Strategy</span>
            {categoryCounts.strategy > 0 && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                  activeTab === "strategy"
                    ? "bg-white/20 text-white"
                    : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
                )}
              >
                {categoryCounts.strategy}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("requests")}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 shrink-0",
              activeTab === "requests"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
            )}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Requests</span>
            {categoryCounts.requests > 0 && (
              <span
                className={cn(
                  "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                  activeTab === "requests"
                    ? "bg-white/20 text-white"
                    : "bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300",
                )}
              >
                {categoryCounts.requests}
              </span>
            )}
          </button>
        </div>

        {/* Notifications Card List */}
        <div className="flex flex-col max-h-[58vh] sm:max-h-[500px] overflow-y-auto custom-scrollbar p-3 gap-2.5 bg-slate-50/50 dark:bg-[#070A0F]">
          {loading && rawNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
              <p className="text-xs">Updating notifications...</p>
            </div>
          ) : filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification: any) => {
              const category = getNotificationCategory(notification);
              const isUnread = !isNotificationRead(notification);
              const isQuotaNotice =
                notification.title?.toLowerCase().includes("quota") ||
                notification.message?.toLowerCase().includes("quota");
              const resolvedState =
                resolvedActions[notification.notificationId];

              // Visual styling mapping matching the Stitch mockup
              let iconNode = <ClipboardList className="w-4 h-4 text-white" />;
              let iconContainerBg = "bg-blue-600";
              let badgeBg =
                "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
              let badgeLabel = "LOGBOOK ENTRY";

              if (category === "requests") {
                iconNode = <UserCheck className="w-4 h-4 text-white" />;
                iconContainerBg = "bg-purple-600";
                badgeBg =
                  "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
                badgeLabel = "APPROVAL REQUEST";
              } else if (category === "checkin") {
                iconNode = <Timer className="w-4 h-4 text-white" />;
                iconContainerBg = "bg-emerald-600";
                badgeBg =
                  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
                badgeLabel = "CHECK-IN REMINDER";
              } else if (category === "strategy") {
                if (isQuotaNotice) {
                  iconNode = (
                    <Lock className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                  );
                  iconContainerBg = "bg-slate-200 dark:bg-slate-800";
                  badgeBg =
                    "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                  badgeLabel = "QUARTERLY QUOTA";
                } else {
                  iconNode = <Target className="w-4 h-4 text-white" />;
                  iconContainerBg = "bg-indigo-600";
                  badgeBg =
                    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
                  badgeLabel = "STRATEGY UPDATE";
                }
              } else if (isQuotaNotice) {
                iconNode = (
                  <Lock className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                );
                iconContainerBg = "bg-slate-200 dark:bg-slate-800";
                badgeBg =
                  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                badgeLabel = "QUARTERLY QUOTA";
              }

              return (
                <div
                  key={notification.notificationId}
                  onClick={() => handleNotificationClick(notification)}
                  className={cn(
                    "group relative flex items-start gap-3 p-3.5 rounded-xl border bg-white dark:bg-slate-900/90 shadow-sm transition-all cursor-pointer",
                    isUnread
                      ? "border-blue-200 dark:border-blue-900/60 shadow-blue-50/50 dark:shadow-none"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
                  )}
                >
                  {/* Left Category Icon with Unread Dot */}
                  <div className="relative shrink-0 mt-0.5">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shadow-sm",
                        iconContainerBg,
                      )}
                    >
                      {iconNode}
                    </div>
                    {isUnread && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" />
                    )}
                  </div>

                  {/* Center Content */}
                  <div className="flex-1 min-w-0 pr-16">
                    {/* Category Tag & Timestamp */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase",
                          badgeBg,
                        )}
                      >
                        {badgeLabel}
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                        {formatDistanceToNow(
                          new Date(notification.createdAt),
                          { addSuffix: true },
                        )}
                      </span>
                    </div>

                    {/* Notification Title */}
                    <p className="text-xs sm:text-[13px] font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">
                      {notification.title}
                    </p>

                    {/* Notification Subtext */}
                    {notification.message && (
                      <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {notification.message}
                      </p>
                    )}

                    {/* Action Row */}
                    <div className="mt-3 flex items-center gap-2">
                      {resolvedState ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md",
                            resolvedState === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
                          )}
                        >
                          <Check className="w-3.5 h-3.5" />
                          {resolvedState === "APPROVED"
                            ? "Approved by You"
                            : "Rejected by You"}
                        </span>
                      ) : (
                        <>
                          {category === "logbook" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                router.push("/dashboard/approvals?tab=logbook");
                              }}
                              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                            >
                              <span>Review Entry</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          {category === "requests" && (
                            <>
                              {isApprover ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) =>
                                      handleInlineAction(
                                        notification,
                                        "REJECT",
                                        e,
                                      )
                                    }
                                    className="text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2.5 py-1.5 rounded-lg transition-colors"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    onClick={(e) =>
                                      handleInlineAction(
                                        notification,
                                        "APPROVE",
                                        e,
                                      )
                                    }
                                    className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Approve</span>
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpen(false);
                                    router.push(
                                      "/dashboard/approvals/my-submissions",
                                    );
                                  }}
                                  className="inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                                >
                                  <span>View Status</span>
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          )}

                          {category === "checkin" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                router.push("/dashboard/checkin");
                              }}
                              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                            >
                              <span>Check In Now</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}

                          {category === "strategy" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpen(false);
                                if (
                                  notification.relatedEntityType === "kpi" &&
                                  notification.relatedEntityId
                                ) {
                                  router.push(
                                    `/dashboard/kpis/${notification.relatedEntityId}`,
                                  );
                                } else {
                                  router.push("/dashboard/objectives");
                                }
                              }}
                              className="inline-flex items-center gap-1 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                            >
                              <span>View Details</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Top-Right Micro Actions: Toggle Read / Unread & Dismiss */}
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    {/* Dismiss Button */}
                    <button
                      onClick={(e) =>
                        handleDismiss(notification.notificationId, e)
                      }
                      title="Dismiss"
                      className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800/60 flex items-center justify-center text-slate-400 mb-2.5">
                <Bell className="w-6 h-6 opacity-60" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                All caught up!
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                No pending{" "}
                {activeTab === "all" ? "notifications" : `${activeTab} alerts`}{" "}
                require your attention.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-[#0B0F17] flex justify-end items-center text-xs">
          <button
            onClick={() => {
              setOpen(false);
              router.push("/dashboard/notifications");
            }}
            className="text-blue-600 dark:text-blue-400 hover:underline font-semibold flex items-center gap-1"
          >
            <span>Open Notification Center</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
