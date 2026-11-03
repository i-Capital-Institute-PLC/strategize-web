import React from "react";
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  AssignmentProvider,
  useAssignmentContext,
} from "./AssignmentContext";
import type { Objective, Kpi } from "@/types/graphql";

const mockObjective: Objective = {
  objectiveId: "obj-1",
  title: "Deliver Digital Transformation",
  level: "CORPORATE",
  type: "CORPORATE",
  status: "APPROVED",
  assigneeType: "CORPORATE",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  order: 1,
} as unknown as Objective;

const mockKpis: Kpi[] = [
  {
    kpiId: "kpi-uuid-1",
    name: "Revenue Growth",
    targetValue: 100,
    unitType: "CURRENCY",
    kpiMode: "AGGREGATED",
  } as unknown as Kpi,
  {
    kpiId: "kpi-uuid-2",
    name: "Customer Satisfaction",
    targetValue: 90,
    unitType: "PERCENT",
    kpiMode: "AGGREGATED",
  } as unknown as Kpi,
];

describe("AssignmentContext: UUID Keying & Clean Removal", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AssignmentProvider objective={mockObjective} kpis={mockKpis}>
      {children}
    </AssignmentProvider>
  );

  it("adds assignments and maps targets keyed strictly by UUID", () => {
    const { result } = renderHook(() => useAssignmentContext(), { wrapper });

    act(() => {
      result.current.addAssignment({
        assigneeId: "emp-uuid-101",
        assigneeType: "PERSONNEL",
        assigneeName: "Abebe Bikila",
        kpis: ["kpi-uuid-1", "kpi-uuid-2"],
      });
      result.current.setTarget("kpi-uuid-1", "emp-uuid-101", 60);
      result.current.setDirectBasisAllocation("kpi-uuid-1", "emp-uuid-101", "500000");
    });

    expect(result.current.assignments).toHaveLength(1);
    expect(result.current.assignments[0].assigneeId).toBe("emp-uuid-101");
    expect(result.current.targets["kpi-uuid-1"]?.["emp-uuid-101"]).toBe(60);
    expect(
      result.current.directBasisAllocations["kpi-uuid-1"]?.["emp-uuid-101"]
    ).toBe("500000");
  });

  it("removes assignment by assigneeId and completely purges targets and basis allocations", () => {
    const { result } = renderHook(() => useAssignmentContext(), { wrapper });

    act(() => {
      // Add two assignees
      result.current.addAssignment({
        assigneeId: "emp-uuid-101",
        assigneeType: "PERSONNEL",
        assigneeName: "Abebe Bikila",
        kpis: ["kpi-uuid-1"],
      });
      result.current.addAssignment({
        assigneeId: "emp-uuid-102",
        assigneeType: "PERSONNEL",
        assigneeName: "Derartu Tulu",
        kpis: ["kpi-uuid-1"],
      });

      result.current.setTarget("kpi-uuid-1", "emp-uuid-101", 60);
      result.current.setTarget("kpi-uuid-1", "emp-uuid-102", 40);
      result.current.setDirectBasisAllocation("kpi-uuid-1", "emp-uuid-101", "600000");
      result.current.setDirectBasisAllocation("kpi-uuid-1", "emp-uuid-102", "400000");
    });

    expect(result.current.assignments).toHaveLength(2);

    // Now remove emp-uuid-101 using assigneeId
    act(() => {
      result.current.removeAssignment("emp-uuid-101");
    });

    // Verify emp-uuid-101 is gone from assignments list
    expect(result.current.assignments).toHaveLength(1);
    expect(result.current.assignments[0].assigneeId).toBe("emp-uuid-102");

    // Verify emp-uuid-101 targets are cleanly purged, avoiding memory leaks and payload corruption
    expect(result.current.targets["kpi-uuid-1"]?.["emp-uuid-101"]).toBeUndefined();
    expect(
      result.current.directBasisAllocations["kpi-uuid-1"]?.["emp-uuid-101"]
    ).toBeUndefined();

    // Verify emp-uuid-102 targets remain untouched
    expect(result.current.targets["kpi-uuid-1"]?.["emp-uuid-102"]).toBe(40);
    expect(
      result.current.directBasisAllocations["kpi-uuid-1"]?.["emp-uuid-102"]
    ).toBe("400000");
  });
});

