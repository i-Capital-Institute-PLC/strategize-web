"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { GET_NOTIFICATIONS } from "@/lib/graphql/queries/notifications";
import {
  UPDATE_NOTIFICATION,
  REMOVE_NOTIFICATION,
  MARK_ALL_NOTIFICATIONS_READ,
} from "@/lib/graphql/mutations/notifications";
import { useAuthContext } from "@/providers/AuthProvider";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import {
  Bell,
  Search,
  CheckCheck,
  Check,
  X,
  BookOpen,
  Clock,
  Target,
  Inbox,
  ArrowRight,
  ExternalLink,
  ClipboardList,
  UserCheck,
  Timer,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getNotificationCategory,
  type NotificationTab,
} from "@/components/dashboard/NotificationDropdown";

export default function NotificationsPage() {
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
      limit: 100,
      recipientUserId: user?.employeeId,
    },
    skip: !user?.employeeId,
    pollInterval: 600_000,
    fetchPolicy: "cache-and-network",
  });

  const [updateNotification] = useMutation(UPDATE_NOTIFICATION);
  const [removeNotification] = useMutation(REMOVE_NOTIFICATION);
  const [markAllReadMutation] = useMutation(MARK_ALL_NOTIFICATIONS_READ);

  const rawNotifications = useMemo(() => {
    return (data?.notifications?.items || []).filter(
      (n: any) => n.recipient != null && !dismissedIds.has(n.notificationId),
    );
  }, [data?.notifications?.items, dismissedIds]);

  // Check if notification is read with instant local state fallback
  const isNotificationRead = (n: any) => {
    if (readOverrides[n.notificationId] !== undefined) {
      return readOverrides[n.notificationId];
    }
    return n.status === "READ";
  };

  const unreadCount = useMemo(() => {
    return rawNotifications.filter((n: any) => !isNotificationRead(n)).length;
  }, [rawNotifications, readOverrides]);

  // Tab unread counts
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

    if (activeTab !== "all") {
      list = list.filter((n: any) => getNotificationCategory(n) === activeTab);
    }

    if (unreadOnly) {
      list = list.filter((n: any) => !isNotificationRead(n));
    }

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

    // 1. Instant local override
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
      console.error("Failed to update status:", err);
    }
  };

  // Mark all notifications as read
  const markAllAsRead = async () => {
    const unreads = rawNotifications.filter((n: any) => !isNotificationRead(n));
    if (unreads.length === 0) return;

    // 1. Instant UI update
    const updatedOverrides: Record<string, boolean> = { ...readOverrides };
    unreads.forEach((n: any) => {
      updatedOverrides[n.notificationId] = true;
    });
    setReadOverrides(updatedOverrides);

    // 2. Persist to backend
    try {
      if (user?.employeeId) {
        await markAllReadMutation({
          variables: { recipientUserId: user.employeeId },
        });
      }
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
    } else {
      router.push("/dashboard/approvals");
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

      router.push(url);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Notification Center
            </h1>
            {unreadCount > 0 && (
              <span className="bg-blue-600 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full shadow-sm">
                {unreadCount} Unread
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Stay updated on logbook reviews, task check-ins, strategy cascades,
            and approval requests.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark all as read</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Tab Section */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        {/* Search & Unread Toggle */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <button
            onClick={() => setUnreadOnly((prev) => !prev)}
            className={cn(
              "px-4 py-2 text-xs font-semibold rounded-xl whitespace-nowrap transition-all flex items-center justify-center gap-2",
              unreadOnly
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                unreadOnly ? "bg-white" : "bg-blue-600",
              )}
            />
            <span>Unread only</span>
          </button>
        </div>

        {/* 4 Segmented Category Tabs with Live Badges */}
        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-2 shrink-0",
              activeTab === "all"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
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
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-2 shrink-0",
              activeTab === "logbook"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
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
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-2 shrink-0",
              activeTab === "checkin"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
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
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-2 shrink-0",
              activeTab === "strategy"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
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
              "px-3.5 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-2 shrink-0",
              activeTab === "requests"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200",
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
      </div>

      {/* Cards Stream */}
      <div className="space-y-3">
        {loading && rawNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
            <p className="text-sm">Loading your notifications...</p>
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

            let iconNode = <ClipboardList className="w-5 h-5 text-white" />;
            let iconContainerBg = "bg-blue-600";
            let badgeBg =
              "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
            let badgeLabel = "LOGBOOK ENTRY";

            if (category === "requests") {
              iconNode = <UserCheck className="w-5 h-5 text-white" />;
              iconContainerBg = "bg-purple-600";
              badgeBg =
                "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
              badgeLabel = "APPROVAL REQUEST";
            } else if (category === "checkin") {
              iconNode = <Timer className="w-5 h-5 text-white" />;
              iconContainerBg = "bg-emerald-600";
              badgeBg =
                "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
              badgeLabel = "CHECK-IN REMINDER";
            } else if (category === "strategy") {
              if (isQuotaNotice) {
                iconNode = (
                  <Lock className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                );
                iconContainerBg = "bg-slate-200 dark:bg-slate-800";
                badgeBg =
                  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                badgeLabel = "QUARTERLY QUOTA";
              } else {
                iconNode = <Target className="w-5 h-5 text-white" />;
                iconContainerBg = "bg-indigo-600";
                badgeBg =
                  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300";
                badgeLabel = "STRATEGY UPDATE";
              }
            } else if (isQuotaNotice) {
              iconNode = (
                <Lock className="w-5 h-5 text-slate-700 dark:text-slate-300" />
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
                  "group relative flex items-start gap-4 p-5 rounded-2xl border bg-white dark:bg-slate-900 shadow-sm transition-all cursor-pointer",
                  isUnread
                    ? "border-blue-200 dark:border-blue-900/60 shadow-blue-50/50 dark:shadow-none"
                    : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700",
                )}
              >
                {/* Left Category Icon with Unread Dot */}
                <div className="relative shrink-0 mt-0.5">
                  <div
                    className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center shadow-sm",
                      iconContainerBg,
                    )}
                  >
                    {iconNode}
                  </div>
                  {isUnread && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-600 ring-2 ring-white dark:ring-slate-900" />
                  )}
                </div>

                {/* Center Content */}
                <div className="flex-1 min-w-0 pr-16">
                  {/* Category Tag & Timestamp */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded tracking-wide uppercase",
                        badgeBg,
                      )}
                    >
                      {badgeLabel}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>

                  {/* Title */}
                  <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug">
                    {notification.title}
                  </p>

                  {/* Message */}
                  {notification.message && (
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                      {notification.message}
                    </p>
                  )}

                  {/* Action Row */}
                  <div className="mt-4 flex items-center gap-2">
                    {resolvedState ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg",
                          resolvedState === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
                        )}
                      >
                        <Check className="w-4 h-4" />
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
                              router.push("/dashboard/approvals?tab=logbook");
                            }}
                            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition-colors"
                          >
                            <span>Review Entry</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {category === "requests" && (
                          <>
                            {isApprover ? (
                              <div className="flex items-center gap-2.5">
                                <button
                                  onClick={(e) =>
                                    handleInlineAction(
                                      notification,
                                      "REJECT",
                                      e,
                                    )
                                  }
                                  className="text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-3 py-2 rounded-xl transition-colors"
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
                                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition-colors"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(
                                    "/dashboard/approvals/my-submissions",
                                  );
                                }}
                                className="inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                              >
                                <span>View Status</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}

                        {category === "checkin" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push("/dashboard/checkin");
                            }}
                            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-sm transition-colors"
                          >
                            <span>Check In Now</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {category === "strategy" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
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
                            className="inline-flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
                          >
                            <span>View Details</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Top-Right Micro Actions: Toggle Read / Unread & Dismiss */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5">
                  {/* Dismiss Button */}
                  <button
                    onClick={(e) =>
                      handleDismiss(notification.notificationId, e)
                    }
                    title="Dismiss"
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
              <Bell className="w-7 h-7 opacity-60" />
            </div>
            <p className="text-base font-semibold text-slate-700 dark:text-slate-300">
              All caught up!
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              No pending{" "}
              {activeTab === "all" ? "notifications" : `${activeTab} alerts`}{" "}
              require your attention.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
