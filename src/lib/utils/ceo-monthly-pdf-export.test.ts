import { describe, it, expect, vi } from "vitest";
import {
  exportCeoMonthlyReportPDF,
  CeoMonthlyPdfReportData,
} from "./ceo-monthly-pdf-export";

// Mock jsPDF and jspdf-autotable
const mockSave = vi.fn();
const mockSetPage = vi.fn();
const mockText = vi.fn();
const mockRect = vi.fn();
const mockLine = vi.fn();
const mockSetFont = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetTextColor = vi.fn();
const mockSetFillColor = vi.fn();
const mockSetDrawColor = vi.fn();

vi.mock("jspdf", () => {
  return {
    default: vi.fn(function () {
      return {
        internal: {
          pageSize: {
            getWidth: () => 841.89,
            getHeight: () => 595.28,
          },
          getNumberOfPages: () => 1,
        },
        save: mockSave,
        setPage: mockSetPage,
        text: mockText,
        rect: mockRect,
        line: mockLine,
        setFont: mockSetFont,
        setFontSize: mockSetFontSize,
        setTextColor: mockSetTextColor,
        setFillColor: mockSetFillColor,
        setDrawColor: mockSetDrawColor,
      };
    }),
  };
});

let capturedAutoTableConfig: any = null;
vi.mock("jspdf-autotable", () => {
  return {
    default: vi.fn().mockImplementation((doc: any, config: any) => {
      capturedAutoTableConfig = config;
    }),
  };
});

describe("CEO Monthly PDF Export Utility", () => {
  const sampleData: CeoMonthlyPdfReportData = {
    periodName: "FY 2026 Q1",
    fiscalYear: 2026,
    quarterNumber: 1,
    monthInQuarter: 1,
    calendarMonth: "July 2026",
    items: [
      {
        kpiId: "kpi-1",
        kpiName: "Operational Excellence Rate (%)",
        strategicObjective: "Service Quality",
        assigneeType: "DIVISION",
        unitName: "Digital and AI Solution",
        unitType: "PERCENT",
        annualTarget: 90,
        monthlyTarget: 90, // Policy: stays 90%
        previousMonthDeviation: 0,
        currentMonthActual: 92,
        adjustedAchievement: 92,
        closingDeviation: 2,
        achievementPercentage: 102.22,
      },
      {
        kpiId: "kpi-2",
        kpiName: "Total Portfolio Revenue (M ETB)",
        strategicObjective: "Financial Sustainability",
        assigneeType: "DEPARTMENT",
        unitName: "Finance and Portfolio",
        unitType: "NUMBER",
        annualTarget: 120,
        monthlyTarget: 10, // 30 / 3 = 10
        previousMonthDeviation: -2,
        currentMonthActual: 9,
        adjustedAchievement: 7,
        closingDeviation: -3,
        achievementPercentage: 70,
      },
    ],
  };

  it("exports a landscape PDF with the 9 executive columns matching iCapital template", () => {
    mockSave.mockClear();
    capturedAutoTableConfig = null;

    exportCeoMonthlyReportPDF(sampleData);

    expect(capturedAutoTableConfig).toBeDefined();
    expect(capturedAutoTableConfig.head[0]).toEqual([
      "Strategic Objective",
      "Performance Measure (KPI)",
      "Unit / Direct Report",
      "Annual Target",
      "Monthly Target (1/3 Q)",
      "Prev. Month Deviation",
      "Current Actual",
      "Adjusted Achievement",
      "Closing Deviation",
      "Achievement (%)",
    ]);

    // Check rows count
    expect(capturedAutoTableConfig.body).toHaveLength(2);

    // Row 1 (Percentage KPI)
    const row1 = capturedAutoTableConfig.body[0];
    expect(row1[0]).toBe("Service Quality");
    expect(row1[1]).toBe("Operational Excellence Rate (%)");
    expect(row1[2]).toBe("Digital and AI Solution");
    expect(row1[3]).toBe("90%");
    expect(row1[4]).toBe("90%");
    expect(row1[5]).toBe("0");
    expect(row1[6]).toBe("92%");
    expect(row1[7]).toBe("92%");
    expect(row1[8]).toBe("+2");
    expect(row1[9]).toBe("102.22%");

    // Row 2 (Additive KPI with negative closing deviation)
    const row2 = capturedAutoTableConfig.body[1];
    expect(row2[0]).toBe("Financial Sustainability");
    expect(row2[1]).toBe("Total Portfolio Revenue (M ETB)");
    expect(row2[2]).toBe("Finance and Portfolio");
    expect(row2[3]).toBe("120");
    expect(row2[4]).toBe("10");
    expect(row2[5]).toBe("-2");
    expect(row2[6]).toBe("9");
    expect(row2[7]).toBe("7");
    expect(row2[8]).toBe("-3");
    expect(row2[9]).toBe("70%");

    // Saved with standard executive file naming
    expect(mockSave).toHaveBeenCalledWith(
      "CEO_Direct_Reports_Monthly_Report_July_2026.pdf",
    );
  });
});
