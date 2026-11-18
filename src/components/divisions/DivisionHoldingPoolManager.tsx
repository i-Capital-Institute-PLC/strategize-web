"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@apollo/client";
import {
  GET_DIVISION_HOLDING_POOL,
  GET_DIVISION_ADJUSTMENT_LEDGER,
} from "@/lib/graphql/queries/target-rebalancing";
import {
  SET_DIVISION_CASCADE_RESERVE,
  SURRENDER_DEPT_TO_DIVISION,
  REALLOCATE_DIVISION_POOL_TO_DEPT,
} from "@/lib/graphql/mutations/target-rebalancing";
import { useStrategicPeriodStore } from "@/stores";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  ArrowDownLeft,
  ArrowUpRight,
  History,
  Layers,
  Plus,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";

interface DepartmentItem {
  id: string;
  departmentName: string;
  managedBy?: string;
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

  const [activeTab, setActiveTab] = useState<"POOLS" | "LEDGER">("POOLS");

  // Dialog States
  const [reserveOpen, setReserveOpen] = useState(false);
  const [surrenderOpen, setSurrenderOpen] = useState(false);
  const [reallocateOpen, setReallocateOpen] = useState(false);

  // Form states
  const [selectedKpiId, setSelectedKpiId] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState<number>(2);
  const [amount, setAmount] = useState<number>(0);
  const [reason, setReason] = useState("");
  const [sourceDeptId, setSourceDeptId] = useState("");
  const [destDeptId, setDestDeptId] = useState("");

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

  // Mutations
  const [setCascadeReserve, { loading: reserveLoading }] = useMutation(
    SET_DIVISION_CASCADE_RESERVE,
    {
      onCompleted: (data) => {
        if (data?.setDivisionCascadeReserve?.success) {
          toast.success(data.setDivisionCascadeReserve.message || "Backup targets saved successfully.");
          setReserveOpen(false);
          resetForms();
          refetchPool();
          refetchLedger();
        } else {
          toast.error("Could not save backup targets.");
        }
      },
      onError: (err) => {
        toast.error(err.message || "Could not save backup targets.");
      },
    },
  );

  const [surrenderDeptQuota, { loading: surrenderLoading }] = useMutation(
    SURRENDER_DEPT_TO_DIVISION,
    {
      onCompleted: (data) => {
        if (data?.surrenderDepartmentPoolToDivision?.success) {
          toast.success(data.surrenderDepartmentPoolToDivision.message || "Targets moved to division pool.");
          setSurrenderOpen(false);
          resetForms();
          refetchPool();
          refetchLedger();
        } else {
          toast.error("Could not pull department targets.");
        }
      },
      onError: (err) => {
        toast.error(err.message || "Could not pull department targets.");
      },
    },
  );

  const [reallocateToDept, { loading: reallocateLoading }] = useMutation(
    REALLOCATE_DIVISION_POOL_TO_DEPT,
    {
      onCompleted: (data) => {
        if (data?.reallocateDivisionPoolToDepartment?.success) {
          toast.success(data.reallocateDivisionPoolToDepartment.message || "Targets given to department.");
          setReallocateOpen(false);
          resetForms();
          refetchPool();
          refetchLedger();
        } else {
          toast.error("Could not give targets to department.");
        }
      },
      onError: (err) => {
        toast.error(err.message || "Could not give targets to department.");
      },
    },
  );

