import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import CeoMonthlyPerformanceReportView from "./CeoMonthlyPerformanceReportView";
import { useAuthStore } from "@/stores";

// Mock Apollo useQuery
const mockReportData = {
  ceoMonthlyPerformanceReport: {
    periodName: "FY 2026 Q1",
    fiscalYear: 2026,
    quarterNumber: 1,
    monthInQuarter: 1,
    calendarMonth: "July 2026",
    items: [
      {
        kpiId: "kpi-das-1",
        kpiName: "AI Solution Delivery Rate",
        strategicObjective: "Digital Innovation",
        assigneeType: "DIVISION",
        unitName: "Digital and AI Solution",
        unitType: "PERCENT",
        annualTarget: 90,
        quarterBasePlan: 90,
        monthlyTarget: 90,
        previousMonthDeviation: 0,
        currentMonthActual: 91,
        adjustedAchievement: 91,
        closingDeviation: 1,
        achievementPercentage: 101.11,
      },
    ],
  },
};

vi.mock("@apollo/client", () => {
  return {
    gql: (strings: any) => strings,
    useQuery: vi.fn(() => ({
      data: mockReportData,
      loading: false,
      error: null,
      refetch: vi.fn(),
    })),
  };
});

// Mock stores
vi.mock("@/stores", () => ({
  useAuthStore: vi.fn(),
}));

describe("CeoMonthlyPerformanceReportView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restricts access and shows warning when user is a regular employee or manager", () => {
    (useAuthStore as any).mockImplementation((selector: any) =>
      selector({ user: { role: "MANAGER", fullName: "Jane Doe" } }),
    );

    render(<CeoMonthlyPerformanceReportView />);

    expect(screen.getByText("Executive Access Restricted")).toBeDefined();
    expect(
      screen.getByText(/restricted to the/i),
    ).toBeDefined();
  });

  it("renders report preview, executive controls, and export button for CEO", () => {
    (useAuthStore as any).mockImplementation((selector: any) =>
      selector({ user: { role: "CEO", fullName: "Dr. Gemechu Waktola" } }),
    );

    render(<CeoMonthlyPerformanceReportView />);

    expect(screen.getByText("2. Performance Summary")).toBeDefined();
    expect(screen.getByText("The iCapital Africa Group")).toBeDefined();
    expect(screen.getByText("Export Executive PDF Slide")).toBeDefined();
    expect(screen.getByText("AI Solution Delivery Rate")).toBeDefined();
    expect(screen.getByText("Digital and AI Solution")).toBeDefined();
  });

  it("renders report preview, executive controls, and export button for SUPER_ADMIN (Deputy CEO)", () => {
    (useAuthStore as any).mockImplementation((selector: any) =>
      selector({ user: { role: "SUPER_ADMIN", fullName: "Bruktawit Teshome" } }),
    );

    render(<CeoMonthlyPerformanceReportView />);

    expect(screen.getByText("2. Performance Summary")).toBeDefined();
    expect(screen.getByText("Export Executive PDF Slide")).toBeDefined();
    expect(screen.getByText("AI Solution Delivery Rate")).toBeDefined();
  });
});
