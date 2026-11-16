"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@apollo/client";
import { GET_CEO_MONTHLY_PERFORMANCE_REPORT } from "@/lib/graphql/queries/ceo-monthly-report";
import {
  exportCeoMonthlyReportPDF,
  CeoMonthlyPdfItem,
} from "@/lib/utils/ceo-monthly-pdf-export";
import { useAuthStore } from "@/stores";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Download,
  FileText,
  Filter,
  Search,
  ShieldAlert,
  Building2,
  Users,
  Target,
  TrendingUp,
  RefreshCw,
  Info,
} from "lucide-react";

const QUARTERS = [
  { value: 1, label: "Q1 (Jul - Sep)", months: ["July", "August", "September"] },
  { value: 2, label: "Q2 (Oct - Dec)", months: ["October", "November", "December"] },
  { value: 3, label: "Q3 (Jan - Mar)", months: ["January", "February", "March"] },
  { value: 4, label: "Q4 (Apr - Jun)", months: ["April", "May", "June"] },
];

export default function CeoMonthlyPerformanceReportView() {
  const user = useAuthStore((state) => state.user);

  // Filter state
  const [fiscalYear, setFiscalYear] = useState<number>(2026);
  const [quarter, setQuarter] = useState<number>(1);
  const [monthInQuarter, setMonthInQuarter] = useState<number>(1);
  const [unitFilter, setUnitFilter] = useState<"ALL" | "DIVISION" | "DEPARTMENT">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Role verification (CEO and SUPER_ADMIN / Deputy CEO only)
  const isAuthorized =
    user?.role === "CEO" || user?.role === "SUPER_ADMIN";

  // Active quarter configuration
  const activeQuarterConfig = useMemo(() => {
    return QUARTERS.find((q) => q.value === quarter) || QUARTERS[0];
  }, [quarter]);

  // GraphQL Query
  const { data, loading, error, refetch } = useQuery(
    GET_CEO_MONTHLY_PERFORMANCE_REPORT,
    {
      variables: {
        filters: {
          year: fiscalYear,
          quarter,
          monthInQuarter,
        },
      },
      skip: !isAuthorized,
      fetchPolicy: "cache-and-network",
    },
  );

  const report = data?.ceoMonthlyPerformanceReport;
  const items: CeoMonthlyPdfItem[] = report?.items || [];

  // Filter items by Unit Type and Search Query
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Unit filter
      if (unitFilter !== "ALL" && item.assigneeType !== unitFilter) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = item.kpiName.toLowerCase().includes(query);
        const matchesObj = item.strategicObjective.toLowerCase().includes(query);
        const matchesUnit = item.unitName.toLowerCase().includes(query);
        if (!matchesName && !matchesObj && !matchesUnit) {
          return false;
        }
      }
      return true;
    });
  }, [items, unitFilter, searchQuery]);

  // Aggregate Metrics
  const summaryMetrics = useMemo(() => {
    if (filteredItems.length === 0) {
      return { totalKpis: 0, avgMonthlyTarget: 0, avgActual: 0, avgAchievement: 0 };
    }
    const totalKpis = filteredItems.length;
    const totalTarget = filteredItems.reduce((acc, curr) => acc + curr.monthlyTarget, 0);
    const totalActual = filteredItems.reduce((acc, curr) => acc + curr.currentMonthActual, 0);
    const totalAchPct = filteredItems.reduce((acc, curr) => acc + curr.achievementPercentage, 0);

    return {
      totalKpis,
      avgMonthlyTarget: totalTarget / totalKpis,
      avgActual: totalActual / totalKpis,
      avgAchievement: totalAchPct / totalKpis,
    };
  }, [filteredItems]);

  // Export PDF Handler
  const handleExportPDF = () => {
    if (!report || filteredItems.length === 0) {
      toast.error("No data available to export.");
      return;
    }

    try {
      setIsExporting(true);
      toast.info("Generating Executive PDF slide...", { duration: 1500 });

      exportCeoMonthlyReportPDF({
        periodName: report.periodName,
        fiscalYear: report.fiscalYear,
        quarterNumber: report.quarterNumber,
        monthInQuarter: report.monthInQuarter,
        calendarMonth: report.calendarMonth,
        items: filteredItems,
      });

      toast.success("Executive PDF Report downloaded successfully!");
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  // Unauthorized Access Screen
  if (!isAuthorized) {
    return (
      <Card className="rounded-3xl border border-rose-200/80 bg-rose-50/50 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-zinc-100">
          Executive Access Restricted
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-zinc-400">
          The CEO Direct-Reports Monthly Performance Report is strictly confidential and restricted
          to the <strong>Chief Executive Officer</strong> and <strong>Super Admin (Deputy CEO)</strong>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Executive Command Header */}
      <Card className="overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-[#3a1d33] to-[#7A4069] p-6 text-white shadow-md dark:border-white/10 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-0 bg-white/20 text-white backdrop-blur-md">
                <FileText className="mr-1.5 h-3.5 w-3.5 text-amber-300" />
                The iCapital Africa Group
              </Badge>
              <Badge className="border-0 bg-[#F58220] font-semibold text-white">
                Executive Monthly Slide
              </Badge>
              {report?.calendarMonth && (
                <Badge variant="outline" className="border-white/30 text-white">
                  {report.calendarMonth}
                </Badge>
              )}
            </div>
            <h2 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
              2. Performance Summary
            </h2>
            <p className="max-w-2xl text-xs text-slate-200 sm:text-sm">
              CEO Direct-Reports Monthly Operational Tracking with cumulative closing deviation carry-over
              across corporate divisions and executive departments.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => refetch()}
              variant="outline"
              size="sm"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              onClick={handleExportPDF}
              disabled={isExporting || loading || filteredItems.length === 0}
              className="bg-[#F58220] font-bold text-white shadow-md hover:bg-[#d97016]"
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Generating PDF..." : "Export Executive PDF Slide"}
            </Button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-6 grid grid-cols-1 gap-3 rounded-2xl bg-black/25 p-4 backdrop-blur-md sm:grid-cols-2 lg:grid-cols-4">
          {/* Fiscal Year */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Fiscal Year</label>
            <Select
              value={fiscalYear.toString()}
              onValueChange={(val) => setFiscalYear(parseInt(val, 10))}
            >
              <SelectTrigger className="border-white/20 bg-white/10 text-white">
                <SelectValue placeholder="Select Fiscal Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">FY 2025</SelectItem>
                <SelectItem value="2026">FY 2026</SelectItem>
                <SelectItem value="2027">FY 2027</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quarter */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Quarter</label>
            <Select
              value={quarter.toString()}
              onValueChange={(val) => setQuarter(parseInt(val, 10))}
            >
              <SelectTrigger className="border-white/20 bg-white/10 text-white">
                <SelectValue placeholder="Select Quarter" />
              </SelectTrigger>
              <SelectContent>
                {QUARTERS.map((q) => (
                  <SelectItem key={q.value} value={q.value.toString()}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Month in Quarter */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Month in Quarter</label>
            <Select
              value={monthInQuarter.toString()}
              onValueChange={(val) => setMonthInQuarter(parseInt(val, 10))}
            >
              <SelectTrigger className="border-white/20 bg-white/10 text-white">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">
                  Month 1 ({activeQuarterConfig.months[0]})
                </SelectItem>
                <SelectItem value="2">
                  Month 2 ({activeQuarterConfig.months[1]})
                </SelectItem>
                <SelectItem value="3">
                  Month 3 ({activeQuarterConfig.months[2]})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search Query */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300">Search KPI / Objective</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search measures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-white/20 bg-white/10 pl-9 text-white placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Scope Toggles & Quick Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={unitFilter === "ALL" ? "default" : "outline"}
            onClick={() => setUnitFilter("ALL")}
            className={unitFilter === "ALL" ? "bg-[#7A4069] text-white hover:bg-[#683358]" : ""}
          >
            All Direct Reports ({items.length})
          </Button>
          <Button
            size="sm"
            variant={unitFilter === "DIVISION" ? "default" : "outline"}
            onClick={() => setUnitFilter("DIVISION")}
            className={
              unitFilter === "DIVISION" ? "bg-[#7A4069] text-white hover:bg-[#683358]" : ""
            }
          >
            <Building2 className="mr-1.5 h-3.5 w-3.5" />
            Divisions (
            {items.filter((i) => i.assigneeType === "DIVISION").length}
            )
          </Button>
          <Button
            size="sm"
            variant={unitFilter === "DEPARTMENT" ? "default" : "outline"}
            onClick={() => setUnitFilter("DEPARTMENT")}
            className={
              unitFilter === "DEPARTMENT" ? "bg-[#7A4069] text-white hover:bg-[#683358]" : ""
            }
          >
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Departments (
            {items.filter((i) => i.assigneeType === "DEPARTMENT").length}
            )
          </Button>
        </div>

        <div className="text-xs text-slate-500 dark:text-zinc-400">
          Showing <strong>{filteredItems.length}</strong> of {items.length} executive measures
        </div>
      </div>

      {/* Aggregate Metric Mini-Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500">Executive KPIs</p>
          <p className="mt-1 text-2xl font-black text-slate-900 dark:text-zinc-100">
            {summaryMetrics.totalKpis}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">Direct to Corporate / CEO</p>
        </Card>

        <Card className="rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500">Avg Monthly Target (1/3 Q)</p>
          <p className="mt-1 text-2xl font-black text-indigo-600 dark:text-indigo-400">
            {summaryMetrics.avgMonthlyTarget.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">Held at 90% for rate metrics</p>
        </Card>

        <Card className="rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500">Avg Current Actual</p>
          <p className="mt-1 text-2xl font-black text-teal-600 dark:text-teal-400">
            {summaryMetrics.avgActual.toLocaleString(undefined, {
              maximumFractionDigits: 1,
            })}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">Approved logbook records</p>
        </Card>

        <Card className="rounded-2xl p-4">
          <p className="text-xs font-semibold text-slate-500">Avg Achievement Rate</p>
          <p
            className={`mt-1 text-2xl font-black ${
              summaryMetrics.avgAchievement >= 100
                ? "text-emerald-600"
                : summaryMetrics.avgAchievement >= 80
                ? "text-blue-600"
                : "text-rose-600"
            }`}
          >
            {summaryMetrics.avgAchievement.toFixed(1)}%
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">Based on adjusted achievement</p>
        </Card>
      </div>

      {/* Main Executive Table */}
      <Card className="overflow-hidden rounded-3xl border border-slate-200/80 shadow-sm dark:border-white/10">
        <CardHeader className="border-b border-slate-100 bg-slate-50/70 py-4 dark:border-zinc-800 dark:bg-zinc-900/50">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 dark:text-zinc-100">
                Monthly Performance Report Preview
              </CardTitle>
              <CardDescription className="text-xs">
                Slide table preview styled in accordance with iCapital Africa Group executive guidelines.
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit text-xs">
              {report?.calendarMonth || "FY 2026"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-rose-500">
              Failed to load executive monthly performance data: {error.message}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Target className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 text-sm font-semibold">No direct report KPIs found</p>
              <p className="mt-1 text-xs text-slate-400">
                Try adjusting the search query or unit filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#7A4069] hover:bg-[#7A4069]">
                    <TableHead className="font-bold text-white min-w-[160px]">
                      Strategic Objective
                    </TableHead>
                    <TableHead className="font-bold text-white min-w-[200px]">
                      Performance Measure (KPI)
                    </TableHead>
                    <TableHead className="font-bold text-white min-w-[140px]">
                      Unit / Assignee
                    </TableHead>
                    <TableHead className="font-bold text-white text-right">
                      Annual Target
                    </TableHead>
                    <TableHead className="font-bold text-white text-right">
                      Monthly Target (1/3 Q)
                    </TableHead>
                    <TableHead className="font-bold text-white text-right">
                      Prev. Deviation
                    </TableHead>
                    <TableHead className="font-bold text-white text-right">
                      Adjusted Ach.
                    </TableHead>
                    <TableHead className="font-bold text-white text-right">
                      Current Actual
                    </TableHead>
                    <TableHead className="font-bold text-white text-right">
                      Closing Deviation
                    </TableHead>
                    <TableHead className="font-bold text-white text-right">
                      Achievement (%)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item, idx) => {
                    const isEven = idx % 2 === 0;
                    const isPercentage =
                      item.unitType === "PERCENT" ||
                      item.unitType === "RATIO" ||
                      item.kpiName.toLowerCase().includes("%") ||
                      item.kpiName.toLowerCase().includes("rate");

                    return (
                      <TableRow
                        key={item.kpiId}
                        className={isEven ? "bg-white dark:bg-zinc-900" : "bg-[#FAF8FA] dark:bg-zinc-800/40"}
                      >
                        <TableCell className="text-xs font-medium text-slate-800 dark:text-zinc-200">
                          {item.strategicObjective}
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-slate-900 dark:text-zinc-100">
                          {item.kpiName}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 dark:text-zinc-300">
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium dark:bg-zinc-800">
                            {item.unitName}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium tabular-nums">
                          {item.annualTarget.toLocaleString()}
                          {isPercentage ? "%" : ""}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium tabular-nums text-indigo-700 dark:text-indigo-400">
                          {item.monthlyTarget.toLocaleString()}
                          {isPercentage ? "%" : ""}
                        </TableCell>
                        <TableCell
                          className={`text-xs text-right font-medium tabular-nums ${
                            item.previousMonthDeviation > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : item.previousMonthDeviation < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-slate-500"
                          }`}
                        >
                          {item.previousMonthDeviation > 0 ? "+" : ""}
                          {item.previousMonthDeviation.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-right font-semibold tabular-nums text-slate-900 dark:text-zinc-100">
                          {item.adjustedAchievement.toLocaleString()}
                          {isPercentage ? "%" : ""}
                        </TableCell>
                        <TableCell className="text-xs text-right font-medium tabular-nums">
                          {item.currentMonthActual.toLocaleString()}
                          {isPercentage ? "%" : ""}
                        </TableCell>
                        <TableCell
                          className={`text-xs text-right font-bold tabular-nums ${
                            item.closingDeviation > 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : item.closingDeviation < 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-slate-500"
                          }`}
                        >
                          {item.closingDeviation > 0 ? "+" : ""}
                          {item.closingDeviation.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-right font-black tabular-nums">
                          <span
                            className={`rounded-md px-1.5 py-0.5 ${
                              item.achievementPercentage >= 100
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                                : item.achievementPercentage >= 80
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                            }`}
                          >
                            {item.achievementPercentage.toFixed(1)}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {/* Footnotes & Formula Information Banner */}
        <div className="border-t border-slate-100 bg-slate-50/80 p-4 text-xs text-slate-500 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
            <div className="space-y-1">
              <p>
                <strong>Mathematical Specifications:</strong> Adjusted Achievement = Current Month Actual + Previous Month Deviation &middot; Closing Deviation = Adjusted Achievement &minus; Monthly Target (1/3 Q).
              </p>
              <p>
                <strong>Deviation Carry-Over Policy:</strong> Closing deviation carries over continuously across months and quarters for additive volume measures. For rate/percentage measures (margins, rates), they are evaluated on current period performance (Prev. Deviation = 0, Achievement floored at 0%).
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
