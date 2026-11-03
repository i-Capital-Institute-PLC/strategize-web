import { describe, it, expect } from "vitest";
import { validateQuarterlyBreakdown } from "./validation";
import type { Kpi } from "@/types/graphql";

describe("validateQuarterlyBreakdown", () => {
  it("averages only active quarters for percentage KPIs (e.g. Q1=100%, Q3=100%, Q2=0%, Q4=0%)", () => {
    const kpi: Partial<Kpi> = {
      kpiId: "kpi-test",
      unitType: "PERCENT",
      targets: [
        { timeline: "2026", target: 100 },
      ],
    };

    const yearlyQuarters = {
      "2026": {
        q1: "100",
        q2: "0",
        q3: "100",
        q4: "0",
      },
    };

    const result = validateQuarterlyBreakdown(
      "2026",
      yearlyQuarters,
      kpi as Kpi,
      null,
    );

    expect(result.isValid).toBe(true);
    expect(result.currentSum).toBe(100);
    expect(result.message).toContain("Perfect! Quarterly planning matches Target");
  });

  it("averages when only 1 quarter is active", () => {
    const kpi: Partial<Kpi> = {
      kpiId: "kpi-test",
      unitType: "PERCENT",
      targets: [
        { timeline: "2026", target: 100 },
      ],
    };

    const yearlyQuarters = {
      "2026": {
        q1: "100",
        q2: "",
        q3: "",
        q4: "",
      },
    };

    const result = validateQuarterlyBreakdown(
      "2026",
      yearlyQuarters,
      kpi as Kpi,
      null,
    );

    expect(result.isValid).toBe(true);
    expect(result.currentSum).toBe(100);
  });

  it("fails when average of active quarters does not match target", () => {
    const kpi: Partial<Kpi> = {
      kpiId: "kpi-test",
      unitType: "PERCENT",
      targets: [
        { timeline: "2026", target: 100 },
      ],
    };

    const yearlyQuarters = {
      "2026": {
        q1: "80",
        q2: "0",
        q3: "60",
        q4: "0",
      },
    };

    const result = validateQuarterlyBreakdown(
      "2026",
      yearlyQuarters,
      kpi as Kpi,
      null,
    );

    // (80 + 60) / 2 = 70 != 100
    expect(result.isValid).toBe(false);
    expect(result.currentSum).toBe(70);
    expect(result.message).toContain("Average (70 %) is below Target (100 %)");
  });
});

