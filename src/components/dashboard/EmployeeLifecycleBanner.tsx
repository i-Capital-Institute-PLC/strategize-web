"use client";

import React, { useState } from "react";
import { useQuery } from "@apollo/client";
import { useAuthStore } from "@/stores";
import { GET_DEPARTURE_CLEARANCE_REQUESTS } from "@/lib/graphql/queries/target-rebalancing";
import { ShieldAlert, ArrowRightLeft, X, History, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function EmployeeLifecycleBanner() {
  const user = useAuthStore((state) => state.user);
  const [isDismissed, setIsDismissed] = useState(false);

  const { data } = useQuery(GET_DEPARTURE_CLEARANCE_REQUESTS, {
    variables: {
      status: "APPROVED" as any,
    },
    skip: !user?.employeeId,
    fetchPolicy: "cache-first",
  });

  if (!user || isDismissed) return null;

  const isOffboarded = user.status === "DISABLED";
  const userDept = user.departments?.[0]?.name;

  // Check if current user has an approved clearance request
  const requests: any[] = data?.departureClearanceRequests || [];
  const myApprovedRequest = requests.find(
    (r) => r.employeeId === user.employeeId && r.status === "APPROVED",
  );

  const isTransfer =
    myApprovedRequest?.requestType === "TRANSFER" ||
    (myApprovedRequest?.reason &&
      myApprovedRequest.reason.includes("[INTERNAL_TRANSFER"));

  // 1. Offboarded / Departed Account Banner
  if (isOffboarded) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-amber-50/80 to-amber-100/60 p-4 shadow-sm dark:border-amber-700/60 dark:from-amber-950/40 dark:via-amber-950/30 dark:to-amber-900/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200/70 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-amber-950 dark:text-amber-200">
                  Account Status: Offboarded
                </h3>
                <Badge className="bg-amber-200 text-amber-900 dark:bg-amber-900/80 dark:text-amber-200 border-amber-400 text-[11px] font-semibold">
                  HR Clearance Approved
                </Badge>
              </div>
              <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed max-w-4xl">
                Your employment clearance has been finalized. All historical performance data, completed Q1 evaluations, and approved logbooks are safely preserved for your records. New write actions (logbook submissions, check-ins, task requests, and target updates) are closed.
              </p>
              {myApprovedRequest?.effectiveDate && (
                <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-800/80 dark:text-amber-300/80 font-medium">
                  <History className="h-3.5 w-3.5" />
                  <span>Effective Date: {new Date(myApprovedRequest.effectiveDate).toLocaleDateString()}</span>
                  {myApprovedRequest.department?.name && (
                    <span>• Department: {myApprovedRequest.department.name}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Transferred Employee Banner
  if (isTransfer || (myApprovedRequest && !isOffboarded)) {
    const destName =
      myApprovedRequest?.destinationDepartment?.name || userDept || "New Department";
    const srcName =
      myApprovedRequest?.department?.name || "Previous Department";

    return (
      <div className="relative overflow-hidden rounded-2xl border border-indigo-200/90 bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-indigo-100/50 p-4 shadow-sm dark:border-indigo-800/60 dark:from-indigo-950/40 dark:via-sky-950/30 dark:to-indigo-900/20">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-200/70 text-indigo-900 dark:bg-indigo-900/60 dark:text-indigo-200">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-indigo-950 dark:text-indigo-200">
                  Department Transfer Active: Welcome to {destName}
                </h3>
                <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 text-[11px] font-semibold">
                  Internal Transfer
                </Badge>
              </div>
              <p className="mt-1 text-xs text-indigo-900/80 dark:text-indigo-300/90 leading-relaxed max-w-4xl">
                You have successfully transferred from <strong>{srcName}</strong> to <strong>{destName}</strong>. Your active Q2 assignments and targets are now under {destName}. All your completed Q1 work and achievements from {srcName} remain safely credited in your historical performance record.
              </p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-indigo-800/80 dark:text-indigo-300/80 font-medium">
                <Building2 className="h-3.5 w-3.5" />
                <span>Current Department: {destName}</span>
                {myApprovedRequest?.effectiveDate && (
                  <span>• Effective: {new Date(myApprovedRequest.effectiveDate).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="rounded-lg p-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600 dark:hover:bg-indigo-900 dark:hover:text-indigo-200 transition-colors"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
