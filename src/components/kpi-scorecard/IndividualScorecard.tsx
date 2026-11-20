"use client";

import { AchievementDisplay, AchievementBadge } from "@/components/ui/achievement-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/useAuth";
import { usePermissions } from "@/hooks/permissions/usePermissions";
import {
  TrendingUp,
  Target,
  Award,
  AlertCircle,
  ArrowRight,
  Info,
  Sparkles,
  History,
  Building2,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@apollo/client";
import { GET_REALTIME_INDIVIDUAL_SCORECARD } from "@/lib/graphql/queries/kpi-scorecard";
import { GET_KPI_ASSIGNMENTS_EMPLOYEE } from "@/lib/graphql/queries/kpis";
import { GET_EMPLOYEES } from "@/lib/graphql/queries/employees";
import { GET_STRATEGIC_PERIODS } from "@/lib/graphql/queries/strategicPeriods";
import { GET_DEPARTMENTS } from "@/lib/graphql/queries/departments";
import EmployeeLifecycleBanner from "@/components/dashboard/EmployeeLifecycleBanner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { KpiModeBadge } from "@/components/kpis/KpiModeBadge";
import { QuarterPerformanceCell } from "./QuarterPerformanceCell";
import { stickyFirstColumnTableClassName } from "@/components/ui/table";
import type { KpiQuarterPlan, KpiQuarterResult } from "@/types/graphql";
import { SortableFilterableHeader } from "@/components/ui/sortable-filterable-header";
import { useTableColumnControls } from "@/hooks/table/useTableColumnControls";
import { useStrategicPeriodStore } from "@/stores";
import { cn } from "@/lib/utils";
import { PredictiveScorecardSimulator } from "./PredictiveScorecardSimulator";
import { EarlyWarningAtRiskAlert } from "./EarlyWarningAtRiskAlert";

interface KpiScore {
  aggregatedKpiScoreId: string;
  kpi: {
    kpiId: string;
    name: string;
    description: string;
    kpiMode?: string;
    managerRetentionPercent?: number;
    quarterPlans?: KpiQuarterPlan[];
    quarterResults?: KpiQuarterResult[];
  };
  level: string;
  actualValue: number;
  targetValue: number;
  weight: number;
  cap: number;
  achievementRate: number;
  cappedRate: number;
  score: number;
  calculatedAt: string;
}

interface ScorecardData {
  totalScore: number;
  maxPossibleScore: number;
  percentageAchieved: number;
  displayAchievement: number;
  bonusEligiblePercentage: number;
  isBonusEligible: boolean;
  kpiScores: KpiScore[];
}

export default function IndividualScorecard({
  capFinalScore = false,
  strategicPeriodId,
}: {
  capFinalScore?: boolean;
  strategicPeriodId?: string;
}) {
  const { user } = useAuth();
  const { can } = usePermissions();
  const canReadAll = can("evaluations:read_all");

  // Use the global strategic period store instead of local state
  const globalSelectedPeriod = useStrategicPeriodStore((state) => state.selectedPeriod);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(
    user?.employeeId || "",
  );
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [showSimulator, setShowSimulator] = useState<boolean>(false);

  // Active fiscal quarter and calendar elapsed pacing calculation
  const { currentQuarterNumber, calendarElapsed } = useMemo(() => {
    const now = new Date();
    const m = now.getMonth();
    // Fiscal quarters starting in July (6):
    // Jul(6), Aug(7), Sep(8) -> Q1
    // Oct(9), Nov(10), Dec(11) -> Q2
    // Jan(0), Feb(1), Mar(2) -> Q3
    // Apr(3), May(4), Jun(5) -> Q4
    const q = m >= 6 ? Math.floor((m - 6) / 3) + 1 : Math.floor(m / 3) + 3;
    let qStartMonth = 9;
    if (q === 1) qStartMonth = 6;
    else if (q === 2) qStartMonth = 9;
    else if (q === 3) qStartMonth = 0;
    else if (q === 4) qStartMonth = 3;

    const qStartDate = new Date(now.getFullYear(), qStartMonth, 1);
    const qEndDate = new Date(now.getFullYear(), qStartMonth + 3, 0, 23, 59, 59);
    const totalMs = qEndDate.getTime() - qStartDate.getTime();
    const elapsedMs = now.getTime() - qStartDate.getTime();
    const elapsed = Math.max(0.05, Math.min(1.0, elapsedMs / totalMs));
    return { currentQuarterNumber: q, calendarElapsed: elapsed };
  }, []);

  // Enforce: Regular employees can only view their own scorecard
  useEffect(() => {
    if (!canReadAll && selectedEmployeeId !== user?.employeeId) {
      setSelectedEmployeeId(user?.employeeId || "");
    }
  }, [canReadAll, user?.employeeId, selectedEmployeeId]);

  // Fetch strategic periods
  const { data: periodsData } = useQuery(GET_STRATEGIC_PERIODS, {
    variables: { page: 1, limit: 50 },
  });

  const periods = periodsData?.strategicPeriods?.items || [];
  const activePeriod = periods.find((p: any) => p.status === "ACTIVE");

  // Prefer the parent-selected period, then global store, otherwise fall back to the active period.
  useEffect(() => {
    if (strategicPeriodId && strategicPeriodId !== selectedPeriodId) {
      setSelectedPeriodId(strategicPeriodId);
      return;
    }

    // Use the global store's selected period (same as Dashboard)
    if (globalSelectedPeriod && globalSelectedPeriod.strategicPeriodId !== selectedPeriodId) {
      setSelectedPeriodId(globalSelectedPeriod.strategicPeriodId);
      return;
    }

    if (activePeriod && !selectedPeriodId) {
      setSelectedPeriodId(activePeriod.strategicPeriodId);
    }
  }, [activePeriod, selectedPeriodId, strategicPeriodId, globalSelectedPeriod]);

  // Fetch employees (for HR/Admin)
  const { data: employeesData } = useQuery(GET_EMPLOYEES, {
    variables: { page: 1, limit: 1000 },
    skip: !canReadAll,
  });

  const employees = employeesData?.employees?.items || [];

  // Fetch scorecard data - REAL-TIME CALCULATION
  const { data: scorecardData, loading: scorecardLoading } = useQuery(
    GET_REALTIME_INDIVIDUAL_SCORECARD,
    {
      variables: {
        employeeId: selectedEmployeeId,
        periodId: selectedPeriodId,
        capFinalScore,
      },
      skip: !selectedEmployeeId || !selectedPeriodId,
      fetchPolicy: "cache-first",
      nextFetchPolicy: "cache-first",
    },
  );

  // Fetch KPI assignments to get parentWeightAllocation
  const { data: assignmentsData } = useQuery(GET_KPI_ASSIGNMENTS_EMPLOYEE, {
    variables: {
      employeeId: selectedEmployeeId,
      strategicPeriodId: selectedPeriodId,
      page: 1,
      limit: 1000,
    },
    skip: !selectedEmployeeId || !selectedPeriodId,
  });

  const scorecard: ScorecardData | undefined =
    scorecardData?.realtimeIndividualScorecard;
  const hasIndividualKpis = Boolean(scorecard?.kpiScores?.length);

  const assignments = assignmentsData?.kpiAssignmentsEmployee?.items || [];

  // Create a map of kpiId to assignment for quick lookup
  const assignmentMap = new Map(assignments.map((a: any) => [a.kpi.kpiId, a]));

  const scorecardColumns = useMemo(
    () => [
      { id: "name", accessor: (row: KpiScore) => row.kpi.name },
      {
        id: "level",
        accessor: (row: KpiScore) => row.level,
        filterFn: (row: KpiScore, value: string) => row.level === value,
      },
      {
        id: "mode",
        accessor: (row: KpiScore) => row.kpi.kpiMode || "",
        filterFn: (row: KpiScore, value: string) =>
          (row.kpi.kpiMode || "") === value,
      },
      { id: "actual", accessor: (row: KpiScore) => row.actualValue },
      { id: "target", accessor: (row: KpiScore) => row.targetValue },
      { id: "achievement", accessor: (row: KpiScore) => row.achievementRate },
      { id: "weight", accessor: (row: KpiScore) => row.weight },
      { id: "cap", accessor: (row: KpiScore) => row.cap },
      { id: "score", accessor: (row: KpiScore) => row.score },
    ],
    [],
  );

  const { processedRows: kpiScoreRows, getHeaderProps } =
    useTableColumnControls({
      rows: scorecard?.kpiScores ?? [],
      columns: scorecardColumns,
    });

  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");

  const orgId = user?.organizationId;
  const { data: deptsData } = useQuery(GET_DEPARTMENTS, {
    variables: { organizationId: orgId, page: 1, limit: 100 },
    skip: !orgId,
  });
  const departments = deptsData?.departments?.items || [];
  const deptMap = useMemo(() => {
    const map = new Map<string, string>();
    departments.forEach((d: any) => map.set(d.departmentId, d.name));
    return map;
  }, [departments]);

  const selectedEmp = employees.find((e: any) => e.employeeId === selectedEmployeeId) || user;
  const activeDeptId = (selectedEmp as any)?.departments?.[0]?.departmentId || (user as any)?.departments?.[0]?.departmentId;
  const activeDeptName = (selectedEmp as any)?.departments?.[0]?.name || (user as any)?.departments?.[0]?.name;

  const getKpiDeptInfo = (kpiId: string) => {
    const assignment = assignmentMap.get(kpiId) as any;
    const parentDeptId = assignment?.kpi?.parent?.assigneeId;
    if (parentDeptId && deptMap.has(parentDeptId)) {
      const name = deptMap.get(parentDeptId)!;
      const isActive = parentDeptId === activeDeptId;
      return { id: parentDeptId, name, isActive };
    }
    return null;
  };

  const distinctDepts = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; isActive: boolean }>();
    kpiScoreRows.forEach((row) => {
      const info = getKpiDeptInfo(row.kpi.kpiId);
      if (info) {
        const existing = map.get(info.id) || { id: info.id, name: info.name, count: 0, isActive: info.isActive };
        existing.count += 1;
        map.set(info.id, existing);
      }
    });
    return Array.from(map.values());
  }, [kpiScoreRows, assignmentMap, deptMap, activeDeptId]);

  const displayedRows = useMemo(() => {
    if (selectedDeptFilter === "ALL") return kpiScoreRows;
    return kpiScoreRows.filter((row) => {
      const info = getKpiDeptInfo(row.kpi.kpiId);
      return info?.id === selectedDeptFilter;
    });
  }, [kpiScoreRows, selectedDeptFilter, assignmentMap, deptMap, activeDeptId]);

  const getAchievementColor = (rate: number | null | undefined): string => {
    if (rate === null || rate === undefined || isNaN(Number(rate))) return "text-muted-foreground";
    const val = Number(rate);
    if (val >= 1.0) return "text-green-600";
    if (val >= 0.75) return "text-blue-600";
    if (val >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  const getAchievementBadge = (
    rate: number | null | undefined,
  ): { label: string; variant: any } => {
    if (rate === null || rate === undefined || isNaN(Number(rate))) {
      return { label: "Pending", variant: "outline" };
    }
    const val = Number(rate);
    if (val >= 1.3)
      return { label: "Exceeds Expectations", variant: "default" };
    if (val >= 1.0)
      return { label: "Meets Expectations", variant: "secondary" };
    if (val >= 0.75) return { label: "Needs Improvement", variant: "outline" };
    return { label: "Below Expectations", variant: "destructive" };
  };

  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(Number(num))) return "0.00";
    return Number(num).toFixed(2);
  };

  const formatPercentage = (num: number | null | undefined): string => {
    if (num === null || num === undefined || isNaN(Number(num))) return "0.0%";
    return `${(Number(num) * 100).toFixed(1)}%`;
  };

  if (!user) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Please log in to view your scorecard.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalScoreRate =
    scorecard && scorecard.maxPossibleScore > 0
      ? scorecard.totalScore / scorecard.maxPossibleScore
      : 0;

  return (
    <div className="space-y-6">
      <EmployeeLifecycleBanner />
      {/* Header with Simulator Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Individual KPI Scorecard
          </h2>
          <p className="text-sm text-muted-foreground">
            Track your KPI performance, pacing indicators, and composite achievements
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasIndividualKpis && (
            <Button
              type="button"
              variant={showSimulator ? "default" : "outline"}
              size="sm"
              onClick={() => setShowSimulator(!showSimulator)}
              className={cn(
                "h-9 gap-1.5 text-xs font-semibold shadow-xs",
                showSimulator
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950",
              )}
            >
              <Sparkles className="h-4 w-4" />
              <span>{showSimulator ? "Close Simulator" : "Predictive Simulator"}</span>
            </Button>
          )}
          <TrendingUp className="hidden h-8 w-8 shrink-0 text-primary sm:block" />
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Employee Selector (HR/Admin only) */}
            {canReadAll && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Employee
                </label>
                <Select
                  value={selectedEmployeeId}
                  onValueChange={setSelectedEmployeeId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp: any) => (
                      <SelectItem key={emp.employeeId} value={emp.employeeId}>
                        {emp.fullName} - {emp.title || "N/A"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Period Selector */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Strategic Period
              </label>
              <Select
                value={selectedPeriodId}
                onValueChange={setSelectedPeriodId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      activePeriod
                        ? `${activePeriod.name} (Active)`
                        : "Select period"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((period: any) => (
                    <SelectItem
                      key={period.strategicPeriodId}
                      value={period.strategicPeriodId}
                    >
                      {period.name}{" "}
                      {period.status === "ACTIVE" ? "(Active)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {scorecardLoading && (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Loading scorecard data...</p>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {!scorecardLoading && !hasIndividualKpis && selectedPeriodId && (
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              No individual KPI assignments were found for this period.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Department-owned support KPIs are shown in the Department
              scorecard, not as personal KPIs.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              An individual score will appear after a KPI with targets and
              weights is assigned directly to the selected employee.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scorecard Summary */}
      {!scorecardLoading && scorecard && hasIndividualKpis && (
        <>
          {/* Early Warning & At-Risk Alert */}
          <EarlyWarningAtRiskAlert
            kpiScores={scorecard.kpiScores}
            currentQuarter={currentQuarterNumber}
          />

          {/* Predictive Performance Simulator (What-If Analysis) */}
          {showSimulator && (
            <PredictiveScorecardSimulator
              currentTotalScore={scorecard.totalScore}
              maxPossibleScore={scorecard.maxPossibleScore}
              kpiScores={scorecard.kpiScores as any}
              currentQuarter={currentQuarterNumber}
            />
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Score Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Score
                </CardTitle>
                <Award className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatNumber(scorecard.totalScore)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  out of {formatNumber(scorecard.maxPossibleScore)}% possible
                </p>
                <Progress
                  value={
                    (scorecard.totalScore / scorecard.maxPossibleScore) * 100
                  }
                  className="mt-2"
                />
              </CardContent>
            </Card>

            {/* Achievement Rate Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Achievement Rate
                </CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <AchievementDisplay
                  displayAchievement={scorecard.displayAchievement}
                  bonusEligiblePercentage={scorecard.bonusEligiblePercentage}
                  isBonusEligible={scorecard.isBonusEligible}
                  size="xl"
                  className={getAchievementColor(scorecard.displayAchievement / 100)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  of weighted targets
                </p>
                <div className="mt-2">
                  <Badge
                    {...getAchievementBadge(scorecard.displayAchievement / 100)}
                  >
                    {
                      getAchievementBadge(scorecard.displayAchievement / 100)
                        .label
                    }
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Total KPIs Card */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Active KPIs
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {scorecard.kpiScores.length}
                </div>
                <p className="text-xs text-muted-foreground">
                  KPIs tracked this period
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Last calculated:{" "}
                  {scorecard.kpiScores[0]
                    ? new Date(
                        scorecard.kpiScores[0].calculatedAt,
                      ).toLocaleDateString()
                    : "N/A"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* KPI Details Table */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle>KPI Performance Details</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Authoritative quarterly targets, actuals, and pacing indicators
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {distinctDepts.length > 1 && (
                    <div className="flex items-center rounded-xl bg-slate-100 p-1 dark:bg-zinc-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedDeptFilter("ALL")}
                        className={cn(
                          "rounded-lg px-2.5 py-1 font-medium transition-colors",
                          selectedDeptFilter === "ALL"
                            ? "bg-white text-slate-900 shadow-2xs dark:bg-zinc-900 dark:text-zinc-100"
                            : "text-slate-600 hover:text-slate-900 dark:text-zinc-400",
                        )}
                      >
                        All KPIs ({kpiScoreRows.length})
                      </button>
                      {distinctDepts.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setSelectedDeptFilter(d.id)}
                          className={cn(
                            "rounded-lg px-2.5 py-1 font-medium transition-colors flex items-center gap-1.5",
                            selectedDeptFilter === d.id
                              ? "bg-white text-slate-900 shadow-2xs dark:bg-zinc-900 dark:text-zinc-100"
                              : "text-slate-600 hover:text-slate-900 dark:text-zinc-400",
                          )}
                        >
                          <span>{d.name}</span>
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.2 rounded-full font-semibold",
                              d.isActive
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-zinc-300",
                            )}
                          >
                            {d.isActive ? "Active" : "Archived"} ({d.count})
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <Badge variant="outline" className="text-xs font-mono">
                    Active Quarter: Q{currentQuarterNumber}
                  </Badge>
                </div>
              </div>
              {selectedDeptFilter !== "ALL" &&
                distinctDepts.find((d) => d.id === selectedDeptFilter && !d.isActive) && (
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200 flex items-center gap-2">
                    <History className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                    <span>
                      <strong>Archived Department Performance:</strong> Delivered Q1 achievements and evaluations from this department are safely preserved and credited. Unworked Q2–Q4 quotas were reallocated to the department holding pool.
                    </span>
                  </div>
                )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <table className={`w-full min-w-[900px] ${stickyFirstColumnTableClassName}`}>
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium min-w-[180px]">
                        <SortableFilterableHeader
                          label="KPI Name"
                          {...getHeaderProps("name")}
                        />
                      </th>
                      <th className="text-center p-3 font-medium min-w-[90px]">
                        <SortableFilterableHeader
                          label="Level"
                          align="center"
                          {...getHeaderProps("level")}
                        />
                      </th>
                      <th className="text-center p-3 font-medium min-w-[110px]">
                        <SortableFilterableHeader
                          label="Mode"
                          align="center"
                          filterType="select"
                          filterOptions={[
                            { value: "DIRECT", label: "Direct" },
                            { value: "HYBRID", label: "Hybrid" },
                            { value: "SHARED", label: "Shared" },
                            { value: "AGGREGATED", label: "Aggregated" },
                          ]}
                          {...getHeaderProps("mode")}
                        />
                      </th>
                      <th className="text-center p-3 font-medium min-w-[220px]">
                        Quarterly Performance
                      </th>
                      <th className="text-right p-3 font-medium">
                        <SortableFilterableHeader
                          label="Actual"
                          align="right"
                          filterable={false}
                          {...getHeaderProps("actual")}
                        />
                      </th>
                      <th className="text-right p-3 font-medium">
                        <SortableFilterableHeader
                          label="Target"
                          align="right"
                          filterable={false}
                          {...getHeaderProps("target")}
                        />
                      </th>
                      <th className="text-right p-3 font-medium">
                        <SortableFilterableHeader
                          label="Achievement"
                          align="right"
                          filterable={false}
                          {...getHeaderProps("achievement")}
                        />
                      </th>
                      <th className="text-right p-3 font-medium">
                        <SortableFilterableHeader
                          label="Weight Allocation"
                          align="right"
                          filterable={false}
                          {...getHeaderProps("weight")}
                        />
                      </th>
                      <th className="text-right p-3 font-medium">
                        <SortableFilterableHeader
                          label="Cap"
                          align="right"
                          filterable={false}
                          {...getHeaderProps("cap")}
                        />
                      </th>
                      <th className="text-right p-3 font-medium">
                        <SortableFilterableHeader
                          label="Score"
                          align="right"
                          filterable={false}
                          {...getHeaderProps("score")}
                        />
                      </th>
                      <th className="text-right p-3 font-medium">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map((kpiScore) => {
                      const achievementPercent = kpiScore.achievementRate * 100;
                      const assignment = assignmentMap.get(kpiScore.kpi.kpiId);
                      const hasParentWeight = Boolean(
                        assignment &&
                          (assignment as any).parentWeightAllocation !== null &&
                          (assignment as any).parentWeightAllocation !==
                            (assignment as any).weight,
                      );

                      // Evaluate active quarter target and at-risk pacing
                      const plans = kpiScore.kpi.quarterPlans || [];
                      const results = kpiScore.kpi.quarterResults || [];
                      const activePlan = plans.find((p: any) => p.quarterNumber === currentQuarterNumber);
                      const activeEffTarget = activePlan ? Number(activePlan.effectiveTarget ?? activePlan.originalTarget ?? 0) : null;
                      const activeResult = results.find((r: any) => activePlan && r.quarterPlanId === activePlan.kpiQuarterPlanId);
                      const activeDelivered = activeResult ? Number(activeResult.finalActual ?? 0) : 0;
                      const isZeroQTarget = activePlan != null && activeEffTarget === 0;
                      const isRowAtRisk =
                        !isZeroQTarget &&
                        activeEffTarget != null &&
                        activeEffTarget > 0 &&
                        activeDelivered / activeEffTarget - calendarElapsed <= -0.2;

                      return (
                        <tr
                          key={kpiScore.aggregatedKpiScoreId}
                          className={cn(
                            "border-b transition-colors hover:bg-muted/50",
                            isRowAtRisk && "bg-red-50/20 dark:bg-red-950/10",
                          )}
                        >
                          <td className="p-3">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-medium">{kpiScore.kpi.name}</p>
                                {(() => {
                                  const deptInfo = getKpiDeptInfo(kpiScore.kpi.kpiId);
                                  if (!deptInfo) return null;
                                  return (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] px-1.5 py-0 font-medium",
                                        deptInfo.isActive
                                          ? "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:bg-emerald-950/50"
                                          : "border-slate-300 text-slate-600 bg-slate-50 dark:border-zinc-700 dark:text-zinc-400 dark:bg-zinc-800/50",
                                      )}
                                    >
                                      {deptInfo.name} {deptInfo.isActive ? "(Active)" : "(Archived Q1)"}
                                    </Badge>
                                  );
                                })()}
                                {isRowAtRisk && (
                                  <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 text-[10px] px-1.5 py-0 font-bold">
                                    🚨 At-Risk
                                  </Badge>
                                )}
                                {isZeroQTarget && (
                                  <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-300 dark:border-slate-700">
                                    No Q{currentQuarterNumber} Target
                                  </Badge>
                                )}
                              </div>
                              {kpiScore.kpi.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {kpiScore.kpi.description}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="text-center p-3">
                            <Badge variant="outline" className="text-xs">
                              {kpiScore.level}
                            </Badge>
                          </td>
                          <td className="text-center p-3">
                            <KpiModeBadge
                              mode={
                                (kpiScore.kpi as any).kpiMode || "AGGREGATED"
                              }
                              size="sm"
                            />
                            {(kpiScore.kpi as any).kpiMode === "HYBRID" &&
                              (kpiScore.kpi as any).managerRetentionPercent && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {
                                    (kpiScore.kpi as any)
                                      .managerRetentionPercent
                                  }
                                  % mgr
                                </p>
                              )}
                          </td>
                          <td className="p-3">
                            <QuarterPerformanceCell
                              kpiId={kpiScore.kpi.kpiId}
                              plans={kpiScore.kpi.quarterPlans}
                              results={kpiScore.kpi.quarterResults}
                            />
                          </td>
                          <td className="text-right p-3 font-medium">
                            {formatNumber(kpiScore.actualValue)}
                          </td>
                          <td className="text-right p-3">
                            {formatNumber(kpiScore.targetValue)}
                          </td>
                          <td
                            className={`text-right p-3 font-medium ${getAchievementColor(kpiScore.achievementRate)}`}
                          >
                            {formatPercentage(kpiScore.achievementRate)}
                          </td>
                          <td className="text-right p-3">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs font-semibold">
                                  {formatNumber(kpiScore.weight)}%
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Local
                                </span>
                              </div>
                              {hasParentWeight && assignment ? (
                                <div className="flex items-center gap-1">
                                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300 font-semibold"
                                  >
                                    {formatNumber(
                                      (assignment as any)
                                        .parentWeightAllocation,
                                    )}
                                    %
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    To Dept
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td className="text-right p-3">
                            {formatPercentage(kpiScore.cap)}
                          </td>
                          <td className="text-right p-3 font-bold text-primary">
                            {formatNumber(kpiScore.score)}%
                          </td>
                          <td className="text-right p-3">
                            <div className="flex items-center justify-end gap-2">
                              <Progress
                                value={Math.min(achievementPercent, 100)}
                                className="w-20"
                              />
                              <span className="text-xs text-muted-foreground w-12">
                                {formatNumber(achievementPercent)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t-2 font-bold">
                    <tr>
                      <td className="p-3">Total</td>
                      <td className="text-right p-3" colSpan={8}></td>
                      <td className="text-right p-3 text-primary text-lg">
                        {formatNumber(scorecard.totalScore)}%
                      </td>
                      <td className="text-right p-3">
                        <Badge {...getAchievementBadge(totalScoreRate)}>
                          {getAchievementBadge(totalScoreRate).label}
                        </Badge>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Formula Explanation */}
              <div className="mt-6 p-4 bg-muted rounded-lg space-y-3">
                <h4 className="text-sm font-semibold mb-2">
                  How Scores & Weight Disruptions are Calculated
                </h4>
                <p className="text-xs text-muted-foreground">
                  <strong>Formula:</strong> Score = Weight × min(Actual /
                  Target, Cap)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  • <strong>Actual:</strong> Sum of approved logbook
                  achievements for this KPI
                </p>
                <p className="text-xs text-muted-foreground">
                  • <strong>Target:</strong> Your assigned target value
                </p>
                <p className="text-xs text-muted-foreground">
                  • <strong>Weight:</strong> Percentage contribution to total
                  score
                </p>
                <p className="text-xs text-muted-foreground">
                  • <strong>Cap:</strong> Maximum achievement rate (e.g., 150%
                  means max 1.5x of weight)
                </p>
                <p className="text-xs text-muted-foreground">
                  • <strong>Early Warning Pacing:</strong> Flags KPIs mid-quarter when progress falls ≥20% behind elapsed calendar time, prompting alignment check-in sessions before period end.
                </p>

                {/* KPI Mode Explanation */}
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Understanding KPI Modes
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <KpiModeBadge mode="AGGREGATED" size="sm" />
                      <p className="text-xs text-muted-foreground">
                        <strong>Aggregated:</strong> Your manager's KPI
                        aggregates results from the team. Your achievements
                        contribute to their score.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <KpiModeBadge mode="DIRECT" size="sm" />
                      <p className="text-xs text-muted-foreground">
                        <strong>Direct:</strong> Manager's personal work KPI.
                        Only their logbook entries count - not assigned to team
                        members.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <KpiModeBadge mode="HYBRID" size="sm" />
                      <p className="text-xs text-muted-foreground">
                        <strong>Hybrid:</strong> Manager retains a percentage
                        for their own work, remainder cascades from team. Both
                        portions contribute to final score.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Weight Allocation Explanation */}
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Understanding Weight Allocation
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Each KPI can have two weight values:
                  </p>
                  <div className="ml-4 mt-2 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      • <strong>Local Weight:</strong> Used for your personal
                      performance tracking and scorecard display
                    </p>
                    <p className="text-xs text-muted-foreground">
                      • <strong>Parent Contribution:</strong> The weight sent to
                      your department when you achieve 100%
                    </p>
                  </div>
                  <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-900">
                    <p className="text-xs text-blue-900 dark:text-blue-100">
                      <strong>Example:</strong> Your KPI shows 8% locally for
                      your tracking, but contributes 6% to the department when
                      fully achieved. This allows flexible local display while
                      maintaining proper cascade aggregation.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
