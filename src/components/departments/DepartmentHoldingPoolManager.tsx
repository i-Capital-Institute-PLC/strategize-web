"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation } from "@apollo/client";
import {
  GET_DEPARTMENT_HOLDING_POOL,
  GET_TARGET_ADJUSTMENT_LEDGER,
  GET_DEPARTURE_CLEARANCE_REQUESTS,
} from "@/lib/graphql/queries/target-rebalancing";
import {
  SWEEP_DEPARTURE_QUOTA,
  DISTRIBUTE_HOLDING_POOL_QUOTA,
  PROCESS_INTERNAL_TRANSFER,
  PROCESS_ROLE_TRANSITION,
  REQUEST_DEPARTURE_CLEARANCE,
  APPROVE_DEPARTURE_CLEARANCE,
  REJECT_DEPARTURE_CLEARANCE,
} from "@/lib/graphql/mutations/target-rebalancing";
import { useStrategicPeriodStore } from "@/stores";
import { useAuthContext } from "@/providers/AuthProvider";
import { Card } from "@/components/ui/card";
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
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  History,
  Layers,
  RefreshCw,
  TrendingUp,
  UserCheck,
  UserMinus,
  UserPlus,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import PromoteEmployeeDialog from "@/components/employees/PromoteEmployeeDialog";

interface DepartmentHoldingPoolManagerProps {
  departmentId: string;
  departmentName: string;
  employees: Array<{ employeeId: string; fullName: string; title?: string; status?: string }>;
  allDepartments?: Array<{ departmentId: string; name: string }>;
  onEmployeeTransferred?: () => void;
}

