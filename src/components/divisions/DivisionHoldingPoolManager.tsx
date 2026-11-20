"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@apollo/client";
import {
  GET_DIVISION_HOLDING_POOL,
  GET_DIVISION_ADJUSTMENT_LEDGER,
  GET_DEPARTURE_CLEARANCE_REQUESTS,
} from "@/lib/graphql/queries/target-rebalancing";
import {
  REALLOCATE_DIVISION_POOL_TO_DEPT,
  REQUEST_DEPARTURE_CLEARANCE,
  APPROVE_DEPARTURE_CLEARANCE,
  REJECT_DEPARTURE_CLEARANCE,
} from "@/lib/graphql/mutations/target-rebalancing";
import { useStrategicPeriodStore } from "@/stores";
import { useAuthContext } from "@/providers/AuthProvider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  History,
  Layers,
  Plus,
  RefreshCw,
  UserMinus,
  XCircle,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { format } from "date-fns";

interface DepartmentItem {
  id: string;
  departmentName: string;
  managedBy?: string;
  managerId?: string | null;
  managerEmail?: string | null;
  members?: number;
}

interface DivisionHoldingPoolManagerProps {
  divisionId: string;
  divisionName: string;
  departments: DepartmentItem[];
  readOnly?: boolean;
}

export default function DivisionHoldingPoolManager({
  divisionId,
  divisionName,
  departments,
  readOnly = false,
}: DivisionHoldingPoolManagerProps) {
  const selectedPeriod = useStrategicPeriodStore((state) => state.selectedPeriod);
  const annualStrategicPeriodId = selectedPeriod?.strategicPeriodId;
  const { user } = useAuthContext();

  const [activeTab, setActiveTab] = useState<"POOLS" | "LEDGER" | "CLEARANCES">("POOLS");

  // Dialog States
  const [reallocateOpen, setReallocateOpen] = useState(false);
  const [departManagerOpen, setDepartManagerOpen] = useState(false);

  // Form states
  const [selectedKpiId, setSelectedKpiId] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState<number>(2);
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [destDeptId, setDestDeptId] = useState("");

  // Manager Departure form states
  const [selectedDeptForDeparture, setSelectedDeptForDeparture] = useState("");
  const [departureDate, setDepartureDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [departureReason, setDepartureReason] = useState("");
  const [sweepImmediately, setSweepImmediately] = useState(true);

  // Queries
  const {
    data: poolData,
    loading: poolLoading,
    refetch: refetchPool,
  } = useQuery(GET_DIVISION_HOLDING_POOL, {
    variables: { divisionId, annualStrategicPeriodId: annualStrategicPeriodId || "" },
    skip: !annualStrategicPeriodId,
    fetchPolicy: "cache-and-network",
  });

  const {
    data: ledgerData,
    loading: ledgerLoading,
    refetch: refetchLedger,
  } = useQuery(GET_DIVISION_ADJUSTMENT_LEDGER, {
    variables: { divisionId, annualStrategicPeriodId: annualStrategicPeriodId || "" },
    skip: !annualStrategicPeriodId,
    fetchPolicy: "cache-and-network",
  });

  const {
    data: clearancesData,
    loading: clearancesLoading,
    refetch: refetchClearances,
  } = useQuery(GET_DEPARTURE_CLEARANCE_REQUESTS, {
    fetchPolicy: "cache-and-network",
  });

  // Mutations
  const [requestDeparture, { loading: requestingDeparture }] = useMutation(
    REQUEST_DEPARTURE_CLEARANCE,
  );
  const [approveDeparture, { loading: approvingDeparture }] = useMutation(
    APPROVE_DEPARTURE_CLEARANCE,
  );
  const [rejectDeparture, { loading: rejectingDeparture }] = useMutation(
    REJECT_DEPARTURE_CLEARANCE,
  );

  // Mutations
  const [reallocateToDept, { loading: reallocateLoading }] = useMutation(
    REALLOCATE_DIVISION_POOL_TO_DEPT,
    {
      onCompleted: (data) => {
        if (data?.reallocateDivisionPoolToDepartment?.success) {
          toast.success(data.reallocateDivisionPoolToDepartment.message || "Targets allocated to department successfully.");
          setReallocateOpen(false);
          resetForms();
          refetchPool();
          refetchLedger();
        } else {
          toast.error("Could not allocate targets to department.");
        }
      },
      onError: (err) => {
        toast.error(err.message || "Could not allocate targets to department.");
      },
    },
  );

  const resetForms = () => {
    setSelectedKpiId("");
    setSelectedQuarter(2);
    setAmount(0);
    setReason("");
    setDestDeptId("");
  };

  const poolKpis = useMemo(() => {
    return poolData?.divisionHoldingPool || [];
  }, [poolData]);

  const ledgerEntries = useMemo(() => {
    return ledgerData?.divisionAdjustmentLedger || [];
  }, [ledgerData]);

  const currentQuarterNum = useMemo(() => {
    const month = new Date().getMonth();
    return month >= 6 ? Math.floor((month - 6) / 3) + 1 : Math.floor(month / 3) + 3;
  }, []);

  const isPercent = (kpi: any) => {
    const type = (kpi?.unitType || "").toUpperCase();
    const unit = (kpi?.measurementUnit || "").toUpperCase();
    const name = (kpi?.kpiName || kpi?.name || "").toUpperCase();
    return (
      type === "PERCENT" ||
      type === "PERCENTAGE" ||
      unit.includes("PERCENT") ||
      unit.includes("%") ||
      name.includes("RATE") ||
      name.includes("RATIO")
    );
  };

  const isCurrency = (kpi: any) => {
    if (isPercent(kpi)) return false;
    const type = (kpi?.unitType || "").toUpperCase();
    const unit = (kpi?.measurementUnit || "").toUpperCase();
    const name = (kpi?.kpiName || kpi?.name || "").toUpperCase();
    return (
      type === "CURRENCY" ||
      type === "MONETARY" ||
      unit.includes("ETB") ||
      unit.includes("BIRR") ||
      unit.includes("USD") ||
      unit.includes("$") ||
      unit.includes("CURRENCY") ||
      name.includes("REVENUE") ||
      name.includes("PIPELINE VALUE") ||
      (name.includes("VALUE") && !isPercent(kpi)) ||
      Number(kpi?.annualDivisionTarget || 0) >= 1000000
    );
  };

  const formatNumber = (val: number) => {
    return Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatTargetWithUnit = (val: number, kpi: any): string => {
    const formattedNum = formatNumber(val);
    if (!kpi) return formattedNum;

    if (isCurrency(kpi)) {
      return `${formattedNum} ETB`;
    }
    if (isPercent(kpi)) {
      return `${formattedNum}%`;
    }

    const unit = (kpi.measurementUnit || "").trim();
    const unitLower = unit.toLowerCase();
    if (
      !unit ||
      unitLower === "number" ||
      unitLower === "count" ||
      unitLower === "numeric" ||
      unitLower === "unit" ||
      unitLower === "units"
    ) {
      return formattedNum;
    }
    return `${formattedNum} ${unit}`;
  };

  const divisionDeptIdSet = useMemo(() => {
    return new Set(departments.map((d) => d.id));
  }, [departments]);

  const divisionClearances = useMemo(() => {
    const all = clearancesData?.departureClearanceRequests ?? [];
    return all.filter((c: any) => divisionDeptIdSet.has(c.departmentId));
  }, [clearancesData, divisionDeptIdSet]);

  const pendingClearancesCount = useMemo(() => {
    return divisionClearances.filter((c: any) => c.status === "PENDING").length;
  }, [divisionClearances]);

  const departmentsWithManagers = useMemo(() => {
    return departments.filter(
      (d) => d.managedBy && d.managedBy !== "Unassigned",
    );
  }, [departments]);

  const selectedDeptItem = useMemo(() => {
    return departments.find((d) => d.id === selectedDeptForDeparture);
  }, [departments, selectedDeptForDeparture]);

  const selectedKpiForReallocate = useMemo(() => {
    return poolKpis.find((k: any) => k.kpiId === selectedKpiId);
  }, [poolKpis, selectedKpiId]);

  const isDirectorOrHr = useMemo(() => {
    if (!user) return false;
    const email = (user.email || "").toLowerCase();
    const title = (user.title || "").toLowerCase();
    const role = (user.role || "").toUpperCase();
    return (
      role === "DIRECTOR" ||
      role === "ADMIN" ||
      role === "EXECUTIVE" ||
      title.includes("director") ||
      title.includes("hr") ||
      email.includes("hr") ||
      email.includes("kaleb")
    );
  }, [user]);

  const handleDepartManagerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeptForDeparture) {
      toast.error("Please select a department.");
      return;
    }
    const targetDept = departments.find((d) => d.id === selectedDeptForDeparture);
    if (!targetDept || !targetDept.managerId) {
      toast.error("The selected department has no active manager assigned.");
      return;
    }

    try {
      const res = await requestDeparture({
        variables: {
          input: {
            departmentId: targetDept.id,
            employeeId: targetDept.managerId,
            annualStrategicPeriodId: annualStrategicPeriodId || "",
            effectiveDate: departureDate,
            reason:
              departureReason.trim() ||
              `Department Manager departure: ${targetDept.managedBy} resigned from ${targetDept.departmentName}`,
          },
        },
      });

      const reqId = res.data?.requestDepartureClearance?.departureClearanceRequestId;

      if (sweepImmediately && reqId) {
        const approveRes = await approveDeparture({
          variables: {
            input: {
              departureClearanceRequestId: reqId,
              notes: "Approved and swept by Division Director / HR",
            },
          },
        });
        if (approveRes.data?.approveDepartureClearance?.success) {
          toast.success(
            approveRes.data.approveDepartureClearance.message ||
              `Manager ${targetDept.managedBy} departed. Department targets swept to Division Pool!`,
          );
        }
      } else {
        toast.success("Manager departure clearance request submitted for review.");
      }

      setDepartManagerOpen(false);
      setDepartureReason("");
      refetchPool();
      refetchLedger();
      refetchClearances();
    } catch (err: any) {
      toast.error(err.message || "Failed to process manager departure.");
    }
  };

  const handleApproveClearance = async (requestId: string) => {
    try {
      const res = await approveDeparture({
        variables: {
          input: {
            departureClearanceRequestId: requestId,
            notes: "Approved by Division Director / HR",
          },
        },
      });
      if (res.data?.approveDepartureClearance?.success) {
        toast.success(
          res.data.approveDepartureClearance.message || "Departure clearance approved.",
        );
        refetchPool();
        refetchLedger();
        refetchClearances();
      }
    } catch (err: any) {
      toast.error(err.message || "Could not approve clearance.");
    }
  };

  const handleRejectClearance = async (requestId: string) => {
    const rejectReason = window.prompt("Please enter a reason for rejecting the clearance:");
    if (!rejectReason) return;
    try {
      await rejectDeparture({
        variables: {
          input: {
            departureClearanceRequestId: requestId,
            reason: rejectReason,
          },
        },
      });
      toast.success("Departure clearance rejected.");
      refetchClearances();
    } catch (err: any) {
      toast.error(err.message || "Could not reject clearance.");
    }
  };

  // Submission Handlers
  const handleReallocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destDeptId || !selectedKpiId || amount <= 0) {
      toast.error("Please fill in all required fields.");
      return;
    }
    await reallocateToDept({
      variables: {
        input: {
          divisionId,
          destinationDepartmentId: destDeptId,
          kpiId: selectedKpiId,
          annualStrategicPeriodId,
          quarterNumber: Number(selectedQuarter),
          amount: Number(amount),
          reason: reason || "Holding pool quota allocated to department",
        },
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner & Action Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-muted/40 rounded-xl border">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Division Holding Pool
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage holding pool targets and departmental distributions for {divisionName}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              refetchPool();
              refetchLedger();
            }}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>

          {!readOnly && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  resetForms();
                  if (poolKpis.length > 0) setSelectedKpiId(poolKpis[0].kpiId);
                  setReallocateOpen(true);
                }}
                className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Distribute Quota
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDepartManagerOpen(true);
                  if (departmentsWithManagers.length > 0) {
                    setSelectedDeptForDeparture(departmentsWithManagers[0].id);
                  }
                }}
                className="gap-1.5 text-xs text-rose-700 border-rose-300 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              >
                <UserMinus className="w-3.5 h-3.5" />
                Depart Department Head
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 space-x-6">
        <button
          type="button"
          onClick={() => setActiveTab("POOLS")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "POOLS"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          Target Pools ({poolKpis.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("LEDGER")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "LEDGER"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <History className="w-4 h-4" />
          Audit History ({ledgerEntries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("CLEARANCES")}
          className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "CLEARANCES"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <UserMinus className="w-4 h-4" />
          Manager Clearances ({divisionClearances.length})
          {pendingClearancesCount > 0 && (
            <Badge variant="destructive" className="ml-1 px-1.5 py-0.2 text-[10px]">
              {pendingClearancesCount} Pending
            </Badge>
          )}
        </button>
      </div>

      {/* TAB CONTENT: POOLS */}
      {activeTab === "POOLS" && (
        <div className="flex flex-col gap-6">
          {poolLoading && poolKpis.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground animate-pulse">
              Loading Division Holding Pool...
            </div>
          ) : poolKpis.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-gray-500 text-sm">
                  No active Division KPIs found for this period.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Holding pool targets will appear here once division KPIs are configured.
                </p>
              </CardContent>
            </Card>
          ) : (
            poolKpis.map((kpi: any) => (
              <Card key={kpi.kpiId} className="overflow-hidden">
                <div className="p-4 border-b bg-muted/20 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {kpi.kpiName}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Division Annual Target:{" "}
                      <span className="font-medium text-gray-900 dark:text-gray-200">
                        {formatTargetWithUnit(kpi.annualDivisionTarget, kpi)}
                      </span>
                    </p>
                  </div>
                  <Badge variant="secondary" className="w-fit text-xs">
                    {kpi.unitType}
                  </Badge>
                </div>

                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {kpi.quarters.map((q: any) => {
                    const hasReserve = Number(q.poolBalance) > 0;
                    const isPast = q.quarterNumber < currentQuarterNum;
                    const isCurrent = q.quarterNumber === currentQuarterNum;

                    return (
                      <div
                        key={q.quarterNumber}
                        className={`p-3 rounded-lg border flex flex-col justify-between gap-3 ${
                          isPast
                            ? "bg-slate-50/60 border-slate-200 opacity-80 dark:bg-zinc-900/40 dark:border-zinc-800"
                            : isCurrent
                            ? hasReserve
                              ? "bg-emerald-50/40 border-emerald-300 dark:bg-emerald-950/20 dark:border-emerald-800/50 ring-1 ring-emerald-400/30"
                              : "bg-white border-slate-200 dark:bg-zinc-900 dark:border-zinc-800"
                            : hasReserve
                            ? "bg-indigo-50/40 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-900/40"
                            : "bg-muted/10 border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                            Quarter {q.quarterNumber}
                          </span>
                          {isPast ? (
                            <Badge variant="secondary" className="text-[10px] bg-slate-200/80 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400">
                              Past Quarter (Closed)
                            </Badge>
                          ) : isCurrent ? (
                            <Badge className="bg-emerald-600 text-white text-[10px]">
                              Present Quarter (Active)
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                              Upcoming (Locked)
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between text-muted-foreground">
                            <span>Division Target:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatTargetWithUnit(q.divisionTarget, kpi)}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Assigned to Departments:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatTargetWithUnit(
                                Number(q.assignedDepartmentsTarget ?? q.assignedDepartmentTargets ?? 0),
                                kpi,
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between border-t pt-1 font-semibold">
                            <span className={isPast ? "text-slate-500" : isCurrent ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-zinc-400"}>
                              {isPast ? "Unassigned:" : isCurrent ? "Holding Pool Balance:" : "Upcoming Pool:"}
                            </span>
                            <span className={isPast ? "text-slate-500" : isCurrent ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-zinc-300"}>
                              {formatTargetWithUnit(q.poolBalance, kpi)}
                            </span>
                          </div>
                        </div>

                        {isPast ? (
                          <Button
                            size="sm"
                            disabled
                            variant="outline"
                            className="w-full text-xs text-muted-foreground cursor-not-allowed bg-slate-50 dark:bg-zinc-800/40"
                          >
                            Quarter Closed
                          </Button>
                        ) : isCurrent ? (
                          hasReserve && !readOnly ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                resetForms();
                                setSelectedKpiId(kpi.kpiId);
                                setSelectedQuarter(q.quarterNumber);
                                setAmount(q.poolBalance);
                                setReallocateOpen(true);
                              }}
                              className="w-full text-xs gap-1 border-emerald-300 hover:bg-emerald-100/50 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300"
                            >
                              <ArrowUpRight className="w-3 h-3" />
                              Distribute {formatTargetWithUnit(q.poolBalance, kpi)} to Dept
                            </Button>
                          ) : hasReserve ? (
                            <div className="text-center py-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                              In Pool: {formatTargetWithUnit(q.poolBalance, kpi)}
                            </div>
                          ) : (
                            <div className="text-center py-1.5 text-[11px] text-muted-foreground font-medium">
                              ✓ Fully Assigned
                            </div>
                          )
                        ) : (
                          <Button
                            size="sm"
                            disabled
                            variant="outline"
                            className="w-full text-xs text-muted-foreground cursor-not-allowed bg-slate-50 dark:bg-zinc-800/40"
                          >
                            Locked (Opens in Q{q.quarterNumber})
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* TAB CONTENT: LEDGER */}
      {activeTab === "LEDGER" && (
        <Card>
          <CardContent className="p-0">
            {ledgerLoading && ledgerEntries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">
                Loading history...
              </div>
            ) : ledgerEntries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No division target changes recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3">Quarter</th>
                      <th className="py-2.5 px-3">KPI</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">From / To</th>
                      <th className="py-2.5 px-3">Reason</th>
                      <th className="py-2.5 px-3">Approved By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ledgerEntries.map((entry: any) => {
                      const isSurrender =
                        entry.transactionType === "DEPT_TO_DIVISION_SURRENDER";
                      const isAllocate =
                        entry.transactionType === "DIVISION_TO_DEPT_ALLOCATE";
                      return (
                        <tr
                          key={entry.targetAdjustmentLedgerId}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                            {format(new Date(entry.createdAt), "yyyy-MM-dd HH:mm")}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] uppercase ${
                                isSurrender
                                  ? "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/20"
                                  : isAllocate
                                  ? "border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20"
                                  : "border-indigo-300 text-indigo-700 bg-indigo-50 dark:bg-indigo-950/20"
                              }`}
                            >
                              {entry.transactionType.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 font-semibold">
                            Q{entry.quarterNumber}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-gray-100">
                            {entry.kpi?.name || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-gray-100">
                            {formatTargetWithUnit(entry.amount, entry.kpi)}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {isSurrender && entry.department?.name && (
                              <span>From {entry.department.name}</span>
                            )}
                            {isAllocate && entry.destinationDepartment?.name && (
                              <span>To {entry.destinationDepartment.name}</span>
                            )}
                            {!isSurrender && !isAllocate && <span>Division Holding Pool</span>}
                          </td>
                          <td className="py-2.5 px-3 max-w-[200px] truncate" title={entry.reason}>
                            {entry.reason}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {entry.approvedBy?.fullName || "Director"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB CONTENT: CLEARANCES (Manager Departures) */}
      {activeTab === "CLEARANCES" && (
        <Card>
          <CardContent className="p-0">
            {clearancesLoading && divisionClearances.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground animate-pulse">
                Loading clearances...
              </div>
            ) : divisionClearances.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No manager departure clearances recorded for departments in this division.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Manager</th>
                      <th className="py-2.5 px-3 text-right">Swept Quota</th>
                      <th className="py-2.5 px-3">Reason</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {divisionClearances.map((c: any) => {
                      const isPending = c.status === "PENDING";
                      const isApproved = c.status === "APPROVED";
                      const isRejected = c.status === "REJECTED";
                      return (
                        <tr
                          key={c.departureClearanceRequestId}
                          className="hover:bg-muted/20 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                            {format(new Date(c.effectiveDate || c.createdAt), "yyyy-MM-dd")}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-gray-100">
                            {c.department?.name || "—"}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-gray-100">
                            {c.employee?.fullName || "—"}
                            <span className="block text-[10px] text-muted-foreground font-normal">
                              {c.employee?.title || "Department Manager"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-gray-100">
                            {c.sweptAmount ? Number(c.sweptAmount).toLocaleString() : "—"}
                          </td>
                          <td
                            className="py-2.5 px-3 max-w-[220px] truncate text-muted-foreground"
                            title={c.reason}
                          >
                            {c.reason}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                isApproved
                                  ? "border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/20"
                                  : isPending
                                  ? "border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/20"
                                  : "border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/20"
                              }`}
                            >
                              {c.status}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            {isPending && isDirectorOrHr ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={approvingDeparture}
                                  onClick={() =>
                                    handleApproveClearance(c.departureClearanceRequestId)
                                  }
                                  className="h-7 px-2 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
                                >
                                  <Check className="w-3 h-3 mr-1" />
                                  Approve & Sweep
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={rejectingDeparture}
                                  onClick={() =>
                                    handleRejectClearance(c.departureClearanceRequestId)
                                  }
                                  className="h-7 px-2 text-[11px] text-rose-700 border-rose-300 hover:bg-rose-50"
                                >
                                  <X className="w-3 h-3 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            ) : isApproved ? (
                              <span className="text-[11px] font-medium text-emerald-600 flex items-center justify-end gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Swept to Pool
                              </span>
                            ) : isRejected ? (
                              <span className="text-[11px] font-medium text-rose-600 flex items-center justify-end gap-1">
                                <XCircle className="w-3.5 h-3.5" />
                                Rejected
                              </span>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                Pending HR
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* DIALOG: DISTRIBUTE TARGETS TO DEPARTMENT */}
      <Dialog open={reallocateOpen} onOpenChange={setReallocateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Distribute Targets to Department</DialogTitle>
            <DialogDescription>
              Allocate available holding pool targets from the division to a department.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReallocateSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Destination Department</Label>
              <Select value={destDeptId} onValueChange={setDestDeptId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Choose department..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id} className="text-xs">
                      {dept.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">KPI</Label>
              <Select value={selectedKpiId} onValueChange={setSelectedKpiId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Select KPI" />
                </SelectTrigger>
                <SelectContent>
                  {poolKpis.map((kpi: any) => (
                    <SelectItem key={kpi.kpiId} value={kpi.kpiId} className="text-xs">
                      {kpi.kpiName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Quarter</Label>
                <Select
                  value={String(selectedQuarter)}
                  onValueChange={(val) => setSelectedQuarter(Number(val))}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1" disabled className="text-slate-400">Quarter 1 (Closed)</SelectItem>
                    <SelectItem value="2" className="font-semibold text-emerald-600">Quarter 2 (Present Active)</SelectItem>
                    <SelectItem value="3" disabled className="text-slate-400">Quarter 3 (Locked)</SelectItem>
                    <SelectItem value="4" disabled className="text-slate-400">Quarter 4 (Locked)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">
                  Target Amount
                  {selectedKpiForReallocate && amount > 0
                    ? ` • ${formatTargetWithUnit(amount, selectedKpiForReallocate)}`
                    : ""}
                </Label>
                <Input
                  type="number"
                  min="0.01"
                  step="any"
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="e.g. 25"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Reason / Allocation Notes</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Department expanding, allocating extra quota..."
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReallocateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={reallocateLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {reallocateLoading ? "Allocating..." : "Distribute Targets"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: DEPART DEPARTMENT MANAGER */}
      <Dialog open={departManagerOpen} onOpenChange={setDepartManagerOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <UserMinus className="h-5 w-5" />
              Depart Department Manager
            </DialogTitle>
            <DialogDescription>
              Offboard a Department Manager in this division. The managerial seat will become vacant, and unachieved department targets will sweep into the Division Holding Pool.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDepartManagerSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Select Department & Manager</Label>
              <Select
                value={selectedDeptForDeparture}
                onValueChange={setSelectedDeptForDeparture}
              >
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Select Department..." />
                </SelectTrigger>
                <SelectContent>
                  {departmentsWithManagers.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id} className="text-xs">
                      {dept.departmentName} — (Manager: {dept.managedBy})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDeptItem && (
              <div className="p-3 bg-muted/40 rounded-lg border text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department:</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {selectedDeptItem.departmentName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Manager:</span>
                  <span className="font-semibold text-rose-700 dark:text-rose-400">
                    {selectedDeptItem.managedBy}
                  </span>
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Effective Departure Date</Label>
              <Input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Reason / Note (Optional)</Label>
              <Input
                value={departureReason}
                onChange={(e) => setDepartureReason(e.target.value)}
                placeholder="e.g. Resigned to pursue external opportunity..."
                className="mt-1 text-xs"
              />
            </div>

            {isDirectorOrHr && (
              <div className="flex items-center justify-between border rounded-lg p-3 bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40">
                <div className="space-y-0.5">
                  <Label className="text-xs font-semibold text-rose-900 dark:text-rose-300">
                    Approve & Sweep Immediately
                  </Label>
                  <p className="text-[11px] text-rose-700/80 dark:text-rose-400">
                    Directly offboard manager and sweep quota into Division Pool
                  </p>
                </div>
                <Switch
                  checked={sweepImmediately}
                  onCheckedChange={setSweepImmediately}
                />
              </div>
            )}

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex gap-2 items-start">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <span>
                <strong>Leadership Rebalance:</strong> Upon departure, the manager&apos;s status becomes <code>DISABLED</code>, the department head seat becomes <strong>VACANT</strong>, and unachieved targets move up to the Division Holding Pool for reallocation by the Division Director.
              </span>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDepartManagerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={requestingDeparture || approvingDeparture || !selectedDeptForDeparture}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {requestingDeparture || approvingDeparture
                  ? "Processing..."
                  : sweepImmediately
                  ? "Depart Manager & Sweep Quota"
                  : "Submit Departure Clearance"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
