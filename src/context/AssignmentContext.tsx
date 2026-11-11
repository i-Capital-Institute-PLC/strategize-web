"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import type { Objective, Kpi } from "@/types/graphql";

export type AssigneeType = "DIVISION" | "DEPARTMENT" | "UNIT" | "PERSONNEL";

export interface Assignment {
  assigneeId: string;
  assigneeType: AssigneeType;
  assigneeName: string;
  kpis: string[]; // KPI IDs to be assigned
}

export interface ExistingAllocation {
  assigneeId: string;
  assigneeType?: string;
  assigneeName?: string;
  targetValue: number;
  directBasisValue?: string;
}

export interface ExistingKpiAllocations {
  totalTarget: number;
  totalBasis: number;
  allocations: ExistingAllocation[];
}

interface AssignmentContextType {
  // Configuration
  sourceObjective: Objective | null;
  availableKPIs: Kpi[];

  // Existing Allocations from prior sessions
  existingAllocationsByKpiId: Record<string, ExistingKpiAllocations>;

  // Search & Filter State
  searchTerm: string;
  setSearchTerm: (term: string) => void;

  // Selection State
  assigneeType: AssigneeType;
  setAssigneeType: (type: AssigneeType) => void;

  selectedAssignees: { id: string; name: string; type: AssigneeType }[]; // Objects of currently selected items in the tab
  toggleAssignee: (
    assignee: { id: string; name: string; type: AssigneeType },
    checked: boolean,
  ) => void;
  clearSelectedAssignees: () => void;

  selectedKPIs: string[]; // IDs of KPIs selected for the NEXT assignment
  toggleKPI: (id: string, checked: boolean) => void;
  selectAllKPIs: (checked: boolean) => void;

  // Assignments State (The list of "staged" assignments)
  assignments: Assignment[];
  addAssignment: (assignment: Assignment) => void;
  removeAssignment: (assigneeId: string) => void;
  clearAssignments: () => void;

  // Target values for assignments (kpiId -> assigneeId -> value)
  targets: Record<string, Record<string, number | null>>; // kpiId -> { assigneeId: targetValue }
  setTarget: (kpiId: string, assigneeId: string, value: number | null) => void;
  directBasisAllocations: Record<string, Record<string, string>>;
  setDirectBasisAllocation: (
    kpiId: string,
    assigneeId: string,
    value: string,
  ) => void;

  // Bulk Assignment Helper
  bulkAssignmentValues: Record<string, number>;
  setBulkAssignmentValue: (kpiId: string, value: number) => void;
}

const AssignmentContext = createContext<AssignmentContextType | undefined>(
  undefined,
);

