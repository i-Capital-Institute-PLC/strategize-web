"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@apollo/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Award,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  History,
  Layers,
  Sparkles,
} from "lucide-react";
import { useStrategicPeriodStore } from "@/stores";
import { Employee, EmployeeRole } from "@/types/graphql";
import { GET_KPI_ASSIGNMENTS_EMPLOYEE, GET_KPIS } from "@/lib/graphql/queries/kpis";
import { GET_DEPARTMENT_HOLDING_POOL } from "@/lib/graphql/queries/target-rebalancing";
import { GET_DEPARTMENTS } from "@/lib/graphql/queries/departments";
import { PROCESS_ROLE_TRANSITION } from "@/lib/graphql/mutations/target-rebalancing";
import { GET_STRATEGIC_PERIODS } from "@/lib/graphql/queries/strategicPeriods";

interface PromoteEmployeeDialogProps {
  children?: React.ReactNode;
  employee: Employee;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
}

interface NewRoleKpiDraft {
  id: string;
  parentKpiId: string;
  name: string;
  unitType: string;
  measurementUnit: string;
  q1Target: number;
  q2Target: number;
  q3Target: number;
  q4Target: number;
  weight: number;
}

export default function PromoteEmployeeDialog({
  children,
  employee,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onSuccess,
}: PromoteEmployeeDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (val: boolean) => {
    if (isControlled) {
      controlledOnOpenChange?.(val);
    } else {
      setInternalOpen(val);
    }
  };

  const selectedPeriod = useStrategicPeriodStore((state) => state.selectedPeriod);
  const annualStrategicPeriodId = selectedPeriod?.strategicPeriodId;

  // Fallback: when the Zustand store is empty (e.g. user opens dialog from Employees page
  // without visiting the Dashboard first), auto-fetch the active ANNUAL strategic period.
  const { data: periodsData } = useQuery(GET_STRATEGIC_PERIODS, {
    variables: { page: 1, limit: 50 },
    skip: !open || !!annualStrategicPeriodId, // only fetches when store is empty
    fetchPolicy: "cache-first",
  });

  // Prefer the store value; fall back to the first ANNUAL or ACTIVE period returned by the query,
  // then to whichever period comes first (defensive fallback).
  const effectiveAnnualPeriodId: string | undefined =
    annualStrategicPeriodId ||
    periodsData?.strategicPeriods?.items?.find(
      (p: any) =>
        String(p.periodType || "").toLowerCase() === "annual" ||
        String(p.status || "").toLowerCase() === "active",
    )?.strategicPeriodId ||
    periodsData?.strategicPeriods?.items?.[0]?.strategicPeriodId;

  // True when we resolved the period via auto-fetch (store was empty)
  const periodAutoResolved = !annualStrategicPeriodId && !!effectiveAnnualPeriodId;

  // Active fiscal quarter
  const currentFiscalQuarter = useMemo(() => {
    const m = new Date().getMonth();
    return m >= 6 ? Math.floor((m - 6) / 3) + 1 : Math.floor(m / 3) + 3;
  }, []);

  // Form State
  const [transitionType, setTransitionType] = useState<"PROMOTION" | "DEMOTION">("PROMOTION");
  const [newTitle, setNewTitle] = useState("");
  const [newRole, setNewRole] = useState<string>(employee.role || "NORMAL");
  const [effectiveQuarter, setEffectiveQuarter] = useState<number>(currentFiscalQuarter);
  const [reason, setReason] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("");

  // Old KPIs to close
  const [closedOldKpiIds, setClosedOldKpiIds] = useState<Set<string>>(new Set());

  // New role KPIs to create
  const [newKpis, setNewKpis] = useState<NewRoleKpiDraft[]>([]);

  // Resolve employee's department
  const empDepartments = (employee as any)?.departments || [];
  const primaryDeptId = empDepartments[0]?.departmentId || "";

  useEffect(() => {
    if (open) {
      setTransitionType("PROMOTION");
      setNewTitle(employee.title ? `${employee.title} (Senior)` : "Senior Consultant");
      setNewRole(employee.role || "NORMAL");
      setEffectiveQuarter(currentFiscalQuarter);
      setReason(`Promoted based on strong performance through Q${Math.max(1, currentFiscalQuarter - 1)}.`);
      setSelectedDeptId(primaryDeptId);
      setClosedOldKpiIds(new Set());
      setNewKpis([]);
    }
  }, [open, employee, currentFiscalQuarter, primaryDeptId]);

  const handleTransitionTypeChange = (type: "PROMOTION" | "DEMOTION") => {
    setTransitionType(type);
    if (type === "DEMOTION") {
      if (!newTitle || newTitle.includes("(Senior)")) {
        setNewTitle(employee.title ? employee.title.replace(/\s*\(Senior\)/i, "") : "Associate");
      }
      setReason(`Role demotion / reassignment effective Q${effectiveQuarter}.`);
    } else {
      if (!newTitle || newTitle === "Associate") {
        setNewTitle(employee.title ? `${employee.title} (Senior)` : "Senior Consultant");
      }
      setReason(`Promoted based on strong performance through Q${Math.max(1, currentFiscalQuarter - 1)}.`);
    }
  };

  // 1. Query employee's direct/cascaded KPIs (where employee is assignee)
  const { data: kpisData, loading: kpisLoading } = useQuery(GET_KPIS, {
    variables: {
      assigneeId: employee.employeeId,
      limit: 100,
    },
    skip: !open || !employee.employeeId,
    fetchPolicy: "network-only",
  });

  // 2. Query employee's assigned KPIs from holding pool / bulk assignment table
  // (Do not restrict by strategicPeriodId so assignments without an exact period match are still fetched)
  const { data: assignmentsData, loading: assignmentsLoading } = useQuery(
    GET_KPI_ASSIGNMENTS_EMPLOYEE,
    {
      variables: {
        employeeId: employee.employeeId,
        page: 1,
        limit: 100,
      },
      skip: !open || !employee.employeeId,
      fetchPolicy: "network-only",
    },
  );

  const kpisCombinedLoading = assignmentsLoading || kpisLoading;

  // Unified Assigned KPI item structure
  interface AssignedKpiItem {
    kpiId: string;
    name: string;
    weight: number;
    targetValue: number;
    measurementUnit: string;
  }

  // Merge KPIs from both sources (assignments table + direct/cascaded KPIs), deduplicated by kpiId
  const existingKpis: AssignedKpiItem[] = useMemo(() => {
    const map = new Map<string, AssignedKpiItem>();

    // First: add from kpi_assignment_employee
    const rawAssignments = assignmentsData?.kpiAssignmentsEmployee?.items || [];
    for (const a of rawAssignments) {
      if (a?.kpi?.kpiId) {
        map.set(a.kpi.kpiId, {
          kpiId: a.kpi.kpiId,
          name: a.kpi.name,
          weight: Number(a.weight || a.kpi.weight || 0),
          targetValue: Number(a.targetValue || a.kpi.targetValue || 0),
          measurementUnit: a.kpi.measurementUnit || "",
        });
      }
    }

    // Second: add from direct / cascaded KPIs
    const rawKpis = kpisData?.kpis?.items || [];
    for (const k of rawKpis) {
      if (k?.kpiId && !map.has(k.kpiId)) {
        map.set(k.kpiId, {
          kpiId: k.kpiId,
          name: k.name,
          weight: Number(k.weight || 0),
          targetValue: Number(k.assignedTargetValue ?? k.targetValue ?? 0),
          measurementUnit: k.measurementUnit || "",
        });
      }
    }

    return Array.from(map.values());
  }, [assignmentsData, kpisData]);

  // Initialize closed old KPIs once loaded: select all by default so unfinished quotas sweep to pool
  useEffect(() => {
    if (existingKpis.length > 0 && closedOldKpiIds.size === 0) {
      const allIds = new Set<string>(existingKpis.map((a) => a.kpiId));
      setClosedOldKpiIds(allIds);
    }
  }, [existingKpis]);

  // Query department holding pool for quota availability
  const { data: poolData, loading: poolLoading, refetch: refetchPool } = useQuery(
    GET_DEPARTMENT_HOLDING_POOL,
    {
      variables: {
        departmentId: selectedDeptId,
        annualStrategicPeriodId: effectiveAnnualPeriodId || "",
      },
      skip: !open || !selectedDeptId || !effectiveAnnualPeriodId,
      fetchPolicy: "network-only",
    },
  );

  const holdingPoolKpis: any[] = poolData?.departmentHoldingPool || [];

  // Query departments in organization
  const { data: deptsData } = useQuery(GET_DEPARTMENTS, {
    variables: { page: 1, limit: 100 },
    skip: !open,
  });
  const allDepartments = deptsData?.departments?.items || [];

  // Fallback: if employee has no primary department assigned, default to first department
  useEffect(() => {
    if (open && !selectedDeptId && allDepartments.length > 0) {
      setSelectedDeptId(primaryDeptId || allDepartments[0]?.departmentId || "");
    }
  }, [open, selectedDeptId, allDepartments, primaryDeptId]);

  // Helper to toggle old KPI close
  const toggleOldKpiClose = (kpiId: string) => {
    setClosedOldKpiIds((prev) => {
      const next = new Set(prev);
      if (next.has(kpiId)) {
        next.delete(kpiId);
      } else {
        next.add(kpiId);
      }
      return next;
    });
  };

  // Add new role KPI draft
  const handleAddNewKpi = () => {
    const parentKpi = holdingPoolKpis[0];
    const newDraft: NewRoleKpiDraft = {
      id: `draft-${Date.now()}`,
      parentKpiId: parentKpi ? parentKpi.kpiId : "",
      name: parentKpi ? `${parentKpi.kpiName} (Role Transition)` : "New Role KPI",
      unitType: parentKpi?.unitType || "NUMBER",
      measurementUnit: parentKpi?.measurementUnit || "number",
      q1Target: 0,
      q2Target: 0,
      q3Target: 0,
      q4Target: 0,
      weight: 20,
    };
    setNewKpis((prev) => [...prev, newDraft]);
  };

  const handleRemoveNewKpi = (id: string) => {
    setNewKpis((prev) => prev.filter((k) => k.id !== id));
  };

  const handleUpdateNewKpi = (id: string, updates: Partial<NewRoleKpiDraft>) => {
    setNewKpis((prev) =>
      prev.map((k) => {
        if (k.id !== id) return k;
        const updated = { ...k, ...updates };
        if (updates.parentKpiId && updates.parentKpiId !== k.parentKpiId) {
          const parent = holdingPoolKpis.find((p) => p.kpiId === updates.parentKpiId);
          if (parent) {
            updated.unitType = parent.unitType || "NUMBER";
            updated.measurementUnit = parent.measurementUnit || "number";
            if (!k.name || k.name.includes("Role Transition") || k.name === "New Role KPI") {
              updated.name = `${parent.kpiName} (Role Transition)`;
            }
          }
        }
        return updated;
      }),
    );
  };

  // Validation: Holding Pool Quota checks
  const quotaValidationErrors = useMemo(() => {
    const errors: string[] = [];
    newKpis.forEach((draft, idx) => {
      if (!draft.parentKpiId) {
        errors.push(`New KPI #${idx + 1}: Please select a parent department KPI.`);
        return;
      }
      const parentPool = holdingPoolKpis.find((p) => p.kpiId === draft.parentKpiId);
      if (!parentPool) return;

      [1, 2, 3, 4].forEach((q) => {
        if (q < effectiveQuarter) return; // Prior quarters are untouched
        const requestedTarget =
          q === 1 ? draft.q1Target : q === 2 ? draft.q2Target : q === 3 ? draft.q3Target : draft.q4Target;

        const qPool = parentPool.quarters?.find((item: any) => item.quarterNumber === q);
        const availableBalance = Number(qPool?.poolBalance || 0);

        if (requestedTarget > availableBalance) {
          errors.push(
            `"${draft.name}" Q${q} target (${requestedTarget.toLocaleString()}) exceeds holding pool balance (${availableBalance.toLocaleString()}) for ${parentPool.kpiName}.`,
          );
        }
      });
    });
    return errors;
  }, [newKpis, holdingPoolKpis, effectiveQuarter]);

  // Validation: Total Active Weight
  const { totalWeight, retainedWeight, newWeight } = useMemo(() => {
    let retained = 0;
    existingKpis.forEach((item) => {
      if (!closedOldKpiIds.has(item.kpiId)) {
        retained += Number(item.weight || 0);
      }
    });
    const added = newKpis.reduce((sum, k) => sum + Number(k.weight || 0), 0);
    return {
      totalWeight: retained + added,
      retainedWeight: retained,
      newWeight: added,
    };
  }, [existingKpis, closedOldKpiIds, newKpis]);

  // Mutation
  const [processTransition, { loading: submitting }] = useMutation(PROCESS_ROLE_TRANSITION);

  const handleSubmit = async () => {
    if (!newTitle.trim()) {
      toast.error("Please enter the new job position / title.");
      return;
    }
    if (!selectedDeptId) {
      toast.error("Please choose a department.");
      return;
    }
    if (quotaValidationErrors.length > 0) {
      toast.error("Please resolve holding pool quota errors before proceeding.");
      return;
    }

    try {
      const allocations = newKpis.map((k) => ({
        parentKpiId: k.parentKpiId,
        name: k.name,
        unitType: k.unitType,
        measurementUnit: k.measurementUnit,
        quarterlyTargets: [
          Number(effectiveQuarter <= 1 ? k.q1Target : 0),
          Number(effectiveQuarter <= 2 ? k.q2Target : 0),
          Number(effectiveQuarter <= 3 ? k.q3Target : 0),
          Number(effectiveQuarter <= 4 ? k.q4Target : 0),
        ],
        weight: Number(k.weight || 0),
      }));

      const res = await processTransition({
        variables: {
          input: {
            employeeId: employee.employeeId,
            departmentId: selectedDeptId,
            annualStrategicPeriodId: effectiveAnnualPeriodId!,
            transitionType: transitionType,
            newTitle: newTitle.trim(),
            newRole: newRole !== employee.role ? (newRole as EmployeeRole) : undefined,
            effectiveQuarter: Number(effectiveQuarter),
            closeOldKpiIds: Array.from(closedOldKpiIds),
            newKpiAllocations: allocations,
            reason:
              reason.trim() ||
              `${transitionType === "PROMOTION" ? "Promoted" : "Demoted / Reassigned"} to ${newTitle.trim()} effective Q${effectiveQuarter}.`,
          },
        },
      });

      if (res.data?.processRoleTransition?.success) {
        toast.success(
          res.data.processRoleTransition.message ||
            `${transitionType === "PROMOTION" ? "Promoted" : "Demoted"} ${employee.fullName} to ${newTitle} successfully.`,
        );
        setOpen(false);
        onSuccess?.();
      }
    } catch (err: any) {
      toast.error(
        err.message ||
          `Failed to process ${transitionType === "PROMOTION" ? "promotion" : "demotion"}.`,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="w-[95vw] max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className={`rounded-xl p-2 transition-colors ${
                transitionType === "PROMOTION"
                  ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
              }`}
            >
              {transitionType === "PROMOTION" ? (
                <Award className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
            </div>
            <div>
              <DialogTitle className="text-xl">
                {transitionType === "PROMOTION"
                  ? "Promote Employee / Role Transition"
                  : "Demote / Reassign Employee"}
              </DialogTitle>
              <DialogDescription>
                {transitionType === "PROMOTION" ? (
                  <>
                    Promote <strong>{employee.fullName}</strong>. Past delivered quarters remain frozen and
                    credited. Unworked future quotas return to the department holding pool.
                  </>
                ) : (
                  <>
                    Reassign or demote <strong>{employee.fullName}</strong>. Past delivered quarters remain frozen.
                    Unworked future quotas return to holding pool with ledger type{" "}
                    <code className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-400">
                      DEMOTION_REALLOCATE
                    </code>
                    .
                  </>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 py-3 text-sm">
          {/* Transition Type Segmented Selector */}
          <div className="p-1 bg-slate-100 dark:bg-zinc-800/80 rounded-xl flex items-center gap-1 border">
            <button
              type="button"
              onClick={() => handleTransitionTypeChange("PROMOTION")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                transitionType === "PROMOTION"
                  ? "bg-white dark:bg-zinc-900 text-indigo-700 dark:text-indigo-300 shadow-sm border border-slate-200/60 dark:border-zinc-700"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
              }`}
            >
              <Award className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              Promotion
            </button>
            <button
              type="button"
              onClick={() => handleTransitionTypeChange("DEMOTION")}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                transitionType === "DEMOTION"
                  ? "bg-white dark:bg-zinc-900 text-amber-700 dark:text-amber-300 shadow-sm border border-slate-200/60 dark:border-zinc-700"
                  : "text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100"
              }`}
            >
              <TrendingDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Demotion / Reassignment
            </button>
          </div>

          {/* Auto-resolved period info banner (shown when store was empty) */}
          {periodAutoResolved && (
            <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
              <span>
                No period was selected globally. Auto-resolved to the active annual strategic period.
                Visit the Dashboard to set a specific period if needed.
              </span>
            </div>
          )}

          {/* Section 1: Employee Current vs New Role */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 rounded-2xl border bg-slate-50/70 dark:bg-zinc-900/60 p-5">
            <div className="space-y-3">
              <Label className="text-xs text-slate-500 uppercase font-bold tracking-wider">Current Position</Label>
              <div className="rounded-xl border bg-white dark:bg-zinc-950 p-4 space-y-2.5 shadow-sm">
                <div>
                  <p className="font-bold text-base text-slate-900 dark:text-zinc-100">{employee.fullName}</p>
                  <p className="text-xs text-slate-500">{employee.email}</p>
                </div>
                <div className="pt-1 space-y-1 text-xs">
                  <p className="text-slate-600 dark:text-zinc-400">
                    Current Title:{" "}
                    <span className="font-semibold text-slate-800 dark:text-zinc-200">
                      {employee.title || "Employee"}
                    </span>
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant="outline" className="text-[11px] font-medium">
                      Role: {employee.role}
                    </Badge>
                    {empDepartments[0]?.name && (
                      <Badge variant="secondary" className="text-[11px] font-medium">
                        {empDepartments[0].name}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                Target Role Configuration
              </Label>
              <div className="space-y-3.5">
                <div>
                  <Label htmlFor="newTitle" className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    New Job Position / Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="newTitle"
                    className="mt-1 bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 shadow-sm"
                    placeholder="e.g. Senior Consultant, Team Lead"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="newRole" className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    System Access Role
                  </Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger
                      id="newRole"
                      className="mt-1 bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 shadow-sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NORMAL">NORMAL (Individual Contributor)</SelectItem>
                      <SelectItem value="COORDINATOR">COORDINATOR (Team Lead)</SelectItem>
                      <SelectItem value="MANAGER">MANAGER (Department Head)</SelectItem>
                      <SelectItem value="DIRECTOR">DIRECTOR (Division Head)</SelectItem>
                      <SelectItem value="HR">HR</SelectItem>
                      <SelectItem value="SMEAL">SMEAL (Strategy, Monitoring &amp; Evaluation)</SelectItem>
                      <SelectItem value="DCEO">DCEO (Deputy CEO)</SelectItem>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="effectiveQuarter" className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                    Effective Transition Quarter
                  </Label>
                  <Select
                    value={String(effectiveQuarter)}
                    onValueChange={(val) => setEffectiveQuarter(Number(val))}
                  >
                    <SelectTrigger
                      id="effectiveQuarter"
                      className="mt-1 bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700 shadow-sm"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Q1 (Annual Start — Jul to Sep)</SelectItem>
                      <SelectItem value="2">Q2 (Mid-Year — Oct to Dec)</SelectItem>
                      <SelectItem value="3">Q3 (Winter — Jan to Mar)</SelectItem>
                      <SelectItem value="4">Q4 (Final — Apr to Jun)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Department Selection if employee has multiple or none */}
          <div>
            <Label className="font-medium">Department</Label>
            <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Choose department..." />
              </SelectTrigger>
              <SelectContent>
                {allDepartments.map((d: any) => (
                  <SelectItem key={d.departmentId} value={d.departmentId}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Section 2: Old Role KPIs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <History className="h-4 w-4 text-slate-500" />
                  Prior Role KPIs ({existingKpis.length})
                </h4>
                <p className="text-xs text-slate-500">
                  Select KPIs to close starting in Q{effectiveQuarter}. Checked KPIs have future quotas swept to pool; past quarter actuals stay safely locked.
                </p>
              </div>
            </div>

            {kpisCombinedLoading ? (
              <p className="text-xs text-slate-400 py-2">Loading current assigned KPIs...</p>
            ) : existingKpis.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-2">No current KPIs assigned to this employee.</p>
            ) : (
              <div className="rounded-xl border divide-y overflow-hidden max-h-48 overflow-y-auto">
                {existingKpis.map((kpiItem) => {
                  const isClosed = closedOldKpiIds.has(kpiItem.kpiId);
                  return (
                    <label
                      key={kpiItem.kpiId}
                      className={`flex items-center justify-between p-2.5 cursor-pointer text-xs transition-colors ${
                        isClosed
                          ? "bg-amber-50/50 dark:bg-amber-950/20"
                          : "hover:bg-slate-50 dark:hover:bg-zinc-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isClosed}
                          onChange={() => toggleOldKpiClose(kpiItem.kpiId)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-zinc-100">{kpiItem.name}</p>
                          <p className="text-[11px] text-slate-500">
                            Weight: {kpiItem.weight}% · Target: {kpiItem.targetValue}{" "}
                            {kpiItem.measurementUnit || ""}
                          </p>
                        </div>
                      </div>
                      <Badge variant={isClosed ? "default" : "outline"} className="text-[10px]">
                        {isClosed ? `Retire from Q${effectiveQuarter}` : "Keep Active"}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: New Role KPIs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  New Role KPIs ({newKpis.length})
                </h4>
                <p className="text-xs text-slate-500">
                  Allocate new KPIs from department holding pool for Q{effectiveQuarter} through Q4.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddNewKpi}
                className="gap-1 text-xs rounded-xl"
              >
                <Plus className="h-3.5 w-3.5" />
                Add New Role KPI
              </Button>
            </div>

            {newKpis.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-500">
                No new role KPIs added yet. Click &quot;Add New Role KPI&quot; to assign targets for the promoted position.
              </div>
            ) : (
              <div className="space-y-3">
                {newKpis.map((draft, idx) => {
                  const parentPool = holdingPoolKpis.find((p) => p.kpiId === draft.parentKpiId);
                  return (
                    <Card key={draft.id} className="p-3.5 rounded-xl border space-y-3 relative">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                          #{idx + 1} New Role KPI
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 hover:text-red-700"
                          onClick={() => handleRemoveNewKpi(draft.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="space-y-3.5">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                            1. Department Parent KPI (Holding Pool Source) <span className="text-red-500">*</span>
                          </Label>
                          <Select
                            value={draft.parentKpiId}
                            onValueChange={(val) => handleUpdateNewKpi(draft.id, { parentKpiId: val })}
                          >
                            <SelectTrigger className="text-xs bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700">
                              <SelectValue placeholder="Choose parent KPI to allocate from..." />
                            </SelectTrigger>
                            <SelectContent>
                              {holdingPoolKpis.map((p) => (
                                <SelectItem key={p.kpiId} value={p.kpiId} className="text-xs">
                                  {p.kpiName} ({p.measurementUnit || "units"})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {parentPool && (
                            <div className="mt-1.5 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-[11px] text-emerald-800 dark:text-emerald-300">
                              <span className="font-semibold">Pool Available:</span>{" "}
                              {parentPool.quarters
                                ?.filter((q: any) => q.quarterNumber >= effectiveQuarter)
                                .map((q: any) => `Q${q.quarterNumber}: ${Number(q.poolBalance).toLocaleString()}`)
                                .join(" · ")}
                            </div>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                            2. New Role KPI Display Name <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            className="text-xs bg-white dark:bg-zinc-900 border-slate-300 dark:border-zinc-700"
                            placeholder="e.g. Delivered Projects (Role Transition)"
                            value={draft.name}
                            onChange={(e) => handleUpdateNewKpi(draft.id, { name: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                        <div>
                          <Label className="text-[11px] text-slate-500">Q1 Target</Label>
                          <Input
                            type="number"
                            disabled={effectiveQuarter > 1}
                            className="mt-1 text-xs tabular-nums"
                            value={draft.q1Target}
                            onChange={(e) =>
                              handleUpdateNewKpi(draft.id, { q1Target: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Q2 Target</Label>
                          <Input
                            type="number"
                            disabled={effectiveQuarter > 2}
                            className="mt-1 text-xs tabular-nums"
                            value={draft.q2Target}
                            onChange={(e) =>
                              handleUpdateNewKpi(draft.id, { q2Target: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Q3 Target</Label>
                          <Input
                            type="number"
                            disabled={effectiveQuarter > 3}
                            className="mt-1 text-xs tabular-nums"
                            value={draft.q3Target}
                            onChange={(e) =>
                              handleUpdateNewKpi(draft.id, { q3Target: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Q4 Target</Label>
                          <Input
                            type="number"
                            className="mt-1 text-xs tabular-nums"
                            value={draft.q4Target}
                            onChange={(e) =>
                              handleUpdateNewKpi(draft.id, { q4Target: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-slate-500">Weight (%)</Label>
                          <Input
                            type="number"
                            className="mt-1 text-xs tabular-nums font-semibold"
                            value={draft.weight}
                            onChange={(e) =>
                              handleUpdateNewKpi(draft.id, { weight: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: Real-Time Validation Feedback & Balance Preview */}
          <div className="rounded-xl border p-3.5 space-y-2 bg-slate-50/70 dark:bg-zinc-900/70">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-700 dark:text-zinc-300">
                Active Weights Summary
              </span>
              <Badge
                variant={totalWeight === 100 ? "default" : "outline"}
                className={`text-xs ${
                  totalWeight === 100
                    ? "bg-emerald-600 text-white"
                    : "text-amber-600 border-amber-300 dark:text-amber-400"
                }`}
              >
                {totalWeight === 100 ? "100% (Balanced)" : `${totalWeight}% (Re-check)`}
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500">
              Retained Old KPIs Weight: <strong>{retainedWeight}%</strong> · New Role KPIs Weight:{" "}
              <strong>{newWeight}%</strong> · Total: <strong>{totalWeight}%</strong>
            </p>

            {quotaValidationErrors.length > 0 && (
              <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-300 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Holding Pool Exceeded:
                </div>
                {quotaValidationErrors.map((err, i) => (
                  <p key={i} className="pl-5 text-[11px]">
                    • {err}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Section 5: Reason */}
          <div>
            <Label htmlFor="transitionReason" className="font-medium">
              {transitionType === "PROMOTION"
                ? "Promotion Reason & Justification"
                : "Demotion Reason & Justification"}
            </Label>
            <Input
              id="transitionReason"
              className="mt-1"
              placeholder={
                transitionType === "PROMOTION"
                  ? "e.g. Promoted to Senior Consultant following Q1 milestone delivery..."
                  : "e.g. Department restructuring or performance re-alignment..."
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || quotaValidationErrors.length > 0}
            className={
              transitionType === "PROMOTION"
                ? "bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                : "bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            }
          >
            {transitionType === "PROMOTION" ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {submitting
              ? transitionType === "PROMOTION"
                ? "Processing Promotion..."
                : "Processing Demotion..."
              : transitionType === "PROMOTION"
              ? "Complete Promotion"
              : "Complete Demotion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
