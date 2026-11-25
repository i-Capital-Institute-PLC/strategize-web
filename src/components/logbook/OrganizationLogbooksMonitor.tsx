"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@apollo/client";
import { GET_LOGBOOK_ENTRIES } from "@/lib/graphql/queries/logbook";
import { GET_DIVISIONS } from "@/lib/graphql/queries/divisions";
import { GET_DEPARTMENTS } from "@/lib/graphql/queries/departments";
import { GET_UNITS } from "@/lib/graphql/queries/units";
import { GET_EMPLOYEES } from "@/lib/graphql/queries/employees";
import { useStrategicPeriodStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SyncButton from "@/components/shared/SyncButton";
import { AttachmentList } from "@/components/files/AttachmentTrigger";
import { SearchIcon, User, Building2, Calendar, FilterX } from "lucide-react";

interface LogbookOwnerDepartment {
  departmentId: string;
  name: string;
  division?: {
    divisionId: string;
    name: string;
  } | null;
}

interface LogbookEntryItem {
  logbookEntryId: string;
  activityDescription: string;
  entryDate: string;
  entryStatus: string;
  evidenceDescription?: string | null;
  decisionsMade?: string | null;
  lessonsLearned?: string | null;
  evidenceUrl?: string | null;
  rejectionReason?: string | null;
  kpiTargetValue?: number | null;
  kpiAchievedValue?: number | null;
  kpiCompletionPercent?: number | null;
  owner?: {
    employeeId: string;
    fullName: string;
    email?: string | null;
    title?: string | null;
    departments?: LogbookOwnerDepartment[] | null;
  } | null;
  linkedKpi?: {
    kpiId: string;
    name: string;
  } | null;
  strategicPeriod?: {
    strategicPeriodId: string;
    name: string;
  } | null;
  evidenceItems?: Array<{
    value: string;
    name?: string;
    mimeType?: string;
    type?: string;
  }> | null;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  SUBMITTED:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  APPROVED:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted (Pending Approval)",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/**
 * Organization-wide logbook monitor for SMEAL.
 * Displays all draft and submitted/reviewed individual logbooks with clear creator attribution.
 */
export function OrganizationLogbooksMonitor() {
  const selectedPeriod = useStrategicPeriodStore(
    (state) => state.selectedPeriod,
  );
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("ALL");
  const [divisionId, setDivisionId] = useState("ALL");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [unitId, setUnitId] = useState("ALL");
  const [employeeId, setEmployeeId] = useState("ALL");
  const [periodScope, setPeriodScope] = useState<"all" | "selected">(
    selectedPeriod?.strategicPeriodId ? "selected" : "all",
  );
  const [searchQuery, setSearchQuery] = useState("");

  const activePeriodFilter =
    periodScope === "selected" && selectedPeriod?.strategicPeriodId
      ? selectedPeriod.strategicPeriodId
      : undefined;

  const { data: divisionsData } = useQuery(GET_DIVISIONS, {
    variables: { page: 1, limit: 200 },
    fetchPolicy: "cache-first",
  });
  const { data: departmentsData } = useQuery(GET_DEPARTMENTS, {
    variables: { page: 1, limit: 300 },
    fetchPolicy: "cache-first",
  });
  const { data: unitsData } = useQuery(GET_UNITS, {
    variables: { page: 1, limit: 300 },
    fetchPolicy: "cache-first",
  });
  const { data: employeesData } = useQuery(GET_EMPLOYEES, {
    variables: { page: 1, limit: 500 },
    fetchPolicy: "cache-first",
  });

  const divisions = divisionsData?.divisions?.items || [];
  const allDepartments = departmentsData?.departments?.items || [];
  const allUnits = unitsData?.units?.items || [];
  const allEmployees = employeesData?.employees?.items || [];

  const filteredDepartments = useMemo(() => {
    if (divisionId === "ALL") return allDepartments;
    return allDepartments.filter(
      (dept: any) => dept.division?.divisionId === divisionId,
    );
  }, [allDepartments, divisionId]);

  const filteredUnits = useMemo(() => {
    return allUnits.filter((unit: any) => {
      if (departmentId !== "ALL") {
        return unit.department?.departmentId === departmentId;
      }
      if (divisionId !== "ALL") {
        const unitDivId =
          unit.division?.divisionId || unit.department?.division?.divisionId;
        return unitDivId === divisionId;
      }
      return true;
    });
  }, [allUnits, divisionId, departmentId]);

  const filteredEmployees = useMemo(() => {
    return allEmployees.filter((emp: any) => {
      if (unitId !== "ALL") {
        const selectedUnit = allUnits.find((u: any) => u.unitId === unitId);
        if (!selectedUnit) return true;
        const memberIds = new Set<string>([
          ...(selectedUnit.unitLead?.employeeId
            ? [selectedUnit.unitLead.employeeId]
            : []),
          ...((selectedUnit.members || []).map((m: any) => m.employeeId) || []),
        ]);
        return memberIds.has(emp.employeeId);
      }
      if (departmentId !== "ALL") {
        return (emp.departments || []).some(
          (d: any) => d.departmentId === departmentId,
        );
      }
      if (divisionId !== "ALL") {
        return (emp.departments || []).some(
          (d: any) => d.division?.divisionId === divisionId,
        );
      }
      return true;
    });
  }, [allEmployees, allUnits, divisionId, departmentId, unitId]);

  const { data, loading, error, refetch } = useQuery(GET_LOGBOOK_ENTRIES, {
    variables: {
      page,
      limit: 50,
      strategicPeriodId: activePeriodFilter,
      entryStatus: status === "ALL" ? undefined : status,
      divisionId: divisionId === "ALL" ? undefined : divisionId,
      departmentId: departmentId === "ALL" ? undefined : departmentId,
      unitId: unitId === "ALL" ? undefined : unitId,
      ownerUserId: employeeId === "ALL" ? undefined : employeeId,
    },
    fetchPolicy: "cache-and-network",
    nextFetchPolicy: "cache-first",
  });

  const hasActiveFilters =
    status !== "ALL" ||
    divisionId !== "ALL" ||
    departmentId !== "ALL" ||
    unitId !== "ALL" ||
    employeeId !== "ALL" ||
    searchQuery.trim().length > 0;

  const resetFilters = () => {
    setStatus("ALL");
    setDivisionId("ALL");
    setDepartmentId("ALL");
    setUnitId("ALL");
    setEmployeeId("ALL");
    setSearchQuery("");
    setPage(1);
  };

  const rawEntries: LogbookEntryItem[] = data?.logbookEntries?.items || [];
  const meta = data?.logbookEntries?.meta;

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rawEntries;

    return rawEntries.filter((entry) => {
      const ownerName = entry.owner?.fullName?.toLowerCase() || "";
      const ownerEmail = entry.owner?.email?.toLowerCase() || "";
      const ownerDept =
        entry.owner?.departments
          ?.map((d) => d.name)
          .join(" ")
          .toLowerCase() || "";
      const activity = entry.activityDescription?.toLowerCase() || "";
      const kpiName = entry.linkedKpi?.name?.toLowerCase() || "";

      return (
        ownerName.includes(q) ||
        ownerEmail.includes(q) ||
        ownerDept.includes(q) ||
        activity.includes(q) ||
        kpiName.includes(q)
      );
    });
  }, [rawEntries, searchQuery]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Organization Logbooks (Draft &amp; Submitted)
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            View individual draft, submitted, approved, and rejected logbooks across the organization.
          </p>
        </div>
        <SyncButton onSync={() => refetch()} label="Sync" />
      </div>

      {/* Filters */}
      <div className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 md:max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by employee, department, activity, KPI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SUBMITTED">Submitted</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
              </SelectContent>
            </Select>

            {selectedPeriod?.strategicPeriodId && (
              <Select
                value={periodScope}
                onValueChange={(value: "all" | "selected") => {
                  setPeriodScope(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[210px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selected">
                    Period: {selectedPeriod.name}
                  </SelectItem>
                  <SelectItem value="all">All Strategic Periods</SelectItem>
                </SelectContent>
              </Select>
            )}

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="gap-1.5 text-xs text-muted-foreground"
              >
                <FilterX className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            value={divisionId}
            onValueChange={(value) => {
              setDivisionId(value);
              setDepartmentId("ALL");
              setUnitId("ALL");
              setEmployeeId("ALL");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Divisions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Divisions</SelectItem>
              {divisions.map((div: any) => (
                <SelectItem key={div.divisionId} value={div.divisionId}>
                  {div.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={departmentId}
            onValueChange={(value) => {
              setDepartmentId(value);
              setUnitId("ALL");
              setEmployeeId("ALL");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Departments</SelectItem>
              {filteredDepartments.map((dept: any) => (
                <SelectItem key={dept.departmentId} value={dept.departmentId}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={unitId}
            onValueChange={(value) => {
              setUnitId(value);
              setEmployeeId("ALL");
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Units" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Units</SelectItem>
              {filteredUnits.map((unit: any) => (
                <SelectItem key={unit.unitId} value={unit.unitId}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={employeeId}
            onValueChange={(value) => {
              setEmployeeId(value);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Employees</SelectItem>
              {filteredEmployees.map((emp: any) => (
                <SelectItem key={emp.employeeId} value={emp.employeeId}>
                  {emp.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading organization logbooks…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Could not load organization logbooks: {error.message}
        </p>
      )}

      {!error && (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const normalizedStatus = String(
              entry.entryStatus || "DRAFT",
            ).toUpperCase();
            const deptNames =
              entry.owner?.departments?.map((d) => d.name).join(", ") || "";
            const divisionNames =
              entry.owner?.departments
                ?.map((d) => d.division?.name)
                .filter(Boolean)
                .join(", ") || "";

            return (
              <details
                key={entry.logbookEntryId}
                className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      {/* Creator Attribution Banner */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                          <User className="h-3.5 w-3.5" />
                          {entry.owner?.fullName || "Unknown Employee"}
                        </span>
                        {entry.owner?.title && (
                          <span className="text-muted-foreground">
                            {entry.owner.title}
                          </span>
                        )}
                        {(deptNames || divisionNames) && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" />
                            {deptNames}
                            {divisionNames ? ` (${divisionNames})` : ""}
                          </span>
                        )}
                      </div>

                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {entry.activityDescription}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {entry.entryDate?.slice(0, 10)}
                        </span>
                        {entry.linkedKpi?.name && (
                          <span>KPI: {entry.linkedKpi.name}</span>
                        )}
                        {entry.strategicPeriod?.name && (
                          <span>Period: {entry.strategicPeriod.name}</span>
                        )}
                      </div>
                    </div>

                    <Badge
                      className={
                        STATUS_BADGE_CLASSES[normalizedStatus] ||
                        STATUS_BADGE_CLASSES.DRAFT
                      }
                    >
                      {STATUS_LABELS[normalizedStatus] || normalizedStatus}
                    </Badge>
                  </div>
                </summary>

                <div className="mt-4 space-y-3 border-t pt-3 text-sm">
                  {entry.owner?.email && (
                    <p className="text-xs text-muted-foreground">
                      Created by: <strong>{entry.owner.fullName}</strong> ({entry.owner.email})
                    </p>
                  )}
                  <p>
                    <span className="font-medium">Evidence / Notes: </span>
                    {entry.evidenceDescription || "No description recorded."}
                  </p>
                  {(entry.decisionsMade || entry.lessonsLearned) && (
                    <p>
                      <span className="font-medium">Outcome / Lessons: </span>
                      {entry.decisionsMade || entry.lessonsLearned}
                    </p>
                  )}
                  <p>
                    <span className="font-medium">Linked KPI: </span>
                    {entry.linkedKpi?.name || "Not linked"}
                  </p>
                  {entry.rejectionReason && (
                    <p className="text-red-600 dark:text-red-400">
                      <span className="font-medium">Rejection reason: </span>
                      {entry.rejectionReason}
                    </p>
                  )}
                  <AttachmentList
                    items={
                      entry.evidenceItems?.length
                        ? entry.evidenceItems.map((item) => ({
                            url: item.value,
                            name: item.name,
                            mimeType: item.mimeType,
                            evidenceType: item.type,
                          }))
                        : entry.evidenceUrl
                          ? [{ url: entry.evidenceUrl }]
                          : []
                    }
                  />
                </div>
              </details>
            );
          })}
        </div>
      )}

      {!loading && !error && filteredEntries.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No logbooks match the current filters.
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          Page {page}
          {meta?.totalPages ? ` of ${meta.totalPages}` : ""} ·{" "}
          {meta?.totalItems ?? filteredEntries.length} total entries
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || page === 1}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || !meta || page >= meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </footer>
    </div>
  );
}