export function AssignmentProvider({
  children,
  objective,
  kpis,
  existingAllocations = {},
}: {
  children: React.ReactNode;
  objective: Objective;
  kpis: Kpi[];
  existingAllocations?: Record<string, ExistingKpiAllocations>;
}) {
  // State
  const [searchTerm, setSearchTerm] = useState("");

  // Initialize assigneeType based on the current objective level. For older cascaded
  // objectives, `type` may still be CORPORATE, so prefer `assigneeType` when present.
  const [assigneeType, setAssigneeType] = useState<AssigneeType>(() => {
    const currentLevel = objective.assigneeType || objective.type;
    if (currentLevel === "DIVISION") return "DEPARTMENT";
    if (currentLevel === "DEPARTMENT") return "UNIT";
    if (currentLevel === "UNIT") return "PERSONNEL";
    return "DIVISION"; // Default for CORPORATE or others
  });

  const [selectedAssignees, setSelectedAssignees] = useState<
    { id: string; name: string; type: AssigneeType }[]
  >([]);

  const assignableKPIs = useMemo(
    () => kpis.filter((k) => (k.kpiMode || "AGGREGATED") !== "DIRECT"),
    [kpis],
  );

  // Auto-select all cascade-able KPIs by default. DIRECT KPIs stay with the current manager.
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>(() =>
    assignableKPIs.map((k) => k.kpiId),
  );

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [targets, setTargets] = useState<
    Record<string, Record<string, number | null>>
  >({});
  const [directBasisAllocations, setDirectBasisAllocations] = useState<
    Record<string, Record<string, string>>
  >({});
  const [bulkAssignmentValues, setBulkAssignmentValues] = useState<
    Record<string, number>
  >({});

  // Actions
  const toggleAssignee = useCallback(
    (
      assignee: { id: string; name: string; type: AssigneeType },
      checked: boolean,
    ) => {
      setSelectedAssignees((prev) =>
        checked
          ? [...prev, assignee]
          : prev.filter((a) => a.id !== assignee.id),
      );
    },
    [],
  );

  const clearSelectedAssignees = useCallback(() => {
    setSelectedAssignees([]);
  }, []);

  const toggleKPI = useCallback(
    (id: string, checked: boolean) => {
      const selectedKpi = assignableKPIs.find((k) => k.kpiId === id);
      if (checked && !selectedKpi) return;

      setSelectedKPIs((prev) => {
        if (!checked) {
          const requiredBySelectedRate = assignableKPIs.some(
            (kpi) =>
              prev.includes(kpi.kpiId) &&
              kpi.calculationBasisSource === "LINKED_KPI" &&
              kpi.weightingBasisKpiId === id,
          );
          return requiredBySelectedRate
            ? prev
            : prev.filter((selectedId) => selectedId !== id);
        }
        const linkedBasisId =
          selectedKpi?.calculationBasisSource === "LINKED_KPI"
            ? selectedKpi.weightingBasisKpiId
            : null;
        if (linkedBasisId && !prev.includes(linkedBasisId)) {
          return [...prev, id, linkedBasisId];
        }
        return [...prev, id];
      });
    },
    [assignableKPIs],
  );

  const selectAllKPIs = useCallback(
    (checked: boolean) => {
      setSelectedKPIs(checked ? assignableKPIs.map((k) => k.kpiId) : []);
    },
    [assignableKPIs],
  );

  const addAssignment = useCallback((newAssignment: Assignment) => {
    setAssignments((prev) => {
      const existingIndex = prev.findIndex(
        (a) =>
          a.assigneeId === newAssignment.assigneeId &&
          a.assigneeType === newAssignment.assigneeType,
      );

      if (existingIndex >= 0) {
        // Merge KPIs
        const updated = [...prev];
        const existing = updated[existingIndex];
        const mergedKPIs = Array.from(
          new Set([...existing.kpis, ...newAssignment.kpis]),
        );
        updated[existingIndex] = { ...existing, kpis: mergedKPIs };
        return updated;
      }

      return [...prev, newAssignment];
    });
  }, []);

  const removeAssignment = useCallback((assigneeId: string) => {
    setAssignments((prev) =>
      prev.filter((assignment) => assignment.assigneeId !== assigneeId),
    );
    // Task 2.2: Cleanly purge removed assignee's data from targets and basis maps
    setTargets((prev) => {
      let modified = false;
      const next: Record<string, Record<string, number | null>> = {};
      for (const [kpiId, assigneeMap] of Object.entries(prev)) {
        if (assigneeMap && assigneeId in assigneeMap) {
          modified = true;
          const { [assigneeId]: _, ...rest } = assigneeMap;
          next[kpiId] = rest;
        } else {
          next[kpiId] = assigneeMap;
        }
      }
      return modified ? next : prev;
    });
    setDirectBasisAllocations((prev) => {
      let modified = false;
      const next: Record<string, Record<string, string>> = {};
      for (const [kpiId, basisMap] of Object.entries(prev)) {
        if (basisMap && assigneeId in basisMap) {
          modified = true;
          const { [assigneeId]: _, ...rest } = basisMap;
          next[kpiId] = rest;
        } else {
          next[kpiId] = basisMap;
        }
      }
      return modified ? next : prev;
    });
  }, []);

  const clearAssignments = useCallback(() => {
    setAssignments([]);
    setTargets({});
    setDirectBasisAllocations({});
  }, []);

  const setTarget = useCallback(
    (kpiId: string, assigneeId: string, value: number | null) => {
      setTargets((prev) => ({
        ...prev,
        [kpiId]: {
          ...(prev[kpiId] || {}),
          [assigneeId]: value,
        },
      }));
    },
    [],
  );

  const setDirectBasisAllocation = useCallback(
    (kpiId: string, assigneeId: string, value: string) => {
      setDirectBasisAllocations((prev) => ({
        ...prev,
        [kpiId]: {
          ...(prev[kpiId] || {}),
          [assigneeId]: value,
        },
      }));
    },
    [],
  );

  const setBulkAssignmentValue = useCallback((kpiId: string, value: number) => {
    setBulkAssignmentValues((prev) => ({
      ...prev,
      [kpiId]: value,
    }));
  }, []);

  const value = useMemo(
    () => ({
      sourceObjective: objective,
      availableKPIs: kpis,
      existingAllocationsByKpiId: existingAllocations,
      searchTerm,
      setSearchTerm,
      assigneeType,
      setAssigneeType,
      selectedAssignees,
      toggleAssignee,
      clearSelectedAssignees,
      selectedKPIs,
      toggleKPI,
      selectAllKPIs,
      assignments,
      addAssignment,
      removeAssignment,
      clearAssignments,
      targets,
      setTarget,
      directBasisAllocations,
      setDirectBasisAllocation,
      bulkAssignmentValues,
      setBulkAssignmentValue,
    }),
    [
      objective,
      kpis,
      existingAllocations,
      searchTerm,
      assigneeType,
      selectedAssignees,
      selectedKPIs,
      assignments,
      targets,
      directBasisAllocations,
      bulkAssignmentValues,
      toggleAssignee,
      clearSelectedAssignees,
      toggleKPI,
      selectAllKPIs,
      addAssignment,
      removeAssignment,
      clearAssignments,
      setTarget,
      setDirectBasisAllocation,
      setBulkAssignmentValue,
    ],
  );

  return (
    <AssignmentContext.Provider value={value}>
      {children}
    </AssignmentContext.Provider>
  );
}

export function useAssignmentContext() {
  const context = useContext(AssignmentContext);
  if (context === undefined) {
    throw new Error(
      "useAssignmentContext must be used within an AssignmentProvider",
    );
  }
  return context;
}