export default function DepartmentHoldingPoolManager({
  departmentId,
  departmentName,
  employees,
  allDepartments = [],
  onEmployeeTransferred,
}: DepartmentHoldingPoolManagerProps) {
  const selectedPeriod = useStrategicPeriodStore((state) => state.selectedPeriod);
  const annualStrategicPeriodId = selectedPeriod?.strategicPeriodId;
  const { user } = useAuthContext();

  // Active view tab: "POOLS", "LEDGER", or "CLEARANCES"
  const [activeTab, setActiveTab] = useState<"POOLS" | "LEDGER" | "CLEARANCES">("POOLS");

  // Dialog States
  const [departureOpen, setDepartureOpen] = useState(false);
  const [distributeOpen, setDistributeOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);

  // HR Rejection Dialog State
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedClearanceToReject, setSelectedClearanceToReject] = useState<any>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState("");

  // Selected KPI / Quarter for Distribution
  const [selectedKpiForDist, setSelectedKpiForDist] = useState<any>(null);
  const [selectedQuarterForDist, setSelectedQuarterForDist] = useState<number>(1);

  // Departure Form State
  const [departingEmpId, setDepartingEmpId] = useState("");
  const [departureDate, setDepartureDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [departureReason, setDepartureReason] = useState("");

  // Distribution Form State
  const [recipientEmpId, setRecipientEmpId] = useState("");
  const [quotaDelta, setQuotaDelta] = useState<number>(0);
  const [prorationEnabled, setProrationEnabled] = useState(false);
  const [prorationDays, setProrationDays] = useState(60);
  const [totalQuarterDays, setTotalQuarterDays] = useState(90);
  const [distributeReason, setDistributeReason] = useState("");

  // Derived proration calculations
  const safeTotalQuarterDays = totalQuarterDays > 0 ? totalQuarterDays : 90;
  const safeProrationDays = Math.max(0, Math.min(prorationDays, safeTotalQuarterDays));
  const prorationRatio = safeTotalQuarterDays > 0 ? safeProrationDays / safeTotalQuarterDays : 1;
  const effectiveDelta = useMemo(() => {
    if (!prorationEnabled) return quotaDelta;
    return Number((quotaDelta * prorationRatio).toFixed(2));
  }, [prorationEnabled, quotaDelta, prorationRatio]);
  const prorationDifference = useMemo(() => {
    if (!prorationEnabled) return 0;
    return Number((quotaDelta - effectiveDelta).toFixed(2));
  }, [prorationEnabled, quotaDelta, effectiveDelta]);

  // Transfer Form State
  const [transferEmpId, setTransferEmpId] = useState("");
  const [toDepartmentId, setToDepartmentId] = useState("");
  const [transferDate, setTransferDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [transferReason, setTransferReason] = useState("");

  // Role Transition Form State
  const [transitionEmpId, setTransitionEmpId] = useState("");
  const [transitionType, setTransitionType] = useState<"PROMOTION" | "DEMOTION">("PROMOTION");
  const [newTitle, setNewTitle] = useState("");
  const [effectiveQuarter, setEffectiveQuarter] = useState<number>(2);
  const [selectedOldKpiId, setSelectedOldKpiId] = useState("");
  const [newKpiTarget, setNewKpiTarget] = useState<number>(10);
  const [transitionReason, setTransitionReason] = useState("");

  // Queries
  const {
    data: poolData,
    loading: poolLoading,
    refetch: refetchPool,
  } = useQuery(GET_DEPARTMENT_HOLDING_POOL, {
    variables: { departmentId, annualStrategicPeriodId },
    skip: !annualStrategicPeriodId || !departmentId,
    fetchPolicy: "cache-and-network",
  });

  const {
    data: ledgerData,
    loading: ledgerLoading,
    refetch: refetchLedger,
  } = useQuery(GET_TARGET_ADJUSTMENT_LEDGER, {
    variables: { departmentId, annualStrategicPeriodId },
    skip: !annualStrategicPeriodId || !departmentId,
    fetchPolicy: "cache-and-network",
  });

  const {
    data: clearancesData,
    loading: clearancesLoading,
    refetch: refetchClearances,
  } = useQuery(GET_DEPARTURE_CLEARANCE_REQUESTS, {
    variables: { departmentId },
    skip: !departmentId,
    fetchPolicy: "cache-and-network",
  });

  // Mutations
  const [sweepDeparture, { loading: sweeping }] = useMutation(SWEEP_DEPARTURE_QUOTA);
  const [requestDeparture, { loading: requestingDeparture }] = useMutation(REQUEST_DEPARTURE_CLEARANCE);
  const [approveDeparture, { loading: approvingDeparture }] = useMutation(APPROVE_DEPARTURE_CLEARANCE);
  const [rejectDeparture, { loading: rejectingDeparture }] = useMutation(REJECT_DEPARTURE_CLEARANCE);
  const [distributeQuota, { loading: distributing }] = useMutation(DISTRIBUTE_HOLDING_POOL_QUOTA);
  const [processTransfer, { loading: transferring }] = useMutation(PROCESS_INTERNAL_TRANSFER);
  const [processTransition, { loading: transitioning }] = useMutation(PROCESS_ROLE_TRANSITION);

  const pools = poolData?.departmentHoldingPool ?? [];
  const ledger = ledgerData?.targetAdjustmentLedger ?? [];
  const clearances = clearancesData?.departureClearanceRequests ?? [];

  const pendingClearances = useMemo(() => {
    return clearances.filter((c: any) => c.status === "PENDING");
  }, [clearances]);

  // Set of employee IDs who have already departed (approved clearance)
  const departedEmpIds = useMemo(() => {
    return new Set(
      clearances
        .filter((c: any) => c.status === "APPROVED")
        .map((c: any) => c.employee?.employeeId || c.employeeId)
        .filter(Boolean),
    );
  }, [clearances]);

  // Set of employee IDs who currently have a pending departure request
  const pendingDepartureEmpIds = useMemo(() => {
    return new Set(
      clearances
        .filter((c: any) => c.status === "PENDING")
        .map((c: any) => c.employee?.employeeId || c.employeeId)
        .filter(Boolean),
    );
  }, [clearances]);

  // Active employees who are still with the department and available for target assignments
  const activeEmployees = useMemo(() => {
    return employees.filter((emp: any) => {
      const isDeparted = departedEmpIds.has(emp.employeeId);
      const isInactive = emp.status === "DISABLED" || emp.status === "DELETED";
      return !isDeparted && !isInactive;
    });
  }, [employees, departedEmpIds]);

  const selectedEmpForTransition = useMemo(() => {
    if (!transitionEmpId) return null;
    const emp = activeEmployees.find((e) => e.employeeId === transitionEmpId);
    if (!emp) return null;
    return {
      ...emp,
      departments: [{ departmentId, name: departmentName }],
    };
  }, [transitionEmpId, activeEmployees, departmentId, departmentName]);

  // Employees eligible to be submitted for departure (not already departed and not pending)
  const departureEligibleEmployees = useMemo(() => {
    return employees.filter((emp: any) => {
      const isDeparted = departedEmpIds.has(emp.employeeId);
      const isPending = pendingDepartureEmpIds.has(emp.employeeId);
      const isInactive = emp.status === "DISABLED" || emp.status === "DELETED";
      return !isDeparted && !isPending && !isInactive;
    });
  }, [employees, departedEmpIds, pendingDepartureEmpIds]);

  // Determine whether current logged-in user has HR clearance privileges
  const isHrUser = useMemo(() => {
    if (!user) return false;
    const email = (user.email || "").toLowerCase();
    const title = (user.title || "").toLowerCase();
    const role = (user.role || "").toUpperCase();
    return (
      email.includes("kaleb") ||
      email.includes("hr") ||
      title.includes("hr") ||
      title.includes("human resource") ||
      role === "ADMIN" ||
      role === "EXECUTIVE"
    );
  }, [user]);

  // Helper to identify KPI unit types
  const isCurrency = (kpi: any) => {
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
      name.includes("PIPELINE VALUE") ||
      name.includes("REVENUE") ||
      (name.includes("VALUE") && !isPercent(kpi)) ||
      Number(kpi?.annualDepartmentTarget || 0) >= 1000000
    );
  };

  const isPercent = (kpi: any) => {
    const type = (kpi?.unitType || "").toUpperCase();
    const unit = (kpi?.measurementUnit || "").toUpperCase();
    return (
      type === "PERCENT" ||
      type === "PERCENTAGE" ||
      unit.includes("PERCENT") ||
      unit.includes("%")
    );
  };

  // Helper to get quarter status based on fiscal year (starts July)
  // Jul-Sep = Q1 (Historical Closed), Oct-Dec = Q2 (Present Active), Jan-Mar = Q3 (Upcoming), Apr-Jun = Q4 (Upcoming)
  const currentQuarterNum = useMemo(() => {
    const month = new Date().getMonth(); // 0 = Jan ... 10 = Nov
    return month >= 6 ? Math.floor((month - 6) / 3) + 1 : Math.floor(month / 3) + 3;
  }, []);

  const formatNumber = (val: number) => {
    return Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const formatCurrency = (val: number) => {
    return `ETB ${Number(val || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Helper to get clean human-readable unit label for any KPI
  const getKpiUnitLabel = (kpi: any): string => {
    if (!kpi) return "Units";
    if (isCurrency(kpi)) return "ETB";
    if (isPercent(kpi)) return "%";

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
      return "Units";
    }
    return unit;
  };

  // Helper to format a target amount with its appropriate unit
  const formatTargetWithUnit = (val: number, kpi: any): string => {
    const formattedNum = formatNumber(val);
    if (!kpi) return `${formattedNum} Units`;

    if (isCurrency(kpi)) {
      return `ETB ${formattedNum}`;
    }
    if (isPercent(kpi)) {
      return `${formattedNum}%`;
    }

    const unitLabel = getKpiUnitLabel(kpi);
    return `${formattedNum} ${unitLabel}`;
  };

  // Helper to get the button text for assigning from holding pool
  const getAssignButtonText = (poolBalance: number, kpi: any): string => {
    const formatted = formatTargetWithUnit(poolBalance, kpi);
    return `Assign ${formatted}`;
  };

  // Summary Metrics: Strictly separates financial quotas (ETB) from quality & percentage standards (%)
  const summary = useMemo(() => {
    let financialBalance = 0;
    let financialHarvested = 0;
    let financialDistributed = 0;
    let hasFinancial = false;

    let percentKpisWaiting = 0;
    let totalPercentKpis = 0;

    let countKpisWaiting = 0;
    let totalCountKpis = 0;

    for (const kpi of pools) {
      if (isCurrency(kpi)) {
        hasFinancial = true;
        for (const q of kpi.quarters) {
          financialBalance += q.poolBalance;
          financialHarvested += q.totalHarvested;
          financialDistributed += q.totalDistributed;
        }
      } else if (isPercent(kpi)) {
        totalPercentKpis++;
        const hasWaiting = kpi.quarters.some(
          (q: any) => q.quarterNumber >= currentQuarterNum && q.poolBalance > 0
        );
        if (hasWaiting) percentKpisWaiting++;
      } else {
        totalCountKpis++;
        const hasWaiting = kpi.quarters.some(
          (q: any) => q.quarterNumber >= currentQuarterNum && q.poolBalance > 0
        );
        if (hasWaiting) countKpisWaiting++;
      }
    }

    return {
      hasFinancial,
      financialBalance,
      financialHarvested,
      financialDistributed,
      percentKpisWaiting,
      totalPercentKpis,
      countKpisWaiting,
      totalCountKpis,
    };
  }, [pools, currentQuarterNum]);

  // Handle Departure Clearance Request (Manager Submits to HR)
  const handleRequestDeparture = async () => {
    if (!departingEmpId || !departureReason) {
      toast.error("Please choose an employee and write a reason.");
      return;
    }
    try {
      const res = await requestDeparture({
        variables: {
          input: {
            employeeId: departingEmpId,
            departmentId,
            annualStrategicPeriodId,
            effectiveDate: departureDate,
            reason: departureReason,
          },
        },
      });
      if (res.data?.requestDepartureClearance) {
        toast.success(
          "Departure clearance request submitted! In-app notification sent to HR (Kaleb Kassahun) for approval."
        );
        setDepartureOpen(false);
        setDepartingEmpId("");
        setDepartureReason("");
        refetchClearances();
      }
    } catch (err: any) {
      toast.error(err.message || "Could not submit departure request.");
    }
  };

  // Handle HR Approval (Releases unachieved targets to holding pool / executes transfer)
  const handleApproveDeparture = async (requestId: string, employeeName: string, isTransfer?: boolean) => {
    try {
      const res = await approveDeparture({
        variables: {
          input: {
            departureClearanceRequestId: requestId,
          },
        },
      });
      if (res.data?.approveDepartureClearance?.success) {
        const swept = res.data.approveDepartureClearance.sweptAmount;
        const amountStr = swept > 0 ? ` (${formatCurrency(swept)})` : "";
        if (isTransfer) {
          toast.success(
            `Transfer approved for ${employeeName}! Employee transferred to destination department, unworked targets${amountStr} swept to holding pool, and all parties notified.`
          );
        } else {
          toast.success(
            `Departure clearance approved for ${employeeName}! Unachieved targets${amountStr} moved to the Holding Pool.`
          );
        }
        refetchPool();
        refetchLedger();
        refetchClearances();
        onEmployeeTransferred?.();
      }
    } catch (err: any) {
      toast.error(err.message || "Could not approve clearance.");
    }
  };

  // Handle HR Rejection
  const handleRejectDeparture = async () => {
    if (!selectedClearanceToReject || !rejectionReasonText) {
      toast.error("Please enter a reason for rejecting the clearance request.");
      return;
    }
    try {
      const res = await rejectDeparture({
        variables: {
          input: {
            departureClearanceRequestId: selectedClearanceToReject.departureClearanceRequestId,
            rejectionReason: rejectionReasonText,
          },
        },
      });
      if (res.data?.rejectDepartureClearance) {
        const isTransfer =
          selectedClearanceToReject.requestType === "TRANSFER" ||
          selectedClearanceToReject.reason?.startsWith("[INTERNAL_TRANSFER:");
        toast.success(
          `${isTransfer ? "Transfer request" : "Departure clearance"} for ${
            selectedClearanceToReject.employee?.fullName || "employee"
          } rejected.`
        );
        setRejectDialogOpen(false);
        setSelectedClearanceToReject(null);
        setRejectionReasonText("");
        refetchClearances();
      }
    } catch (err: any) {
      toast.error(err.message || "Could not reject clearance.");
    }
  };

  // Handle Direct Sweep (Legacy fallback)
  const handleSweepDeparture = async () => {
    if (!departingEmpId || !departureReason) {
      toast.error("Please choose an employee and write a reason.");
      return;
    }
    try {
      const res = await sweepDeparture({
        variables: {
          input: {
            employeeId: departingEmpId,
            annualStrategicPeriodId,
            effectiveDate: departureDate,
            reason: departureReason,
          },
        },
      });
      if (res.data?.sweepDepartureQuota?.success) {
        toast.success(res.data.sweepDepartureQuota.message || "Targets moved to pool successfully.");
        setDepartureOpen(false);
        setDepartingEmpId("");
        setDepartureReason("");
        refetchPool();
        refetchLedger();
        refetchClearances();
      }
    } catch (err: any) {
      toast.error(err.message || "Could not move targets to pool.");
    }
  };

  // Handle Distribution
  const handleDistributeQuota = async () => {
    const finalAmountToAssign = prorationEnabled ? effectiveDelta : quotaDelta;
    if (!recipientEmpId || finalAmountToAssign <= 0 || !distributeReason) {
      toast.error("Please select an employee, enter target amount, and write a reason.");
      return;
    }

    const activeQuarterPool = selectedKpiForDist?.quarters?.find(
      (q: any) => q.quarterNumber === selectedQuarterForDist,
    );
    const maxAvailable = activeQuarterPool?.poolBalance ?? 0;
    const isPercentageKpi = selectedKpiForDist ? isPercent(selectedKpiForDist) : false;

    if (!isPercentageKpi && quotaDelta > maxAvailable) {
      toast.error(
        `Cannot assign more than available pool balance (${formatTargetWithUnit(maxAvailable, selectedKpiForDist)}).`,
      );
      return;
    }

    if (isPercentageKpi && quotaDelta > 100) {
      toast.error("Percentage target cannot exceed 100%.");
      return;
    }

    try {
      const res = await distributeQuota({
        variables: {
          input: {
            departmentId,
            parentKpiId: selectedKpiForDist.kpiId,
            annualStrategicPeriodId,
            quarterNumber: selectedQuarterForDist,
            allocations: [
              {
                employeeId: recipientEmpId,
                targetDelta: finalAmountToAssign,
                prorationDays: prorationEnabled ? safeProrationDays : null,
                totalQuarterDays: prorationEnabled ? safeTotalQuarterDays : null,
              },
            ],
            reason: distributeReason,
          },
        },
      });
      if (res.data?.distributeHoldingPoolQuota?.success) {
        toast.success(res.data.distributeHoldingPoolQuota.message || "Targets given out successfully.");
        setDistributeOpen(false);
        setRecipientEmpId("");
        setQuotaDelta(0);
        setDistributeReason("");
        refetchPool();
        refetchLedger();
        onEmployeeTransferred?.();
      }
    } catch (err: any) {
      toast.error(err.message || "Could not give out targets.");
    }
  };

  // Handle Internal Transfer (Routes through HR Approval clearance workflow)
  const handleInternalTransfer = async () => {
    if (!transferEmpId || !toDepartmentId || !transferReason) {
      toast.error("Please select an employee, destination department, and reason.");
      return;
    }
    try {
      const res = await requestDeparture({
        variables: {
          input: {
            employeeId: transferEmpId,
            departmentId,
            annualStrategicPeriodId,
            effectiveDate: transferDate,
            reason: `[INTERNAL_TRANSFER:toDepartmentId=${toDepartmentId}] ${transferReason}`,
          },
        },
      });
      if (res.data?.requestDepartureClearance) {
        toast.success(
          "Transfer request submitted! Notification sent to HR for approval."
        );
        setTransferOpen(false);
        setTransferEmpId("");
        setToDepartmentId("");
        setTransferReason("");
        refetchClearances();
      }
    } catch (err: any) {
      toast.error(err.message || "Could not submit transfer request.");
    }
  };

  // Handle Role Transition
  const handleRoleTransition = async () => {
    if (!transitionEmpId || !newTitle || !transitionReason) {
      toast.error("Please select an employee, enter new title, and write a reason.");
      return;
    }
    try {
      const parentKpi = pools[0];
      const res = await processTransition({
        variables: {
          input: {
            employeeId: transitionEmpId,
            departmentId,
            annualStrategicPeriodId,
            transitionType,
            newTitle,
            effectiveQuarter: Number(effectiveQuarter),
            closeOldKpiIds: selectedOldKpiId ? [selectedOldKpiId] : [],
            newKpiAllocations: parentKpi
              ? [
                  {
                    parentKpiId: parentKpi.kpiId,
                    name: `${newTitle} Goal`,
                    unitType: parentKpi.unitType || "number",
                    measurementUnit: parentKpi.measurementUnit || "number",
                    quarterlyTargets: [0, newKpiTarget, newKpiTarget, newKpiTarget],
                    weight: 10,
                  },
                ]
              : [],
            reason: transitionReason,
          },
        },
      });
      if (res.data?.processRoleTransition?.success) {
        toast.success(res.data.processRoleTransition.message || "Role change saved successfully.");
        setTransitionOpen(false);
        setTransitionEmpId("");
        setNewTitle("");
        setTransitionReason("");
        refetchPool();
        refetchLedger();
        onEmployeeTransferred?.();
      }
    } catch (err: any) {
      toast.error(err.message || "Could not change role.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/40 dark:from-indigo-950/20 dark:via-zinc-900 dark:to-zinc-900 border rounded-2xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-zinc-100">
              Department Holding Pool
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 max-w-2xl">
            Save unfinished targets when people leave, give them to new hires or teammates, and manage transfers.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDepartureOpen(true)}
            className="rounded-xl gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20"
          >
            <UserMinus className="h-4 w-4" />
            Employee Leaving
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setTransferOpen(true)}
            className="rounded-xl gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 border-sky-200 dark:border-sky-900/50 hover:bg-sky-50 dark:hover:bg-sky-950/20"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Transfer Employee
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setTransitionOpen(true)}
            className="rounded-xl gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/20"
          >
            <TrendingUp className="h-4 w-4" />
            Change Role / Promotion
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              refetchPool();
              refetchLedger();
              refetchClearances();
            }}
            className="rounded-xl p-2"
          >
            <RefreshCw className="h-4 w-4 text-slate-500" />
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards - Separated by Financial vs Rate/Standard */}
      {summary.hasFinancial ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Financial Quotas (ETB)
            </span>
            <span className="text-[11px] text-slate-400">
              · Monetary revenue targets waiting or collected
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 shadow-2xs border-indigo-100 dark:border-indigo-900/30">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Financial Targets in Pool
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 tabular-nums">
                  {formatCurrency(summary.financialBalance)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Unassigned money targets. Give these to team members to meet department revenue goals.
              </p>
            </Card>

            <Card className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 shadow-2xs">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Targets Collected from Staff
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-zinc-100 tabular-nums">
                  {formatCurrency(summary.financialHarvested)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Unfinished revenue targets returned when employees leave. Finished work stays saved.
              </p>
            </Card>

            <Card className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 shadow-2xs">
              <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                Targets Given Out
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {formatCurrency(summary.financialDistributed)}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Assigned to new hires & teammates to cover department goals.
              </p>
            </Card>
          </div>

          {(summary.totalPercentKpis > 0 || summary.totalCountKpis > 0) && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="rounded-2xl border bg-slate-50/60 dark:bg-zinc-900/60 p-4">
                <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                  Quality & Performance Standards (%)
                </p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-800 dark:text-zinc-100">
                    {summary.percentKpisWaiting} of {summary.totalPercentKpis} Goals
                  </span>
                  <span className="text-xs text-slate-500">waiting for team assignment</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Percentage goals (like 75% retention or 90% quality) are individual standards for each person, not additive cash piles.
                </p>
              </Card>

              {summary.totalCountKpis > 0 && (
                <Card className="rounded-2xl border bg-slate-50/60 dark:bg-zinc-900/60 p-4">
                  <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                    Count & Deliverable Goals
                  </p>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-slate-800 dark:text-zinc-100">
                      {summary.countKpisWaiting} of {summary.totalCountKpis} Goals
                    </span>
                    <span className="text-xs text-slate-500">waiting for team assignment</span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Deliverable counts (e.g. reports, research papers, software enhancements).
                  </p>
                </Card>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Rate & Performance Standards Waiting
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 tabular-nums">
                {summary.percentKpisWaiting + summary.countKpisWaiting}
              </span>
              <span className="text-xs text-slate-500">goals to assign</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Department goals waiting to be assigned to team members.
            </p>
          </Card>

          <Card className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Total Performance Goals
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-slate-900 dark:text-zinc-100 tabular-nums">
                {summary.totalPercentKpis + summary.totalCountKpis}
              </span>
              <span className="text-xs text-slate-500">active department KPIs</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Quality, delivery, and operational benchmarks for your department.
            </p>
          </Card>

          <Card className="rounded-2xl border bg-white dark:bg-zinc-900 p-4 shadow-2xs">
            <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
              Audit History Records
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {ledger.length}
              </span>
              <span className="text-xs text-slate-500">logged changes</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Every target allocation and employee departure is tracked.
            </p>
          </Card>
        </div>
      )}

      {/* Pending Departure Clearance & Transfer Alert Banner */}
      {pendingClearances.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/80 dark:border-amber-800/70 dark:bg-amber-950/20 p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-amber-200/80 dark:border-amber-800/40 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                <UserMinus className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-950 dark:text-amber-200 flex items-center gap-2">
                  Pending HR Approvals & Clearances
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                    {pendingClearances.length} waiting
                  </span>
                </h4>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                  {isHrUser
                    ? "As HR Officer, review and approve or reject the following employee departure and transfer requests."
                    : "Submitted to HR. Once approved, unworked targets will return to the holding pool and transfers will be executed."}
                </p>
              </div>
            </div>
            <Badge className="self-start sm:self-auto bg-amber-200 text-amber-900 border-amber-300 dark:bg-amber-900/60 dark:text-amber-200 text-xs font-semibold px-2.5 py-1">
              {isHrUser ? "HR Action Required" : "Awaiting HR Approval"}
            </Badge>
          </div>

          <div className="space-y-2.5">
            {pendingClearances.map((req: any) => {
              const isTransfer =
                req.requestType === "TRANSFER" ||
                req.reason?.startsWith("[INTERNAL_TRANSFER:");
              const cleanReason = (req.reason || "").replace(
                /\[INTERNAL_TRANSFER:[^\]]+\]\s*/,
                ""
              );
              const destName =
                req.destinationDepartment?.name ||
                allDepartments.find(
                  (d) => d.departmentId === req.destinationDepartmentId
                )?.name ||
                "Destination Dept";

              return (
                <div
                  key={req.departureClearanceRequestId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-amber-200/80 dark:border-zinc-800 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 dark:text-zinc-100 text-sm">
                        {req.employee?.fullName || "Employee"}
                      </span>
                      {req.employee?.title && (
                        <span className="text-xs text-slate-500">({req.employee.title})</span>
                      )}
                      {isTransfer ? (
                        <Badge
                          variant="outline"
                          className="border-sky-400 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 text-[10px] font-semibold"
                        >
                          Transfer ➔ {destName}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-400 text-amber-700 dark:text-amber-400 text-[10px] font-semibold"
                        >
                          Departure Clearance
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 mt-1">
                      {isTransfer ? "Effective Date" : "Last Working Day"}:{" "}
                      <strong className="text-slate-800 dark:text-zinc-200">
                        {req.effectiveDate}
                      </strong>{" "}
                      · Requested by:{" "}
                      <strong className="text-slate-800 dark:text-zinc-200">
                        {req.requestedBy?.fullName || "Manager"}
                      </strong>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 italic">
                      Reason: "{cleanReason || (isTransfer ? "Department Transfer" : "Departure")}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isHrUser ? (
                      <>
                        <Button
                          size="sm"
                          disabled={approvingDeparture}
                          onClick={() =>
                            handleApproveDeparture(
                              req.departureClearanceRequestId,
                              req.employee?.fullName || "Employee",
                              isTransfer
                            )
                          }
                          className="rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          {approvingDeparture
                            ? "Approving..."
                            : isTransfer
                            ? "Approve Transfer"
                            : "Approve Departure"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rejectingDeparture}
                          onClick={() => {
                            setSelectedClearanceToReject(req);
                            setRejectDialogOpen(true);
                          }}
                          className="rounded-lg text-xs font-semibold text-rose-600 border-rose-200 hover:bg-rose-50 dark:border-rose-900/50 dark:hover:bg-rose-950/20"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Reject
                        </Button>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 bg-slate-50 dark:bg-zinc-800/60 px-3 py-1.5 rounded-lg border">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        <span>Pending HR Review</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs Switcher: POOLS vs LEDGER vs CLEARANCES */}
      <div className="flex border-b border-slate-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab("POOLS")}
          className={`py-2.5 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === "POOLS"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"
          }`}
        >
          <Layers className="h-4 w-4" />
          Holding Pool by KPI ({pools.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("LEDGER")}
          className={`py-2.5 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === "LEDGER"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"
          }`}
        >
          <History className="h-4 w-4" />
          History & Audit Log ({ledger.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("CLEARANCES")}
          className={`py-2.5 px-4 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
            activeTab === "CLEARANCES"
              ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"
          }`}
        >
          <UserMinus className="h-4 w-4" />
          Clearances & Transfers ({clearances.length})
          {pendingClearances.length > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
              {pendingClearances.length}
            </span>
          )}
        </button>
      </div>

      {/* View 1: Pools Table */}
      {activeTab === "POOLS" && (
        <div className="space-y-4">
          {pools.length === 0 ? (
            <div className="py-12 text-center border rounded-2xl bg-white dark:bg-zinc-900">
              <Layers className="mx-auto h-8 w-8 text-slate-300 dark:text-zinc-600" />
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-zinc-300">
                No KPIs Found
              </p>
              <p className="text-xs text-slate-400">
                Create or assign department KPIs to see holding pool balances.
              </p>
            </div>
          ) : (
            pools.map((kpi: any) => {
              const kpiIsCurrency = isCurrency(kpi);
              return (
                <Card
                  key={kpi.kpiId}
                  className="rounded-2xl border bg-white dark:bg-zinc-900 p-5 shadow-2xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4 dark:border-zinc-800">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                        {kpi.kpiName}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        Annual Department Goal:{" "}
                        <span className="font-semibold text-slate-700 dark:text-zinc-300">
                          {formatTargetWithUnit(kpi.annualDepartmentTarget, kpi)}
                        </span>{" "}
                        · Type: {kpiIsCurrency ? "Financial (ETB)" : isPercent(kpi) ? "Performance Standard (%)" : `Quantity (${getKpiUnitLabel(kpi)})`}
                      </p>
                    </div>
                  </div>

                  {/* Quarters Grid */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
                    {kpi.quarters.map((q: any) => {
                      const hasPool = q.poolBalance > 0;
                      const isPast = q.quarterNumber < currentQuarterNum;
                      const isCurrent = q.quarterNumber === currentQuarterNum;

                      const formatVal = (val: number) => {
                        if (kpiIsCurrency) {
                          return formatNumber(val);
                        }
                        return formatNumber(val);
                      };

                      return (
                        <div
                          key={q.quarterNumber}
                          className={`rounded-xl border p-3.5 transition-all flex flex-col justify-between ${
                            isPast
                              ? "border-slate-200 bg-slate-50/60 opacity-80 dark:border-zinc-800 dark:bg-zinc-900/40"
                              : isCurrent
                              ? hasPool
                                ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800/50 dark:bg-emerald-950/20 ring-1 ring-emerald-400/30"
                                : "border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                              : "border-slate-200 bg-slate-50/40 dark:border-zinc-800 dark:bg-zinc-900/30 opacity-90"
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                                Quarter {q.quarterNumber}
                              </span>
                              {isPast ? (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full text-[10px] font-medium bg-slate-200/80 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400"
                                >
                                  Past Quarter (Closed)
                                </Badge>
                              ) : isCurrent ? (
                                <Badge
                                  className="rounded-full text-[10px] font-semibold bg-emerald-600 text-white dark:bg-emerald-500"
                                >
                                  Present Quarter (Active)
                                </Badge>
                              ) : (
                                <Badge
                                  variant="secondary"
                                  className="rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                                >
                                  Upcoming (Locked)
                                </Badge>
                              )}
                            </div>

                            <div className="mt-3 space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Department Goal:</span>
                                <span className="font-semibold tabular-nums">
                                  {formatTargetWithUnit(q.departmentTarget, kpi)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Assigned to Team:</span>
                                <span className="font-semibold tabular-nums">
                                  {formatTargetWithUnit(q.assignedActiveTarget, kpi)}
                                </span>
                              </div>
                              {Number(q.totalDistributed || 0) > 0 && (
                                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                                  <span>Distributed to Staff:</span>
                                  <span className="font-semibold tabular-nums">
                                    {formatTargetWithUnit(q.totalDistributed, kpi)}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between border-t pt-1 dark:border-zinc-700/50">
                                <span className={`font-semibold ${
                                  isPast
                                    ? "text-slate-500"
                                    : isCurrent
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-slate-600 dark:text-zinc-400"
                                }`}>
                                  {isPast ? "Unassigned (Locked):" : isCurrent ? "In Holding Pool:" : "In Pool (Waiting):"}
                                </span>
                                <span className={`font-extrabold tabular-nums ${
                                  isPast
                                    ? "text-slate-500"
                                    : isCurrent
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-slate-700 dark:text-zinc-300"
                                }`}>
                                  {formatTargetWithUnit(q.poolBalance, kpi)}
                                </span>
                              </div>
                            </div>

                            {isPast && (
                              <p className="mt-2 text-[10px] text-slate-400 italic">
                                Historical period closed. Past quarter targets cannot be rebalanced.
                              </p>
                            )}
                            {!isPast && !isCurrent && (
                              <p className="mt-2 text-[10px] text-slate-400 italic">
                                Future quarter. Targets remain safely parked in pool until Q{q.quarterNumber} opens.
                              </p>
                            )}
                          </div>

                          <div className="mt-3">
                            {isPast ? (
                              <Button
                                size="sm"
                                disabled
                                variant="outline"
                                className="w-full rounded-lg text-xs font-medium text-slate-400 border-slate-200 dark:border-zinc-700 cursor-not-allowed bg-slate-50 dark:bg-zinc-800/40"
                              >
                                Quarter Closed
                              </Button>
                            ) : isCurrent ? (
                              hasPool ? (
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedKpiForDist(kpi);
                                    setSelectedQuarterForDist(q.quarterNumber);
                                    setQuotaDelta(q.poolBalance);
                                    setDistributeOpen(true);
                                  }}
                                  className="w-full rounded-lg text-xs font-semibold gap-1.5 text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs px-2"
                                  title={getAssignButtonText(q.poolBalance, kpi)}
                                >
                                  <UserPlus className="h-3.5 w-3.5 shrink-0" />
                                  <span className="truncate">{getAssignButtonText(q.poolBalance, kpi)}</span>
                                </Button>
                              ) : (
                                <div className="text-center py-1.5 text-[11px] text-slate-400 font-medium">
                                  ✓ Fully Assigned
                                </div>
                              )
                            ) : (
                              <Button
                                size="sm"
                                disabled
                                variant="outline"
                                className="w-full rounded-lg text-xs font-medium text-slate-400 border-slate-200 dark:border-zinc-700 cursor-not-allowed bg-slate-50 dark:bg-zinc-800/40"
                              >
                                Locked (Opens in Q{q.quarterNumber})
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* View 2: Audit Ledger */}
      {activeTab === "LEDGER" && (
        <Card className="rounded-2xl border bg-white dark:bg-zinc-900 p-0 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-zinc-800/60 text-slate-500 dark:text-zinc-400 border-b">
                <tr>
                  <th className="py-3 px-4 font-semibold">Date & Time</th>
                  <th className="py-3 px-4 font-semibold">Action</th>
                  <th className="py-3 px-4 font-semibold">KPI & Quarter</th>
                  <th className="py-3 px-4 font-semibold">Amount</th>
                  <th className="py-3 px-4 font-semibold">From / To</th>
                  <th className="py-3 px-4 font-semibold">Approved By</th>
                  <th className="py-3 px-4 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No target changes recorded yet.
                    </td>
                  </tr>
                ) : (
                  ledger.map((item: any) => (
                    <tr key={item.targetAdjustmentLedgerId} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/40">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                        {format(new Date(item.createdAt), "MMM d, yyyy HH:mm")}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="rounded-full text-[10px] font-bold">
                          {item.transactionType.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 dark:text-zinc-200">
                          {item.kpi?.name || "Department Goal"}
                        </span>{" "}
                        · Q{item.quarterNumber}
                      </td>
                      <td className="py-3 px-4 font-bold tabular-nums text-slate-900 dark:text-zinc-100">
                        {Number(item.amount) > 0 ? `+${item.amount}` : item.amount}
                      </td>
                      <td className="py-3 px-4">
                        {item.sourceEmployee && (
                          <span className="text-rose-600 dark:text-rose-400">
                            From: {item.sourceEmployee.fullName}
                          </span>
                        )}
                        {item.sourceEmployee && item.destinationEmployee && " → "}
                        {item.destinationEmployee && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            To: {item.destinationEmployee.fullName}
                          </span>
                        )}
                        {!item.sourceEmployee && !item.destinationEmployee && "Department Pool"}
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-zinc-400">
                        {item.approvedBy?.fullName || "Manager"}
                      </td>
                      <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={item.reason}>
                        {item.reason}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* View 3: Departure Clearances & Transfers */}
      {activeTab === "CLEARANCES" && (
        <Card className="rounded-2xl border bg-white dark:bg-zinc-900 p-0 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-zinc-800/60 text-slate-500 dark:text-zinc-400 border-b">
                <tr>
                  <th className="py-3 px-4 font-semibold">Date Submitted</th>
                  <th className="py-3 px-4 font-semibold">Employee / Type</th>
                  <th className="py-3 px-4 font-semibold">Effective Date</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Swept to Pool</th>
                  <th className="py-3 px-4 font-semibold">Requested By</th>
                  <th className="py-3 px-4 font-semibold">HR Reviewer</th>
                  <th className="py-3 px-4 font-semibold">Reason / Destination</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {clearances.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      No clearance or transfer requests recorded yet.
                    </td>
                  </tr>
                ) : (
                  clearances.map((req: any) => {
                    const isTransfer =
                      req.requestType === "TRANSFER" ||
                      req.reason?.startsWith("[INTERNAL_TRANSFER:");
                    const cleanReason = (req.reason || "").replace(
                      /\[INTERNAL_TRANSFER:[^\]]+\]\s*/,
                      ""
                    );
                    const destName =
                      req.destinationDepartment?.name ||
                      allDepartments.find(
                        (d) => d.departmentId === req.destinationDepartmentId
                      )?.name ||
                      "Destination Dept";

                    return (
                      <tr
                        key={req.departureClearanceRequestId}
                        className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/40"
                      >
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                          {format(new Date(req.createdAt), "MMM d, yyyy HH:mm")}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 dark:text-zinc-100">
                              {req.employee?.fullName || "Employee"}
                            </span>
                            {isTransfer ? (
                              <Badge
                                variant="outline"
                                className="border-sky-300 bg-sky-50 text-[10px] font-bold text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                              >
                                Transfer ➔ {destName}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-rose-300 bg-rose-50 text-[10px] font-bold text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                              >
                                Departure
                              </Badge>
                            )}
                          </div>
                          {req.employee?.title && (
                            <span className="block text-[11px] text-slate-400">
                              {req.employee.title}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700 dark:text-zinc-300">
                          {req.effectiveDate}
                        </td>
                        <td className="py-3 px-4">
                          {req.status === "PENDING" && (
                            <Badge
                              variant="outline"
                              className="border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50/50 text-[10px] font-bold"
                            >
                              PENDING HR REVIEW
                            </Badge>
                          )}
                          {req.status === "APPROVED" && (
                            <Badge
                              variant="outline"
                              className="border-emerald-500 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 text-[10px] font-bold"
                            >
                              APPROVED
                            </Badge>
                          )}
                          {req.status === "REJECTED" && (
                            <Badge
                              variant="outline"
                              className="border-rose-400 text-rose-700 dark:text-rose-400 bg-rose-50/50 text-[10px] font-bold"
                            >
                              REJECTED
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 font-bold tabular-nums text-slate-900 dark:text-zinc-100">
                          {req.sweptAmount > 0 ? formatCurrency(req.sweptAmount) : "-"}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-zinc-400">
                          {req.requestedBy?.fullName || "Manager"}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-zinc-400">
                          {req.reviewedBy?.fullName ? (
                            <span>{req.reviewedBy.fullName}</span>
                          ) : (
                            <span className="text-slate-400 italic">Awaiting HR</span>
                          )}
                        </td>
                        <td
                          className="py-3 px-4 text-slate-500 max-w-xs truncate"
                          title={req.status === "REJECTED" ? req.rejectionReason : cleanReason}
                        >
                          {req.status === "REJECTED" ? (
                            <span className="text-rose-600">Rejection: {req.rejectionReason}</span>
                          ) : isTransfer ? (
                            <span>
                              <span className="font-semibold text-sky-700 dark:text-sky-400">
                                To {destName}:{" "}
                              </span>
                              {cleanReason || "Internal transfer"}
                            </span>
                          ) : (
                            cleanReason || "Departure clearance"
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {req.status === "PENDING" && isHrUser ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                disabled={approvingDeparture}
                                onClick={() =>
                                  handleApproveDeparture(
                                    req.departureClearanceRequestId,
                                    req.employee?.fullName || "Employee",
                                    isTransfer
                                  )
                                }
                                className="h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={rejectingDeparture}
                                onClick={() => {
                                  setSelectedClearanceToReject(req);
                                  setRejectDialogOpen(true);
                                }}
                                className="h-7 px-2 rounded-lg text-[11px] font-semibold text-rose-600 border-rose-200 hover:bg-rose-50"
                              >
                                Reject
                              </Button>
                            </div>
                          ) : req.status === "PENDING" ? (
                            <span className="text-[11px] text-slate-400 italic">Pending Review</span>
                          ) : req.status === "APPROVED" ? (
                            <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {isTransfer ? "Transferred" : "Swept"}
                            </span>
                          ) : (
                            <span className="text-[11px] text-rose-600 font-semibold flex items-center justify-end gap-1">
                              <XCircle className="h-3.5 w-3.5" /> Closed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal 1: Employee Leaving Clearance Request */}
      <Dialog open={departureOpen} onOpenChange={setDepartureOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Employee Departure Clearance</DialogTitle>
            <DialogDescription>
              Submit an employee departure for HR review. When HR approves, unachieved targets for active and future quarters will safely move to the department holding pool.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Who is leaving?</Label>
              <Select value={departingEmpId} onValueChange={setDepartingEmpId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {departureEligibleEmployees.map((emp) => (
                    <SelectItem key={emp.employeeId} value={emp.employeeId}>
                      {emp.fullName} {emp.title ? `(${emp.title})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Last working day</Label>
              <Input
                type="date"
                className="mt-1"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Why are they leaving?</Label>
              <Input
                className="mt-1"
                placeholder="e.g. Resigned to pursue new opportunity..."
                value={departureReason}
                onChange={(e) => setDepartureReason(e.target.value)}
              />
            </div>

            <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
              <strong>HR Approval Workflow:</strong> Submitting this sends an in-app approval notification to HR (Kaleb Kassahun). Target quotas remain with the employee until HR approves.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDepartureOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRequestDeparture}
              disabled={requestingDeparture}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {requestingDeparture ? "Submitting..." : "Submit for HR Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: HR Rejection Reason Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedClearanceToReject?.requestType === "TRANSFER" ||
              selectedClearanceToReject?.reason?.startsWith("[INTERNAL_TRANSFER:")
                ? "Reject Transfer Request"
                : "Reject Departure Clearance"}
            </DialogTitle>
            <DialogDescription>
              Please enter the reason for rejecting the{" "}
              {selectedClearanceToReject?.requestType === "TRANSFER" ||
              selectedClearanceToReject?.reason?.startsWith("[INTERNAL_TRANSFER:")
                ? "transfer request"
                : "departure clearance"}{" "}
              for <strong>{selectedClearanceToReject?.employee?.fullName}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <Label>Rejection Reason</Label>
            <Input
              className="mt-1"
              placeholder="e.g. Handover not completed, pending contract check..."
              value={rejectionReasonText}
              onChange={(e) => setRejectionReasonText(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRejectDeparture}
              disabled={rejectingDeparture}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {rejectingDeparture ? "Rejecting..." : "Confirm Rejection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Distribute Pool Quota */}
      <Dialog open={distributeOpen} onOpenChange={setDistributeOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Targets from Pool</DialogTitle>
            <DialogDescription>
              Give available targets for <strong>{selectedKpiForDist?.kpiName}</strong> (Quarter {selectedQuarterForDist} · Present Active Quarter) to a new hire or teammate.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Notice for Percentage vs Financial KPI */}
            {selectedKpiForDist && isPercent(selectedKpiForDist) && (
              <div className="rounded-xl p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
                <p className="font-bold">Percentage Standard Notice:</p>
                <p className="mt-0.5 text-[11px]">
                  Percentage goals ({selectedKpiForDist.measurementUnit || "%"}) represent an individual quality or operational standard (0% – 100%), not an additive cash sum. Assigning this applies the required performance standard to the selected employee.
                </p>
              </div>
            )}
            {selectedKpiForDist && isCurrency(selectedKpiForDist) && (
              <div className="rounded-xl p-3 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 text-xs text-indigo-800 dark:text-indigo-300">
                <p className="font-bold">Financial Quota Notice:</p>
                <p className="mt-0.5 text-[11px]">
                  This is a monetary revenue quota (ETB). The assigned amount will be deducted from the holding pool and given to the employee.
                </p>
              </div>
            )}

            <div>
              <Label>Who gets these targets?</Label>
              <Select value={recipientEmpId} onValueChange={setRecipientEmpId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((emp) => (
                    <SelectItem key={emp.employeeId} value={emp.employeeId}>
                      {emp.fullName} {emp.title ? `(${emp.title})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>
                  Target amount to assign{" "}
                  <span className="text-slate-400 font-normal">
                    ({selectedKpiForDist ? getKpiUnitLabel(selectedKpiForDist) : "Units"})
                  </span>
                </Label>
                {selectedKpiForDist && (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Available in Pool: {formatTargetWithUnit(selectedKpiForDist.quarters?.find((q: any) => q.quarterNumber === selectedQuarterForDist)?.poolBalance ?? quotaDelta, selectedKpiForDist)}
                  </span>
                )}
              </div>
              <div className="relative">
                <Input
                  type="number"
                  min={0}
                  max={selectedKpiForDist && isPercent(selectedKpiForDist) ? 100 : (selectedKpiForDist?.quarters?.find((q: any) => q.quarterNumber === selectedQuarterForDist)?.poolBalance ?? undefined)}
                  className={`pr-16 ${
                    (!selectedKpiForDist || !isPercent(selectedKpiForDist)) &&
                    quotaDelta > (selectedKpiForDist?.quarters?.find((q: any) => q.quarterNumber === selectedQuarterForDist)?.poolBalance ?? 0)
                      ? "border-rose-500 focus-visible:ring-rose-500"
                      : selectedKpiForDist && isPercent(selectedKpiForDist) && quotaDelta > 100
                      ? "border-rose-500 focus-visible:ring-rose-500"
                      : ""
                  }`}
                  value={quotaDelta}
                  onChange={(e) => setQuotaDelta(parseFloat(e.target.value) || 0)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 pointer-events-none">
                  {selectedKpiForDist ? getKpiUnitLabel(selectedKpiForDist) : "Units"}
                </span>
              </div>
              {selectedKpiForDist &&
                !isPercent(selectedKpiForDist) &&
                quotaDelta > (selectedKpiForDist?.quarters?.find((q: any) => q.quarterNumber === selectedQuarterForDist)?.poolBalance ?? 0) && (
                  <p className="mt-1.5 text-xs text-rose-600 font-medium">
                    ⚠️ Cannot assign more than available pool balance ({formatTargetWithUnit(selectedKpiForDist?.quarters?.find((q: any) => q.quarterNumber === selectedQuarterForDist)?.poolBalance ?? 0, selectedKpiForDist)}).
                  </p>
                )}
              {selectedKpiForDist && isPercent(selectedKpiForDist) && quotaDelta > 100 && (
                <p className="mt-1.5 text-xs text-rose-600 font-medium">
                  ⚠️ Percentage standard cannot exceed 100%.
                </p>
              )}
            </div>

            {/* Proration Toggle */}
            <div className="rounded-xl border p-3.5 bg-slate-50/50 dark:bg-zinc-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                    Adjust target based on days left in quarter
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Automatically lowers target based on how many days are left.
                  </p>
                </div>
                <Switch
                  checked={prorationEnabled}
                  onCheckedChange={setProrationEnabled}
                />
              </div>

              {prorationEnabled && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-[11px]">Days left to work</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        min={0}
                        max={safeTotalQuarterDays}
                        value={prorationDays}
                        onChange={(e) => setProrationDays(parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <div>
                      <Label className="text-[11px]">Total days in quarter</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        min={1}
                        value={totalQuarterDays}
                        onChange={(e) => setTotalQuarterDays(parseInt(e.target.value) || 90)}
                      />
                    </div>
                  </div>

                  {quotaDelta > 0 && (
                    <div className="rounded-lg bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 p-3 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                        <span>Entered Base Target:</span>
                        <span className="font-semibold text-slate-800 dark:text-zinc-200">
                          {formatTargetWithUnit(quotaDelta, selectedKpiForDist)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-zinc-400">
                        <span>Proration Factor:</span>
                        <span className="font-semibold text-slate-800 dark:text-zinc-200">
                          {safeProrationDays} / {safeTotalQuarterDays} days ({(prorationRatio * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="border-t border-emerald-200 dark:border-emerald-800/60 pt-1.5 flex justify-between items-center">
                        <span className="font-bold text-emerald-800 dark:text-emerald-300">
                          Prorated Target to Employee:
                        </span>
                        <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-400">
                          {formatTargetWithUnit(effectiveDelta, selectedKpiForDist)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-slate-500 dark:text-zinc-400 pt-0.5">
                        <span>Difference (Stays in Pool as Vacancy Gap):</span>
                        <span className="font-semibold text-slate-700 dark:text-zinc-300">
                          {formatTargetWithUnit(prorationDifference, selectedKpiForDist)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <Label>Note / Reason</Label>
              <Input
                className="mt-1"
                placeholder="e.g. New hire joining mid-quarter..."
                value={distributeReason}
                onChange={(e) => setDistributeReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDistributeOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDistributeQuota}
              disabled={
                distributing ||
                !recipientEmpId ||
                quotaDelta <= 0 ||
                effectiveDelta <= 0 ||
                ((!selectedKpiForDist || !isPercent(selectedKpiForDist)) &&
                  quotaDelta > (selectedKpiForDist?.quarters?.find((q: any) => q.quarterNumber === selectedQuarterForDist)?.poolBalance ?? 0)) ||
                (Boolean(selectedKpiForDist && isPercent(selectedKpiForDist)) && quotaDelta > 100)
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
            >
              {distributing
                ? "Assigning..."
                : (!selectedKpiForDist || !isPercent(selectedKpiForDist)) &&
                  quotaDelta > (selectedKpiForDist?.quarters?.find((q: any) => q.quarterNumber === selectedQuarterForDist)?.poolBalance ?? 0)
                ? "Amount Exceeds Pool"
                : selectedKpiForDist && isPercent(selectedKpiForDist) && quotaDelta > 100
                ? "Exceeds 100%"
                : `Assign ${selectedKpiForDist ? formatTargetWithUnit(effectiveDelta, selectedKpiForDist) : "Targets"}${prorationEnabled ? " (Prorated)" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 3: Internal Transfer */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Employee Transfer</DialogTitle>
            <DialogDescription>
              Request an employee transfer to another department. This request will be routed to HR for formal review and approval. Upon HR approval, unworked targets remain in this pool and the employee will be transitioned to the destination department.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Who is transferring?</Label>
              <Select value={transferEmpId} onValueChange={setTransferEmpId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {departureEligibleEmployees.map((emp) => (
                    <SelectItem key={emp.employeeId} value={emp.employeeId}>
                      {emp.fullName} {emp.title ? `(${emp.title})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Where are they moving to?</Label>
              <Select value={toDepartmentId} onValueChange={setToDepartmentId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select destination department..." />
                </SelectTrigger>
                <SelectContent>
                  {allDepartments
                    .filter((d) => d.departmentId !== departmentId)
                    .map((dept) => (
                      <SelectItem key={dept.departmentId} value={dept.departmentId}>
                        {dept.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Transfer date</Label>
              <Input
                type="date"
                className="mt-1"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </div>

            <div>
              <Label>Reason for transfer</Label>
              <Input
                className="mt-1"
                placeholder="e.g. Moving to help with client advisory..."
                value={transferReason}
                onChange={(e) => setTransferReason(e.target.value)}
              />
            </div>

            <div className="rounded-xl p-3 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900/40 text-xs text-sky-800 dark:text-sky-300">
              <strong>HR Approval Workflow:</strong> Submitting this sends an in-app approval notification to HR. Upon approval, unworked targets stay in this department's pool, and the employee is moved to the destination department.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInternalTransfer}
              disabled={requestingDeparture}
              className="bg-sky-600 hover:bg-sky-700 text-white"
            >
              {requestingDeparture ? "Submitting..." : "Submit Transfer for HR Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 4: Change Role / Promotion */}
      {selectedEmpForTransition ? (
        <PromoteEmployeeDialog
          employee={selectedEmpForTransition as any}
          open={transitionOpen}
          onOpenChange={(val) => {
            setTransitionOpen(val);
            if (!val) setTransitionEmpId("");
          }}
          onSuccess={() => {
            refetchPool();
            refetchLedger();
            onEmployeeTransferred?.();
          }}
        />
      ) : (
        <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Employee to Promote</DialogTitle>
              <DialogDescription>
                Choose a team member in {departmentName} to promote or transition to a new role.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <Label>Who is being promoted?</Label>
                <Select value={transitionEmpId} onValueChange={setTransitionEmpId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose an employee..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEmployees.map((emp) => (
                      <SelectItem key={emp.employeeId} value={emp.employeeId}>
                        {emp.fullName} {emp.title ? `(${emp.title})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTransitionOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!transitionEmpId}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Continue to Promotion Setup
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