  const resetForms = () => {
    setSelectedKpiId("");
    setSelectedQuarter(2);
    setAmount(0);
    setReason("");
    setSourceDeptId("");
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

  // Submission Handlers
  const handleReserveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKpiId || amount <= 0) {
      toast.error("Please choose a KPI and enter a valid amount.");
      return;
    }
    await setCascadeReserve({
      variables: {
        input: {
          divisionId,
          kpiId: selectedKpiId,
          annualStrategicPeriodId,
          quarterNumber: Number(selectedQuarter),
          amount: Number(amount),
          reason: reason || "Backup targets held at Division level",
        },
      },
    });
  };

  const handleSurrenderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceDeptId || !selectedKpiId || amount <= 0) {
      toast.error("Please fill in all required fields.");
      return;
    }
    await surrenderDeptQuota({
      variables: {
        input: {
          departmentId: sourceDeptId,
          divisionId,
          kpiId: selectedKpiId,
          annualStrategicPeriodId,
          quarterNumber: Number(selectedQuarter),
          amount: Number(amount),
          reason: reason || "Unused targets pulled from department",
        },
      },
    });
  };

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
          reason: reason || "Division backup targets given to department",
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
            Manage targets for {divisionName}. Keep backup targets at the division level, or move targets between departments.
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
                  setReserveOpen(true);
                }}
                className="gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Save Backup Targets
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  resetForms();
                  if (poolKpis.length > 0) setSelectedKpiId(poolKpis[0].kpiId);
                  setSurrenderOpen(true);
                }}
                className="gap-1.5 text-xs text-amber-700 border-amber-300 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                Pull Targets from Department
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  resetForms();
                  if (poolKpis.length > 0) setSelectedKpiId(poolKpis[0].kpiId);
                  setReallocateOpen(true);
                }}
                className="gap-1.5 text-xs text-emerald-700 border-emerald-300 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                Give Targets to Department
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
          Division Targets by KPI ({poolKpis.length})
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
          History & Audit Log ({ledgerEntries.length})
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
                  Once division KPIs are active, you can save backup targets here.
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
                      Division Annual Goal:{" "}
                      <span className="font-medium text-gray-900 dark:text-gray-200">
                        {kpi.annualDivisionTarget} {kpi.measurementUnit}
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
                            <span>Division Goal:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {q.divisionTarget}
                            </span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Given to Departments:</span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {q.assignedDepartmentTargets}
                            </span>
                          </div>
                          <div className="flex justify-between border-t pt-1 font-semibold">
                            <span className={isPast ? "text-slate-500" : isCurrent ? "text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-zinc-400"}>
                              {isPast ? "Unassigned (Locked):" : isCurrent ? "Division Backup:" : "In Backup (Waiting):"}
                            </span>
                            <span className={isPast ? "text-slate-500" : isCurrent ? "text-emerald-700 dark:text-emerald-400" : "text-slate-700 dark:text-zinc-300"}>
                              {q.poolBalance}
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
                              Give {q.poolBalance} to Dept
                            </Button>
                          ) : hasReserve ? (
                            <div className="text-center py-1.5 text-[11px] text-indigo-600 dark:text-indigo-400 font-medium">
                              Reserved: {q.poolBalance}
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
                            {Number(entry.amount).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-muted-foreground">
                            {isSurrender && entry.department?.name && (
                              <span>From {entry.department.name}</span>
                            )}
                            {isAllocate && entry.destinationDepartment?.name && (
                              <span>To {entry.destinationDepartment.name}</span>
                            )}
                            {!isSurrender && !isAllocate && <span>Division Backup</span>}
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

      {/* DIALOG 1: SAVE BACKUP TARGETS */}
      <Dialog open={reserveOpen} onOpenChange={setReserveOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Save Backup Targets</DialogTitle>
            <DialogDescription>
              Keep some targets as a backup at the division level before giving targets to departments.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReserveSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Choose KPI</Label>
              <Select value={selectedKpiId} onValueChange={setSelectedKpiId}>
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Select Division KPI" />
                </SelectTrigger>
                <SelectContent>
                  {poolKpis.map((kpi: any) => (
                    <SelectItem key={kpi.kpiId} value={kpi.kpiId} className="text-xs">
                      {kpi.kpiName} ({kpi.measurementUnit})
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
                <Label className="text-xs">Target amount to keep</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="any"
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="e.g. 50"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Why are you keeping this backup?</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Keeping backup targets for upcoming projects..."
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setReserveOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={reserveLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {reserveLoading ? "Saving..." : "Save Backup Targets"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 2: PULL TARGETS FROM DEPARTMENT */}
      <Dialog open={surrenderOpen} onOpenChange={setSurrenderOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Pull Targets from Department</DialogTitle>
            <DialogDescription>
              Move unused targets from a department back up to the division, so other departments can use them.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSurrenderSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Which department has extra targets?</Label>
              <Select value={sourceDeptId} onValueChange={setSourceDeptId}>
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
                <Label className="text-xs">Target amount to pull</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="any"
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="e.g. 20"
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Department has open positions, moving targets to division..."
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSurrenderOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={surrenderLoading}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {surrenderLoading ? "Moving..." : "Move to Division Pool"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: GIVE TARGETS TO DEPARTMENT */}
      <Dialog open={reallocateOpen} onOpenChange={setReallocateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Give Targets to Department</DialogTitle>
            <DialogDescription>
              Give available backup targets from the division to a department that needs more work.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReallocateSubmit} className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Which department gets the targets?</Label>
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
                <Label className="text-xs">Target amount to give</Label>
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
              <Label className="text-xs">Reason</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Department expanding, assigning extra targets..."
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
                {reallocateLoading ? "Assigning..." : "Give Targets to Department"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
