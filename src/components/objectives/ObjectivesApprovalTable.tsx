"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import React from "react";
import ObjectiveFilterBar from "./ObjectiveFilterBar";
import SyncButton from "@/components/shared/SyncButton";
import ObjectiveTable, {
  Objective,
} from "@/components/features/objectives/ObjectiveTable";
// import EditObjectiveDialog from "./EditObjectiveDialog";
import DataTablePagination from "@/components/shared/DataTablePagination";
import { useObjectives } from "@/hooks/objectives/useObjectives";
import type { ObjectivesQueryVariables } from "@/types/graphql";
import { useObjectiveMutations } from "@/hooks/objectives/useObjectiveMutations";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore, useOrgUnitStore } from "@/stores";
import { useUserDepartments } from "@/hooks/org-structure/useUserDepartments";
import { useDepartmentSelection } from "@/context/DepartmentSelectionContext";
import { useQuery } from "@apollo/client";
import {
  GET_KPI_SUBMISSIONS,
  GET_PENDING_SUBMISSIONS,
} from "@/lib/graphql/queries/submissions";
import BulkSubmitDialog from "../submissions/BulkSubmitDialog";
import { isTopLevelCorporateObjective } from "@/lib/objectives/kpiWeightScope";
import { isPersonalObjectiveAssignment } from "@/lib/objectives/personalObjectiveScope";
import {
  kpiSubmissionsQueryVariables,
  objectiveSubmissionsQueryVariables,
} from "@/hooks/submissions/submissionQueryVariables";
import { usePermissions } from "@/hooks/permissions/usePermissions";
import { GET_DIVISIONS } from "@/lib/graphql/queries/divisions";
import { GET_DEPARTMENTS } from "@/lib/graphql/queries/departments";
import { GET_EMPLOYEES } from "@/lib/graphql/queries/employees";
import { useSelectedStrategicPeriod } from "@/stores/strategicPeriodStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Users } from "lucide-react";


export default function ObjectivesApprovalTable() {
  return <ObjectivesApprovalTableContent />;
}

