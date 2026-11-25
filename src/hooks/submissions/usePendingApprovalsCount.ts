/**
 * Lightweight pending-approvals badge data.
 * Uses role-scoped levels, server-side PENDING filter, and slim GraphQL fields
 * so the dashboard shell stays fast without changing approval workflows.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { useAuthStore, useOrgUnitStore } from "@/stores";
import { usePermissions } from "@/hooks/permissions/usePermissions";
import {
  type ApproverRole,
  type MinimalSubmission,
} from "./types";
import {
  useDepartmentHierarchy,
} from "./useDepartmentHierarchy";
import {
  filterSubmissionsByHierarchy,
  filterSubmissionsByListMode,
  deduplicateSubmissions,
} from "./utils";
import { GET_PENDING_SUBMISSIONS_LIGHT } from "@/lib/graphql/queries/submissions";
import { GET_LOGBOOK_PENDING_BADGE } from "@/lib/graphql/queries/logbook";
import type { ObjectiveType } from "@/types/graphql";
import {
  BADGE_LIMIT,
  inboundLevelsForApprover,
  kpiSubmissionsQueryVariables,
  objectiveSubmissionsQueryVariables,
} from "./submissionQueryVariables";

interface PendingApprovalsCount {
  count: number;
  submissionCount: number;
  logbookCount: number;
  loading: boolean;
}

function getApproverRole(userRole: string | undefined): ApproverRole {
  if (userRole === "ADMIN" || userRole === "SUPER_ADMIN" || userRole === "DCEO") {
    return "CORPORATE";
  }
  if (userRole === "DIRECTOR") return "DIVISION";
  if (userRole === "MANAGER") return "DEPARTMENT";
  return "CORPORATE";
}

function mapLightItems(
  items: MinimalSubmission[] | undefined,
): MinimalSubmission[] {
  return (items ?? []).map((item) => ({
    ...item,
    objective: item.objective
      ? {
          ...item.objective,
          name:
            item.objective.name ?? (item.objective as { title?: string }).title,
        }
      : item.objective,
    kpi: item.kpi
      ? {
          ...item.kpi,
          objective: item.kpi.objective
            ? {
                ...item.kpi.objective,
                name:
                  item.kpi.objective.name ??
                  (item.kpi.objective as { title?: string }).title,
              }
            : item.kpi.objective,
        }
      : item.kpi,
  }));
}

function useLightLevelQuery(
  level: ObjectiveType,
  enabledLevels: ObjectiveType[],
  shouldFetch: boolean,
  submissionType: "OBJECTIVE" | "KPI",
  pollInterval = 0,
) {
  const buildVars =
    submissionType === "OBJECTIVE"
      ? objectiveSubmissionsQueryVariables
      : kpiSubmissionsQueryVariables;

  return useQuery(GET_PENDING_SUBMISSIONS_LIGHT, {
    variables: buildVars(level, {
      limit: BADGE_LIMIT,
      status: "PENDING",
    }),
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
    skip: !shouldFetch || !enabledLevels.includes(level),
    pollInterval,
  });
}

export function usePendingApprovalsCount(): PendingApprovalsCount {
  const user = useAuthStore((state) => state.user);
  const selectedUnit = useOrgUnitStore((state) => state.selectedUnit);
  const { scope } = usePermissions();

  const approverRole = getApproverRole(user?.role);
  const isDceo = user?.role === "DCEO";
  const enabledLevels = useMemo(
    () => inboundLevelsForApprover(approverRole, isDceo),
    [approverRole, isDceo],
  );

  const shouldMakeQueries = Boolean(
    user && user.role !== 'CEO' &&
      (user.role === "SUPER_ADMIN" ||
        user.role === "ADMIN" ||
        user.role === "DCEO" ||
        approverRole === "DIVISION" ||
        approverRole === "DEPARTMENT" ||
        selectedUnit),
  );

  const [isVisible, setIsVisible] = useState(() =>
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      setIsVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const activePollInterval = isVisible ? 90_000 : 0;

  const divisionObj = useLightLevelQuery(
    "DIVISION",
    enabledLevels,
    shouldMakeQueries,
    "OBJECTIVE",
    activePollInterval,
  );
  const departmentObj = useLightLevelQuery(
    "DEPARTMENT",
    enabledLevels,
    shouldMakeQueries,
    "OBJECTIVE",
    activePollInterval,
  );
  const personnelObj = useLightLevelQuery(
    "PERSONNEL",
    enabledLevels,
    shouldMakeQueries,
    "OBJECTIVE",
    activePollInterval,
  );
  const divisionKpi = useLightLevelQuery(
    "DIVISION",
    enabledLevels,
    shouldMakeQueries,
    "KPI",
    activePollInterval,
  );
  const departmentKpi = useLightLevelQuery(
    "DEPARTMENT",
    enabledLevels,
    shouldMakeQueries,
    "KPI",
    activePollInterval,
  );
  const personnelKpi = useLightLevelQuery(
    "PERSONNEL",
    enabledLevels,
    shouldMakeQueries,
    "KPI",
    activePollInterval,
  );

  const allSubmissions = useMemo(
    () =>
      deduplicateSubmissions([
        ...mapLightItems(
          divisionObj.data?.submissions?.items as
            | MinimalSubmission[]
            | undefined,
        ),
        ...mapLightItems(
          departmentObj.data?.submissions?.items as
            | MinimalSubmission[]
            | undefined,
        ),
        ...mapLightItems(
          personnelObj.data?.submissions?.items as
            | MinimalSubmission[]
            | undefined,
        ),
        ...mapLightItems(
          divisionKpi.data?.submissions?.items as
            | MinimalSubmission[]
            | undefined,
        ),
        ...mapLightItems(
          departmentKpi.data?.submissions?.items as
            | MinimalSubmission[]
            | undefined,
        ),
        ...mapLightItems(
          personnelKpi.data?.submissions?.items as
            | MinimalSubmission[]
            | undefined,
        ),
      ]),
    [
      divisionObj.data,
      departmentObj.data,
      personnelObj.data,
      divisionKpi.data,
      departmentKpi.data,
      personnelKpi.data,
    ],
  );

  const {
    departmentsWithoutDivision,
    getDepartmentsForDivision,
    loading: departmentsLoading,
  } = useDepartmentHierarchy({
    shouldFetch:
      shouldMakeQueries &&
      (approverRole === "CORPORATE" || approverRole === "DIVISION"),
  });

  const selectedUnitType = selectedUnit?.type as
    | "division"
    | "department"
    | null;
  const selectedUnitId = selectedUnit?.id || null;

  const effectiveSelectedUnitType: "division" | "department" | null =
    selectedUnitType ??
    (approverRole === "DIVISION"
      ? "division"
      : approverRole === "DEPARTMENT"
        ? "department"
        : null);

  const effectiveSelectedUnitId: string | null =
    selectedUnitId ??
    (approverRole === "DIVISION"
      ? (scope?.managedDivisionIds?.[0] ?? null)
      : approverRole === "DEPARTMENT"
        ? (scope?.managedDepartmentIds?.[0] ??
          user?.departments?.[0]?.departmentId ??
          null)
        : null);

  const departmentsInSelectedDivision =
    effectiveSelectedUnitId && effectiveSelectedUnitType === "division"
      ? getDepartmentsForDivision(effectiveSelectedUnitId)
      : new Set<string>();

  const submissionCount = useMemo(() => {
    const inbound = filterSubmissionsByListMode(
      allSubmissions,
      "inbound",
      approverRole,
      user?.employeeId,
    );
    const hierarchyFiltered = filterSubmissionsByHierarchy(
      inbound,
      approverRole,
      effectiveSelectedUnitType,
      departmentsWithoutDivision,
      departmentsInSelectedDivision,
      effectiveSelectedUnitId,
      { isDceo, currentUserId: user?.employeeId },
    );
    return hierarchyFiltered.length;
  }, [
    allSubmissions,
    approverRole,
    isDceo,
    user?.employeeId,
    effectiveSelectedUnitType,
    departmentsWithoutDivision,
    departmentsInSelectedDivision,
    effectiveSelectedUnitId,
  ]);

  const isExecutiveLogbookApprover = user?.role === "CEO" || user?.role === "DCEO";
  const { data: logbookData, loading: logbookLoading } = useQuery(
    GET_LOGBOOK_PENDING_BADGE,
    {
      variables: {
        entryStatus: "SUBMITTED",
        approverUserId: isExecutiveLogbookApprover ? user.employeeId : undefined,
        limit: BADGE_LIMIT,
        page: 1,
      },
      skip: !user?.employeeId,
      fetchPolicy: "cache-and-network",
      nextFetchPolicy: "cache-first",
      pollInterval: activePollInterval,
    },
  );

  const logbookCount = useMemo(() => {
    if (isExecutiveLogbookApprover) return logbookData?.logbookEntries?.meta?.totalItems ?? 0;
    const entries = logbookData?.logbookEntries?.items || [];
    return entries.filter(
      (e: { owner?: { employeeId?: string } }) =>
        e.owner?.employeeId !== user?.employeeId,
    ).length;
  }, [logbookData, user?.employeeId, user?.role]);

  const submissionsLoading =
    divisionObj.loading ||
    departmentObj.loading ||
    personnelObj.loading ||
    divisionKpi.loading ||
    departmentKpi.loading ||
    personnelKpi.loading;

  const loading = submissionsLoading || departmentsLoading || logbookLoading;
  const count = submissionCount + logbookCount;

  return { count, submissionCount, logbookCount, loading };
}