function ObjectivesApprovalTableContent() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const selectedUnit = useOrgUnitStore((state) => state.selectedUnit);
  const { departmentNames } = useUserDepartments();
  const { selected: selectedDepartment } = useDepartmentSelection();
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  // State for optimistic ordering updates
  const [orderedObjectives, setOrderedObjectives] = useState<
    Objective[] | null
  >(null);
  const [activeTab, setActiveTab] = useState<string>("corporate");
  const [selectedPersonnelEmployeeId, setSelectedPersonnelEmployeeId] =
    useState<string>("");
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>({
    key: "createdAt",
    direction: "desc",
  });
  const selectedPeriod = useSelectedStrategicPeriod();
  const selectedPeriodId = selectedPeriod?.strategicPeriodId;

  const selectedPeriodLabel =
    selectedPeriod?.name || "the selected period/quarter";

  // Use RBAC permissions
  const { guards, objectives: objectivePermissions, scope } = usePermissions();

  const isCorporateRole =
    guards.isAdmin || guards.isSuperAdmin || guards.isSMEAL || guards.isDCEO;
  const showTabs =
    isCorporateRole || guards.isDirector || guards.isManager || guards.isCoordinator;

  // Extract stable values from complex objects to avoid unnecessary re-renders
  const userRole = user?.role;
  const userEmployeeId = user?.employeeId;
  const selectedUnitId = selectedUnit?.id;
  const selectedUnitType = selectedUnit?.type;
  const managedDepartmentIds = scope?.managedDepartmentIds;
  const managedDivisionIds = scope?.managedDivisionIds;
  const isAdmin = guards.isAdmin;
  const isSuperAdmin = guards.isSuperAdmin;
  const isDirector = guards.isDirector;
  const isManager = guards.isManager;
  const isCoordinator = guards.isCoordinator;
  // Every personal view must use personal assignment filtering, not just NORMAL.
  const isEmployee = !showTabs;

  useEffect(() => {
    if (userEmployeeId && (!selectedPersonnelEmployeeId || selectedPersonnelEmployeeId === "all")) {
      setSelectedPersonnelEmployeeId(userEmployeeId);
    }
  }, [userEmployeeId, selectedPersonnelEmployeeId]);

  // Determine the assigneeId based on the user role and selected organizational unit
  const getAssigneeId = (): string | undefined => {
    if ((isManager || isCoordinator) && selectedUnit) {
      // For managers, show objectives assigned to their selected unit
      return selectedUnit.id;
    } else if (isEmployee) {
      // For employees, show objectives assigned to them personally
      return userEmployeeId;
    }
    return undefined;
  };

  const assigneeId = getAssigneeId();

  // Prepare query variables to avoid undefined-assigned optionals
  const objectivesQueryVars: ObjectivesQueryVariables = useMemo(() => {
    const vars: ObjectivesQueryVariables = {
      page: 1,
      limit: 1000,
    };
    if (searchTerm) {
      vars.search = searchTerm;
    }
    // Only filter at API level for employees (personnel)
    // Managers, Directors, and Admins fetch all objectives and filter on frontend
    // This allows them to see hierarchical objectives (parent + children)
    if (isEmployee && assigneeId) {
      vars.assigneeId = assigneeId;
    }

    return vars;
  }, [assigneeId, searchTerm, isEmployee]);

  // Fetch a large set and paginate client-side for predictable counts
  const pathname = usePathname();
  const {
    objectives,
    loading,
    error,
    refetch,
  } = useObjectives(objectivesQueryVars);

  // When main objectives is not scoped by assigneeId or searchTerm, it already fetches all objectives.
  // Avoid sending a duplicate identical 1000-row request on mount.
  const needsSeparateLookup = Boolean((isEmployee && assigneeId) || searchTerm);
  const {
    objectives: separateLookupObjectives,
    refetch: refetchAllObjectivesForLookup,
  } = useObjectives(
    {
      page: 1,
      limit: 1000,
    },
    { skip: !needsSeparateLookup },
  );

  const allObjectivesForLookup = needsSeparateLookup
    ? separateLookupObjectives
    : objectives;

  // Derive KPIs directly from loaded objectives (which already embed all KPI data + quarter plans).
  // This eliminates the separate heavy 1000-KPI query on mount that was causing the long spinner delay.
  const kpis = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();
    for (const obj of allObjectivesForLookup) {
      for (const k of obj.kpis || []) {
        if (!seen.has(k.kpiId)) {
          seen.add(k.kpiId);
          list.push((k as any).objective ? k : { ...k, objective: obj });
        }
      }
    }
    return list;
  }, [allObjectivesForLookup]);

  const kpisLoading = false;
  const refetchKpis = async () => {
    await refetch();
    if (needsSeparateLookup) {
      await refetchAllObjectivesForLookup();
    }
  };

  // Only refetch when the strategic period actually changes — not on every
  // navigation back to this page (Apollo cache already holds the list).
  const previousPeriodIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (pathname !== "/dashboard/objectives" || !userEmployeeId) return;
    if (!selectedPeriodId) return;

    const previous = previousPeriodIdRef.current;
    previousPeriodIdRef.current = selectedPeriodId;
    if (previous === undefined || previous === selectedPeriodId) return;

    setOrderedObjectives(null);
    setSelected([]);
    setExpanded(null);
    setCurrentPage(1);

    void refetch();
    if (needsSeparateLookup) void refetchAllObjectivesForLookup();
    void refetchKpis();
  }, [
    pathname,
    userEmployeeId,
    selectedPeriodId,
    refetch,
    refetchAllObjectivesForLookup,
    refetchKpis,
    needsSeparateLookup,
  ]);

  const handleSyncObjectives = async () => {
    const promises: Promise<any>[] = [refetch(), refetchKpis()];
    if (needsSeparateLookup) {
      promises.push(refetchAllObjectivesForLookup());
    }
    await Promise.allSettled(promises);
  };

  // Fetch KPI submissions specifically to get rejection reasons
  const { data: kpiSubmissionsData1 } = useQuery(GET_KPI_SUBMISSIONS, {
    variables: kpiSubmissionsQueryVariables("DIVISION"),
  });
  const { data: kpiSubmissionsData2 } = useQuery(GET_KPI_SUBMISSIONS, {
    variables: kpiSubmissionsQueryVariables("DEPARTMENT"),
  });
  const { data: kpiSubmissionsData3 } = useQuery(GET_KPI_SUBMISSIONS, {
    variables: kpiSubmissionsQueryVariables("PERSONNEL"),
  });

  // Fetch objective submissions to get rejection reasons for objectives
  const { data: objectiveSubmissionsData1 } = useQuery(
    GET_PENDING_SUBMISSIONS,
    {
      variables: objectiveSubmissionsQueryVariables("DIVISION"),
    },
  );
  const { data: objectiveSubmissionsData2 } = useQuery(
    GET_PENDING_SUBMISSIONS,
    {
      variables: objectiveSubmissionsQueryVariables("DEPARTMENT"),
    },
  );
  const { data: objectiveSubmissionsData3 } = useQuery(
    GET_PENDING_SUBMISSIONS,
    {
      variables: objectiveSubmissionsQueryVariables("PERSONNEL"),
    },
  );

  // Fetch Divisions for names lookup
  const { data: divisionsData } = useQuery(GET_DIVISIONS, {
    variables: { page: 1, limit: 1000 },
    skip: !showTabs,
  });

  // Fetch Departments for names lookup
  const { data: departmentsData } = useQuery(GET_DEPARTMENTS, {
    variables: { page: 1, limit: 1000 },
    skip: !showTabs,
  });

  // Fetch Employees for names lookup - Scoped by backend for managers, directors, admins
  const { data: employeesData } = useQuery(GET_EMPLOYEES, {
    variables: { page: 1, limit: 1000 },
    skip: !showTabs,
  });

  // Allowed department employee IDs for manager personnel visibility
  const departmentEmployeeIdSet = useMemo(() => {
    const set = new Set<string>();
    if (userEmployeeId) set.add(userEmployeeId);
    employeesData?.employees?.items?.forEach((e: any) => {
      if (e.employeeId) set.add(e.employeeId);
    });
    return set;
  }, [employeesData, userEmployeeId]);

  // Build names lookup map
  const unitNames = useMemo(() => {
    const map: Record<string, string> = {};
    // Employees cannot fetch the admin-only directory, but their own name is
    // already available. An assigned personal objective is not "Unassigned".
    if (userEmployeeId) map[userEmployeeId] = user?.fullName || "You";
    divisionsData?.divisions?.items?.forEach((d: any) => {
      map[d.divisionId] = d.name;
    });
    departmentsData?.departments?.items?.forEach((d: any) => {
      map[d.departmentId] = d.name;
    });
    employeesData?.employees?.items?.forEach((e: any) => {
      map[e.employeeId] = e.fullName;
    });
    return map;
  }, [
    divisionsData,
    departmentsData,
    employeesData,
    userEmployeeId,
    user?.fullName,
  ]);

  // Build rejection reasons maps for Objectives and KPIs
  const { objectiveRejectionReasons, kpiRejectionReasons } = useMemo(() => {
    const objectiveReasons: Record<string, string> = {};
    const kpiReasons: Record<string, string> = {};

    // Combine all submission data (both KPI and objective submissions)
    const submissionsData = {
      submissions: {
        items: [
          ...(kpiSubmissionsData1?.submissions?.items || []),
          ...(kpiSubmissionsData2?.submissions?.items || []),
          ...(kpiSubmissionsData3?.submissions?.items || []),
          ...(objectiveSubmissionsData1?.submissions?.items || []),
          ...(objectiveSubmissionsData2?.submissions?.items || []),
          ...(objectiveSubmissionsData3?.submissions?.items || []),
        ],
      },
    };

    const allSubmissions = submissionsData?.submissions?.items || [];

    // Building rejection reasons from submissions
    // Total submissions: ${allSubmissions.length}
    const submissionMappings = allSubmissions.map(
      (sub: {
        submissionId: string;
        type: "OBJECTIVE" | "KPI";
        status: string;
        reason?: string;
        kpi?: { kpiId: string } | null;
        objective?: { objectiveId: string } | null;
      }) => ({
        submissionId: sub.submissionId,
        type: sub.type,
        status: sub.status,
        reason: sub.reason,
        kpiId: sub.kpi?.kpiId,
        objectiveId: sub.objective?.objectiveId,
      }),
    );

    allSubmissions.forEach(
      (submission: {
        status: string;
        reason?: string;
        type: "OBJECTIVE" | "KPI";
        kpi?: { kpiId: string } | null;
        objective?: { objectiveId: string } | null;
      }) => {
        if (submission.status !== "REJECTED" || !submission.reason) return;

        if (submission.type === "KPI" && submission.kpi?.kpiId) {
          // Direct KPI submission rejection
          kpiReasons[submission.kpi.kpiId] = submission.reason as string;
          // Mapped KPI rejection reason for ${submission.kpi.kpiId}
        } else if (submission.type === "OBJECTIVE") {
          const objId = (submission.objective?.objectiveId || "") as string;
          // Store reason for the objective itself
          objectiveReasons[objId] = submission.reason as string;
          // Mapped objective rejection reason for ${objId}
          // Also map the same reason to any rejected KPIs under that objective
          kpis
            .filter((k) => k.objective?.objectiveId === objId)
            .forEach((k) => {
              if (k.status === "REJECTED") {
                kpiReasons[k.kpiId] = submission.reason as string;
                // Mapped objective KPI rejection reason for ${k.kpiId}
              }
            });
        }
      },
    );

    // Final rejection reasons maps built

    return {
      objectiveRejectionReasons: objectiveReasons,
      kpiRejectionReasons: kpiReasons,
    };
  }, [
    kpiSubmissionsData1,
    kpiSubmissionsData2,
    kpiSubmissionsData3,
    objectiveSubmissionsData1,
    objectiveSubmissionsData2,
    objectiveSubmissionsData3,
    kpis,
  ]);

  // Mutations
  const {
    // updateObjective,
    // removeObjective,
    // loading: mutationLoading,
  } = useObjectiveMutations();

  // Filter objectives based on status and user role
  const filteredObjectives = useMemo(() => {
    console.log("🔍 [ObjectivesFilter] Starting filtering process", {
      totalObjectives: objectives.length,
      userRole: userRole,
      selectedUnitId: selectedUnitId,
      selectedPeriodId: selectedPeriodId,
    });

    // Starting objectives filtering
    let filtered = objectives;

    // Filter out objectives with NULL assigneeId (broken data)
    // Only show objectives that have proper assignment data
    filtered = filtered.filter((obj) => {
      // Corporate objectives without assignment are OK (top-level, no assigneeType/assigneeId)
      if (!obj.assigneeType && !obj.assigneeId) {
        return true;
      }

      // For ADMIN/SUPER_ADMIN/SMEAL/DCEO: Show all objectives, even unassigned ones
      if (isAdmin || isSuperAdmin || guards.isSMEAL || guards.isDCEO) {
        return true;
      }

      // For other roles: Filter out objectives with assigneeType but no assigneeId
      if (obj.assigneeType && !obj.assigneeId) {
        return false; // Broken data - has type but no ID
      }
      return true;
    });

    console.log("🔍 [ObjectivesFilter] After NULL assigneeId filter", {
      count: filtered.length,
      objectives: filtered.map((o) => ({
        id: o.objectiveId,
        title: o.title,
        type: o.type,
        assigneeType: o.assigneeType,
        assigneeId: o.assigneeId,
      })),
    });

    // First, handle role-based scope filtering with strict hierarchical alignment
    if (isEmployee) {
      console.log("🔍 [ObjectivesFilter] Applying EMPLOYEE filter");
      filtered = filtered.filter((obj) =>
        isPersonalObjectiveAssignment(obj, userEmployeeId),
      );
    } else if (isManager) {
      console.log("🔍 [ObjectivesFilter] Applying MANAGER filter", {
        managedDepartmentIds: managedDepartmentIds,
        selectedUnitId: selectedUnitId,
      });

      const myDeptIds = [
        ...new Set([
          ...(managedDepartmentIds || []),
          ...(user?.departments?.map((d: any) => d.departmentId) || []),
        ]),
      ];

      filtered = filtered.filter((obj) => {
        // Show objectives explicitly assigned to manager's departments
        if (
          obj.assigneeType === "DEPARTMENT" &&
          myDeptIds.includes(obj.assigneeId || "")
        ) {
          console.log("✅ [ObjectivesFilter] DEPARTMENT match", obj.title);
          return true;
        }

        // Show objectives assigned directly to the manager personally (Dawit Solomon)
        if (
          (obj.assigneeType === "PERSONNEL" ||
            obj.assigneeType === "EMPLOYEE" ||
            obj.type === "PERSONNEL") &&
          obj.assigneeId === userEmployeeId
        ) {
          console.log("✅ [ObjectivesFilter] MANAGER PERSONAL match", obj.title);
          return true;
        }

        // Show personnel objectives that belong to manager's department team members
        if (
          obj.assigneeType === "PERSONNEL" ||
          obj.assigneeType === "EMPLOYEE" ||
          obj.type === "PERSONNEL"
        ) {
          // Employee must belong to the manager's department or direct reports
          const isDeptMember =
            (obj.assigneeId && departmentEmployeeIdSet.has(obj.assigneeId)) ||
            obj.assigneeId === userEmployeeId;

          if (!isDeptMember) {
            return false;
          }

          // Check parent objective in allObjectivesForLookup or objectives
          const parentObj =
            allObjectivesForLookup.find(
              (o) => o.objectiveId === obj.parent?.objectiveId,
            ) ||
            objectives.find(
              (o) => o.objectiveId === obj.parent?.objectiveId,
            );

          const parentMatchesDept =
            parentObj &&
            parentObj.assigneeType === "DEPARTMENT" &&
            myDeptIds.includes(parentObj.assigneeId || "");

          const emp = employeesData?.employees?.items?.find(
            (e: any) => e.employeeId === obj.assigneeId,
          );
          const empInDept = emp?.departments?.some((d: any) =>
            myDeptIds.includes(d.departmentId),
          );

          const match = Boolean(parentMatchesDept || empInDept);
          if (match)
            console.log("✅ [ObjectivesFilter] PERSONNEL match", obj.title);
          return match;
        }

        // Managers do NOT manage divisions; division objectives are hidden
        return false;
      });
    } else if (isDirector) {
      console.log("🔍 [ObjectivesFilter] Applying DIRECTOR filter", {
        managedDivisionIds: managedDivisionIds,
        selectedUnitId: selectedUnitId,
      });
      const myDivIds = managedDivisionIds || [];

      // Log ALL objectives to see what we're working with
      console.log(
        "🔍 [DirectorFilter] ALL OBJECTIVES:",
        filtered.map((o) => ({
          title: o.title,
          type: o.type,
          assigneeType: o.assigneeType,
          assigneeId: o.assigneeId,
        })),
      );

      filtered = filtered.filter((obj) => {
        // Show objectives explicitly assigned to director's divisions
        // Use assigneeType instead of type since backend may not set type field
        if (obj.assigneeType === "DIVISION") {
          const match = myDivIds.includes(obj.assigneeId || "");
          console.log("🔍 [DirectorFilter] DIVISION objective check", {
            title: obj.title,
            assigneeId: obj.assigneeId,
            myDivIds: myDivIds,
            match: match,
          });
          return match;
        }

        // trace recursive parentage for department and personnel objectives
        const isDescendantOfMyDiv = (currentObj: Objective): boolean => {
          if (!currentObj.parent) return false;
          const parentObj = objectives.find(
            (o) => o.objectiveId === currentObj.parent?.objectiveId,
          );
          if (!parentObj) return false;
          // Use assigneeType instead of type
          if (
            parentObj.assigneeType === "DIVISION" &&
            myDivIds.includes(parentObj.assigneeId || "")
          ) {
            return true;
          }
          return isDescendantOfMyDiv(parentObj);
        };

        // Use assigneeType instead of type for department and personnel checks
        if (
          obj.assigneeType === "DEPARTMENT" ||
          obj.assigneeType === "PERSONNEL"
        ) {
          return isDescendantOfMyDiv(obj);
        }

        // Show parent corporate objectives for context (no assigneeType means corporate)
        if (!obj.assigneeType && !obj.assigneeId) return !obj.parent;
        return false;
      });
    } else {
      console.log(
        "🔍 [ObjectivesFilter] ADMIN/SUPER_ADMIN - no role filter applied",
      );
      // ADMIN/SUPER_ADMIN see everything
    }

    console.log("🔍 [ObjectivesFilter] After role-based filter", {
      count: filtered.length,
      objectives: filtered.map((o) => ({ id: o.objectiveId, title: o.title })),
    });

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((obj) =>
        obj.title?.toLowerCase().includes(term),
      );
      console.log("🔍 [ObjectivesFilter] After search filter", {
        count: filtered.length,
        searchTerm,
      });
    }

    // Apply status filter
    if (statusFilter !== "all") {
      const mapped = statusFilter.toUpperCase() as any;
      filtered = filtered.filter((obj) => obj.status === mapped);
      console.log("🔍 [ObjectivesFilter] After status filter", {
        count: filtered.length,
        statusFilter,
      });
    }

    // Apply selected strategic period/quarter strictly. If no objective was
    // created in the selected period/quarter, the table should correctly show
    // an empty state instead of falling back to another active period.
    if (selectedPeriodId) {
      filtered = filtered.filter(
        (obj) => obj.strategicPeriod?.strategicPeriodId === selectedPeriodId,
      );

      console.log("🔍 [ObjectivesFilter] After strategic period filter", {
        selectedPeriodId,
        count: filtered.length,
      });
    }

    console.log("🔍 [ObjectivesFilter] FINAL RESULT", {
      count: filtered.length,
      objectives: filtered.map((o) => ({
        id: o.objectiveId,
        title: o.title,
        type: o.type,
        assigneeType: o.assigneeType,
        assigneeId: o.assigneeId,
      })),
    });

    return filtered;
  }, [
    objectives,
    statusFilter,
    searchTerm,
    isEmployee,
    isManager,
    isDirector,
    guards.isSMEAL,
    guards.isDCEO,
    isAdmin,
    isSuperAdmin,
    userEmployeeId,
    managedDepartmentIds,
    managedDivisionIds,
    selectedPeriodId,
    selectedUnitId,
    selectedUnitType,
    departmentsData?.departments?.items,
    departmentEmployeeIdSet,
    allObjectivesForLookup,
    employeesData?.employees?.items,
  ]);

  // Set default tab based on role once - MUST be after filteredObjectives is defined
  const [hasSetDefaultTab, setHasSetDefaultTab] = useState(false);
  React.useEffect(() => {
    if (hasSetDefaultTab || loading || !userRole) return; // Wait for user & objectives to load

    if (isDirector) {
      // For directors, always default to division tab
      setActiveTab("division");
      setHasSetDefaultTab(true);
    } else if (isManager || isCoordinator) {
      // For managers and coordinators, always default to department tab
      setActiveTab("department");
      setHasSetDefaultTab(true);
    } else if (isEmployee) {
      setActiveTab("personnel");
      setHasSetDefaultTab(true);
    } else if (isCorporateRole) {
      setActiveTab("corporate");
      setHasSetDefaultTab(true);
    }
  }, [
    isDirector,
    isManager,
    isCoordinator,
    isEmployee,
    isCorporateRole,
    hasSetDefaultTab,
    userRole,
    objectives,
    selectedUnitId,
    selectedUnitType,
    loading,
  ]);

  // Sort objectives by order field
  const sortedObjectives = useMemo(() => {
    // If we have an optimistic order, use it
    if (orderedObjectives) {
      const visibleIds = new Set(
        filteredObjectives.map((obj) => obj.objectiveId),
      );
      return orderedObjectives.filter((obj) => visibleIds.has(obj.objectiveId));
    }

    // Otherwise, sort the filtered objectives by their order field
    return [...filteredObjectives].sort((a, b) => {
      const orderA = (a as any).order ?? 0;
      const orderB = (b as any).order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      // Fallback to title if orders are same
      return (a.title || "").localeCompare(b.title || "");
    });
  }, [filteredObjectives, orderedObjectives]);

  // Clear optimistic order only after backend data reflects the new order.
  // This avoids immediate snap-back while Apollo cache/network catches up.
  useEffect(() => {
    if (loading || !orderedObjectives) return;

    const backendOrderById = new Map(
      filteredObjectives.map((obj) => [
        obj.objectiveId,
        (obj as any).order ?? 0,
      ]),
    );

    const isSynced = orderedObjectives.every((obj) => {
      const optimisticOrder = (obj as any).order ?? 0;
      const backendOrder = backendOrderById.get(obj.objectiveId);
      return backendOrder === undefined || backendOrder === optimisticOrder;
    });

    if (isSynced) {
      setOrderedObjectives(null);
    }
  }, [loading, filteredObjectives, orderedObjectives]);

  // Determine if sorting is enabled (only for users who can edit)
  const canEnableSorting = useMemo(() => {
    // Enable sorting for admins and directors with edit permission
    return isAdmin || isSuperAdmin || guards.isSMEAL || isDirector || isManager;
  }, [isAdmin, isSuperAdmin, guards.isSMEAL, isDirector, isManager]);

  // Handle order change (optimistic update)
  const handleOrderChange = (newOrderedPage: Objective[]) => {
    // We must start with a sorted version of the base list to ensure the positions
    // we are replacing match the logical order the user sees.
    const baseList =
      orderedObjectives ||
      [...filteredObjectives].sort((a, b) => {
        const orderA = (a as any).order ?? 0;
        const orderB = (b as any).order ?? 0;
        return orderA - orderB;
      });

    const pageIds = new Set(newOrderedPage.map((o) => o.objectiveId));
    const finalFullList: Objective[] = [];

    // Reconstruct the list: replace items in this page with their new sequence
    // while keeping other items in their original relative positions.
    let pageIdx = 0;
    baseList.forEach((obj) => {
      if (pageIds.has(obj.objectiveId)) {
        finalFullList.push(newOrderedPage[pageIdx++]);
      } else {
        finalFullList.push(obj);
      }
    });

    setOrderedObjectives(finalFullList);
  };

  const getObjectiveLevelKey = (objective: Objective) => {
    const type = String(objective.type || "").toUpperCase();
    const assigneeType = String(objective.assigneeType || "").toUpperCase();

    if (type === "CORPORATE" || assigneeType === "CORPORATE") {
      return "corporate";
    }
    if (assigneeType === "DIVISION" || type === "DIVISION") {
      return "division";
    }
    if (assigneeType === "DEPARTMENT" || type === "DEPARTMENT") {
      return "department";
    }
    if (
      assigneeType === "PERSONNEL" ||
      assigneeType === "EMPLOYEE" ||
      type === "PERSONNEL"
    ) {
      return "personnel";
    }

    // Legacy top-level corporate objectives usually have no assignee data.
    if (!objective.assigneeType && !objective.assigneeId && !objective.parent) {
      return "corporate";
    }

    return "unknown";
  };

  // Group objectives by effective hierarchy level for tabs.
  const corporateObjectives = useMemo(() => {
    return sortedObjectives.filter(
      (o) => getObjectiveLevelKey(o) === "corporate",
    );
  }, [sortedObjectives]);

  const divisionObjectives = useMemo(() => {
    return sortedObjectives.filter(
      (o) => getObjectiveLevelKey(o) === "division",
    );
  }, [sortedObjectives]);

  const departmentObjectives = useMemo(() => {
    return sortedObjectives.filter(
      (o) => getObjectiveLevelKey(o) === "department",
    );
  }, [sortedObjectives]);

  const personnelObjectives = useMemo(() => {
    return sortedObjectives.filter(
      (o) => getObjectiveLevelKey(o) === "personnel",
    );
  }, [sortedObjectives]);

  // List of unique assignees in personnel objectives
  const personnelAssignees = useMemo(() => {
    // Lookup map of employeeId -> department name
    const empDeptMap = new Map<string, string>();
    employeesData?.employees?.items?.forEach((e: any) => {
      const deptName = e.departments?.[0]?.name;
      if (deptName) {
        empDeptMap.set(e.employeeId, deptName);
      }
    });

    const map = new Map<string, string>();
    if (userEmployeeId) {
      const myDept =
        empDeptMap.get(userEmployeeId) ||
        user?.departments?.[0]?.name;
      const deptSuffix = myDept ? ` (${myDept})` : "";
      map.set(
        userEmployeeId,
        user?.fullName
          ? `${user.fullName} (You)${deptSuffix}`
          : "My Personal Objectives",
      );
    }
    personnelObjectives.forEach((obj) => {
      if (obj.assigneeId && !map.has(obj.assigneeId)) {
        const empName = unitNames[obj.assigneeId];
        const deptName = empDeptMap.get(obj.assigneeId);
        const deptSuffix = deptName ? ` (${deptName})` : "";
        const label = empName
          ? `${empName}${deptSuffix}`
          : `Employee (${obj.assigneeId.slice(0, 8)})${deptSuffix}`;
        map.set(obj.assigneeId, label);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [
    personnelObjectives,
    userEmployeeId,
    user?.fullName,
    user?.departments,
    unitNames,
    employeesData,
  ]);

  useEffect(() => {
    if (!selectedPersonnelEmployeeId || selectedPersonnelEmployeeId === "all") {
      if (userEmployeeId) {
        setSelectedPersonnelEmployeeId(userEmployeeId);
      } else if (personnelAssignees.length > 0) {
        setSelectedPersonnelEmployeeId(personnelAssignees[0].id);
      }
    }
  }, [userEmployeeId, selectedPersonnelEmployeeId, personnelAssignees]);

  const displayedPersonnelObjectives = useMemo(() => {
    const targetId = selectedPersonnelEmployeeId || userEmployeeId || personnelAssignees[0]?.id;
    if (!targetId || targetId === "all") {
      return personnelObjectives;
    }
    return personnelObjectives.filter(
      (obj) => obj.assigneeId === targetId,
    );
  }, [personnelObjectives, selectedPersonnelEmployeeId, userEmployeeId, personnelAssignees]);

  const currentTabObjectives = useMemo(() => {
    if (!showTabs) return sortedObjectives;
    switch (activeTab) {
      case "corporate":
        return corporateObjectives;
      case "division":
        return divisionObjectives;
      case "department":
        return departmentObjectives;
      case "personnel":
        return displayedPersonnelObjectives;
      default:
        return sortedObjectives;
    }
  }, [
    showTabs,
    activeTab,
    corporateObjectives,
    divisionObjectives,
    departmentObjectives,
    displayedPersonnelObjectives,
    sortedObjectives,
  ]);

  // Client-side pagination after tab filtering and sorting
  const tabFilteredObjectives = showTabs ? currentTabObjectives : sortedObjectives;
  const totalItems = tabFilteredObjectives.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const pagedObjectives = tabFilteredObjectives.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  const childQuartersByParentId = useMemo(() => {
    try {
      const map: Record<
        string,
        Record<
          string,
          { q1?: number; q2?: number; q3?: number; q4?: number }
        >
      > = {};

      pagedObjectives.forEach((obj) => {
        if (obj.type !== "CORPORATE") return;

        const childObjectives = allObjectivesForLookup.filter(
          (childObj) => childObj.parent?.objectiveId === obj.objectiveId,
        );

        const corporateKpis = kpis.filter(
          (k) => k.objective?.objectiveId === obj.objectiveId,
        );

        corporateKpis.forEach((corporateKpi, kpiIndex) => {
          const yearQuartersMap: Record<
            string,
            { q1?: number; q2?: number; q3?: number; q4?: number }
          > = {};

          childObjectives.forEach((childObj) => {
            const childKpis = kpis.filter(
              (k) => k.objective?.objectiveId === childObj.objectiveId,
            );
            const childKpi = childKpis[kpiIndex];

            if (childKpi?.targets) {
              childKpi.targets.forEach((target: any) => {
                const parts = target.timeline.split("-");
                if (parts.length === 2) {
                  const [year, quarter] = parts;
                  if (quarter.startsWith("Q")) {
                    if (!yearQuartersMap[year]) {
                      yearQuartersMap[year] = {};
                    }
                    const quarterNum = quarter.toLowerCase() as
                      | "q1"
                      | "q2"
                      | "q3"
                      | "q4";
                    yearQuartersMap[year][quarterNum] =
                      (yearQuartersMap[year][quarterNum] || 0) +
                      Number(target.target || 0);
                  }
                }
              });
            }
          });

          map[corporateKpi.kpiId] = yearQuartersMap;
        });
      });

      return map;
    } catch (error) {
      console.error("Error building childQuartersByParentId:", error);
      return {};
    }
  }, [pagedObjectives, allObjectivesForLookup, kpis]);

  const handleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    const allPageIds = pagedObjectives.map((obj) => obj.objectiveId);
    const allSelected = allPageIds.every((id) => selected.includes(id));

    if (allSelected) {
      setSelected((prev) => prev.filter((id) => !allPageIds.includes(id)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...allPageIds])]);
    }
  };

  const handleExpand = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

  // Prepare data for bulk submission
  const selectedObjectivesForSubmission = useMemo(() => {
    return filteredObjectives
      .filter(
        (obj) =>
          selected.includes(obj.objectiveId) &&
          (obj.status === "NOT_SUBMITTED" || obj.status === "REJECTED") &&
          !isTopLevelCorporateObjective({
            type: obj.type,
            assigneeType: obj.assigneeType,
            assigneeId: obj.assigneeId,
            parentId: obj.parent?.objectiveId,
          }),
      )
      .map((obj) => ({
        itemId: obj.objectiveId,
        itemName: obj.title || obj.name || "Unnamed Objective",
        objectiveType: obj.type,
        assigneeType: obj.assigneeType,
        parentId: obj.parent?.objectiveId,
        itemType: "objective" as const,
      }));
  }, [filteredObjectives, selected]);

  const handleBulkSubmitSuccess = () => {
    setSelected([]);
    toast.success(
      `${selectedObjectivesForSubmission.length} objective(s) submitted for approval`,
    );
  };

  const handleAddObjective = () => {
    // Only allow users with objective creation permission
    if (objectivePermissions.creatableTypes.length > 0) {
      router.push("/dashboard/objectives/new");
    } else {
      toast.error("You don't have permission to add objectives");
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };
  const handleRowsPerPageChange = (value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  const handleObjectiveClick = (objective: Objective) => {
    // Navigate to objective details page with KPI management
    router.push(`/dashboard/objectives/${objective.objectiveId}`);
  };

  const handleViewObjective = (objective: Objective) => {
    router.push(`/dashboard/objectives/${objective.objectiveId}`);
  };

  const handleEditSuccess = async () => {
    await refetch(); // Refresh the objectives list after successful edit
  };

  const handleDeleteObjective = async () => {
    // After DeleteObjectiveDialog succeeds, simply refetch objectives list
    await refetch();
  };

  const handleAssignSuccess = async () => {
    // After assignment succeeds, refresh the objectives list
    await refetch();
  };

  const handleSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "desc" };
    });
  };

  const tabWeightInfo = useMemo(() => {
    if (activeTab === "corporate") {
      const group = corporateObjectives.filter(isTopLevelCorporateObjective);
      const total = group.reduce((sum, obj) => {
        const objKPIs = kpis.filter(
          (k) =>
            k.objective?.objectiveId === obj.objectiveId &&
            k.status !== "REJECTED",
        );
        return (
          sum + objKPIs.reduce((kpiSum, kpi) => kpiSum + (kpi.weight || 0), 0)
        );
      }, 0);
      return { total, label: "STRATEGIC WEIGHT BUDGET", isOver: total > 100, note: undefined };
    }
    if (activeTab === "division") {
      const total = divisionObjectives.reduce((sum, obj) => {
        const objKPIs = kpis.filter(
          (k) =>
            k.objective?.objectiveId === obj.objectiveId &&
            k.status !== "REJECTED",
        );
        return (
          sum + objKPIs.reduce((kpiSum, kpi) => kpiSum + (kpi.weight || 0), 0)
        );
      }, 0);
      return { total, label: "DIVISION WEIGHT BUDGET", isOver: total > 100, note: undefined };
    }
    if (activeTab === "department") {
      const total = departmentObjectives.reduce((sum, obj) => {
        const objKPIs = kpis.filter(
          (k) =>
            k.objective?.objectiveId === obj.objectiveId &&
            k.status !== "REJECTED",
        );
        return (
          sum + objKPIs.reduce((kpiSum, kpi) => kpiSum + (kpi.weight || 0), 0)
        );
      }, 0);
      return { total, label: "DEPARTMENT WEIGHT BUDGET", isOver: total > 100, note: undefined };
    }
    if (activeTab === "personnel") {
      if (selectedPersonnelEmployeeId === "all") {
        // When viewing all team members, calculate the maximum weight assigned to any single employee
        // rather than summing across multiple individuals into an artificial over-allocation.
        const perEmployeeWeights = new Map<string, number>();
        personnelObjectives.forEach((obj) => {
          const ownerId = obj.assigneeId || "unassigned";
          const objKPIs = kpis.filter(
            (k) =>
              k.objective?.objectiveId === obj.objectiveId &&
              k.status !== "REJECTED",
          );
          const weight = objKPIs.reduce(
            (sum, kpi) => sum + (kpi.weight || 0),
            0,
          );
          perEmployeeWeights.set(
            ownerId,
            (perEmployeeWeights.get(ownerId) || 0) + weight,
          );
        });
        const maxWeight = Math.max(0, ...perEmployeeWeights.values());
        return {
          total: maxWeight,
          label: "MAX EMPLOYEE WEIGHT",
          isOver: maxWeight > 100,
          note: `${perEmployeeWeights.size} team members (max allocated)`,
        };
      } else {
        const singleEmpObjectives = personnelObjectives.filter(
          (obj) => obj.assigneeId === selectedPersonnelEmployeeId,
        );
        const total = singleEmpObjectives.reduce((sum, obj) => {
          const objKPIs = kpis.filter(
            (k) =>
              k.objective?.objectiveId === obj.objectiveId &&
              k.status !== "REJECTED",
          );
          return (
            sum + objKPIs.reduce((kpiSum, kpi) => kpiSum + (kpi.weight || 0), 0)
          );
        }, 0);
        const isMe = selectedPersonnelEmployeeId === userEmployeeId;
        return {
          total,
          label: isMe ? "MY PERSONAL WEIGHT BUDGET" : "EMPLOYEE WEIGHT BUDGET",
          isOver: total > 100,
          note: undefined,
        };
      }
    }

    return { total: 0, label: "WEIGHT BUDGET", isOver: false, note: undefined };
  }, [
    activeTab,
    selectedPersonnelEmployeeId,
    corporateObjectives,
    divisionObjectives,
    departmentObjectives,
    personnelObjectives,
    kpis,
    userEmployeeId,
  ]);

  const cumulativeTabWeight = tabWeightInfo.total;

  return (
    <div className="flex flex-col gap-6 px-2 md:px-6">
      {/* Context Header for Employees */}
      {isEmployee && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">
            My Personal Objectives
          </h2>
          <p className="text-sm text-blue-700">
            These are objectives assigned to you by your manager. You can create
            KPIs for these objectives and submit them for approval.
          </p>
          {(selectedDepartment?.department || departmentNames.length > 0) && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <p className="text-xs text-blue-600">
                <span className="font-medium">
                  {departmentNames.length > 1 ? "Working in:" : "Department:"}
                </span>{" "}
                {selectedDepartment?.department?.name ||
                  departmentNames.join(", ")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Hierarchical Level Tabs and Global Weight Tracker */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50 backdrop-blur-sm p-2 rounded-lg border border-gray-100 shadow-sm sticky top-0 z-10">
          {showTabs ? (
            <div className="flex flex-wrap items-center gap-3 overflow-x-auto custom-scrollbar pb-1">
              <div className="flex gap-1">
                {["corporate", "division", "department", "personnel"]
                  .filter((tab) => {
                    // Only ADMIN and SUPER_ADMIN can see corporate tab
                    if (isCorporateRole) return true;
                    // Directors can see division, department, and personnel tabs
                    if (guards.isDirector)
                      return ["division", "department", "personnel"].includes(
                        tab,
                      );
                    // Managers and Coordinators can ONLY see department and personnel tabs
                    if (guards.isManager || guards.isCoordinator)
                      return ["department", "personnel"].includes(tab);
                    return false;
                  })
                  .map((tab) => (
                    <button
                      key={tab}
                      onClick={() => {
                        setActiveTab(tab);
                        setCurrentPage(1);
                      }}
                      className={`px-6 py-2.5 text-sm font-medium rounded-md whitespace-nowrap transition-all duration-200 ${
                        activeTab === tab
                          ? "bg-blue-600 text-white shadow-md transform scale-105"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)} Objectives
                    </button>
                  ))}
              </div>

              {/* Assignee filter when viewing Personnel tab */}
              {activeTab === "personnel" && (isManager || isCoordinator || isDirector || isCorporateRole) && (
                <div className="flex items-center gap-2 ml-2 pl-3 border-l border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                    Assignee:
                  </span>
                  <Select
                    value={selectedPersonnelEmployeeId}
                    onValueChange={(val) => {
                      setSelectedPersonnelEmployeeId(val);
                      setCurrentPage(1);
                    }}
                  >
                    <SelectTrigger className="w-[280px] h-9 text-xs bg-white dark:bg-card">
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      {personnelAssignees.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}

          {/* Level Weight Progress Tracker and Sync */}
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1 min-w-[220px] px-2">
            <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wider">
              <span
                className={
                  tabWeightInfo.isOver
                    ? "text-red-600"
                    : "text-gray-500"
                }
              >
                {tabWeightInfo.label}
              </span>
              <span
                className={
                  tabWeightInfo.isOver
                    ? "text-red-600 font-bold animate-pulse"
                    : "text-blue-600"
                }
              >
                {tabWeightInfo.total.toFixed(1)}% / 100%
              </span>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden shadow-inner border border-gray-100">
              <div
                className={`h-full transition-all duration-500 ease-out rounded-full ${
                  tabWeightInfo.isOver
                    ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                    : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                }`}
                style={{ width: `${Math.min(tabWeightInfo.total, 105)}%` }}
              />
            </div>
            {tabWeightInfo.isOver ? (
              <p className="text-[10px] text-red-500 font-medium text-right">
                ⚠️ Cumulative limit exceeded!
              </p>
            ) : tabWeightInfo.note ? (
              <p className="text-[10px] text-muted-foreground text-right">
                {tabWeightInfo.note}
              </p>
            ) : null}
            </div>
            <SyncButton onSync={handleSyncObjectives} label="Sync" />
          </div>
        </div>
      </div>

      {/* Error message for managers/directors with no access */}
      {(isDirector || isManager) &&
        !selectedUnit &&
        filteredObjectives.length === 0 &&
        !loading && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>No organizational unit selected.</strong> Please select a{" "}
              {isDirector ? "division" : "department"} from the dropdown above
              to view objectives.
            </p>
          </div>
        )}

      {/* Filter Bar */}
      <ObjectiveFilterBar
        searchTerm={searchTerm}
        statusFilter={statusFilter}
        selectedCount={selected.length}
        onSearchChange={handleSearchChange}
        onStatusFilterChange={handleStatusFilterChange}
        onClearFilters={handleClearFilters}
        onAddObjective={handleAddObjective}
        showAddButton={objectivePermissions.creatableTypes.length > 0}
        activeTab={activeTab}
      />

      {/* Summary */}
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-600">
            {`Showing ${totalItems > 0 ? startIndex + 1 : 0}-${Math.min(
              startIndex + itemsPerPage,
              totalItems,
            )} of ${totalItems} objectives`}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedObjectivesForSubmission.length > 0 && (
            <BulkSubmitDialog
              items={selectedObjectivesForSubmission}
              itemType="objectives"
              onSubmitSuccess={handleBulkSubmitSuccess}
            >
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                Submit {selectedObjectivesForSubmission.length} for Approval
              </Button>
            </BulkSubmitDialog>
          )}
        </div>
      </div>

      {/* Table */}
      <ObjectiveTable
        objectives={pagedObjectives}
        allObjectives={allObjectivesForLookup} // Use broad set to resolve parent KPI names
        kpis={kpis}
        selected={selected}
        expanded={expanded}
        onSelect={handleSelect}
        onSelectAll={handleSelectAll}
        onExpand={handleExpand}
        onObjectiveClick={handleObjectiveClick}
        onViewObjective={handleViewObjective}
        onEditSuccess={handleEditSuccess}
        onDeleteObjective={handleDeleteObjective}
        onAssignSuccess={handleAssignSuccess}
        loading={loading || kpisLoading}
        error={error?.message}
        objectiveRejectionReasons={objectiveRejectionReasons}
        kpiRejectionReasons={kpiRejectionReasons}
        enableSorting={canEnableSorting}
        onOrderChange={handleOrderChange}
        startIndex={startIndex}
        sortConfig={sortConfig}
        onSort={handleSort}
        groupBy={
          showTabs
            ? activeTab === "corporate"
              ? "none"
              : activeTab === "division"
                ? "division"
                : activeTab === "department"
                  ? "department"
                  : "personnel"
            : "none"
        }
        unitNames={unitNames}
        emptyTitle={
          activeTab === "personnel" &&
          selectedPersonnelEmployeeId === userEmployeeId
            ? `No personal objectives assigned in ${selectedPeriodLabel}.`
            : selectedPeriodId
            ? `No objectives in ${selectedPeriodLabel}.`
            : "No objectives found."
        }
        emptyDescription={
          activeTab === "personnel" &&
          selectedPersonnelEmployeeId === userEmployeeId
            ? "You do not have individual personal objectives assigned yet for this period. Your department objectives are available under the Department tab, or select a team member from the Assignee filter above to view their cascaded objectives."
            : selectedPeriodId
            ? "Objectives are shown only for the exact period or quarter where they were created."
            : "Change your filters or add a new objective."
        }
        childQuartersByParentId={childQuartersByParentId}
      />

      {/* Pagination */}
      {totalPages > 0 && (
        <DataTablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={itemsPerPage}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
          loading={loading || kpisLoading}
          itemName="objectives"
        />
      )}
    </div>
  );
}
