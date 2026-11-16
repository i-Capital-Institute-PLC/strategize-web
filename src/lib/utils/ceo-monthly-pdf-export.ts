import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface CeoMonthlyPdfItem {
  kpiId: string;
  kpiName: string;
  strategicObjective: string;
  assigneeType: string;
  unitName: string;
  unitType: string;
  annualTarget: number;
  monthlyTarget: number;
  previousMonthDeviation: number;
  currentMonthActual: number;
  adjustedAchievement: number;
  closingDeviation: number;
  achievementPercentage: number;
}

export interface CeoMonthlyPdfReportData {
  periodName: string;
  fiscalYear: number;
  quarterNumber: number;
  monthInQuarter: number;
  calendarMonth: string;
  items: CeoMonthlyPdfItem[];
}

export function exportCeoMonthlyReportPDF(data: CeoMonthlyPdfReportData) {
  // A4 Landscape: 841.89 x 595.28 points
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Top Section Title & Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(122, 64, 105); // #7A4069 Wine/Plum color from iCapital template
  doc.text("2. Performance Summary", 36, 42);

  // Subtitle / Period Meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate-500
  const metaText = `The iCapital Africa Group · CEO Direct Reports · ${data.calendarMonth} (FY ${data.fiscalYear} Q${data.quarterNumber} Month ${data.monthInQuarter})`;
  doc.text(metaText, 36, 58);

  // Orange brand accent bar
  doc.setFillColor(245, 130, 32); // #F58220 iCapital Orange
  doc.rect(36, 66, pageWidth - 72, 2.5, "F");

  // Table Columns matching template (with Adjusted Achievement before Current Actual)
  const headers = [
    [
      "Strategic Objective",
      "Performance Measure (KPI)",
      "Unit / Direct Report",
      "Annual Target",
      "Monthly Target (1/3 Q)",
      "Prev. Month Deviation",
      "Adjusted Achievement",
      "Current Actual",
      "Closing Deviation",
      "Achievement (%)",
    ],
  ];

  const formatNumber = (val: number, isPercent = false) => {
    if (val === undefined || val === null || isNaN(val)) return "-";
    const formatted = Number(val).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return isPercent ? `${formatted}%` : formatted;
  };

  const formatDeviation = (val: number) => {
    if (val === undefined || val === null || isNaN(val)) return "-";
    const sign = val > 0 ? "+" : "";
    return `${sign}${Number(val).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`;
  };

  const rows = data.items.map((item) => {
    const isRate =
      item.unitType === "PERCENT" ||
      item.unitType === "RATIO" ||
      item.kpiName.toLowerCase().includes("%") ||
      item.kpiName.toLowerCase().includes("rate");

    return [
      item.strategicObjective || "Corporate Objective",
      item.kpiName,
      item.unitName || item.assigneeType,
      formatNumber(item.annualTarget, isRate),
      formatNumber(item.monthlyTarget, isRate),
      formatDeviation(item.previousMonthDeviation),
      formatNumber(item.adjustedAchievement, isRate),
      formatNumber(item.currentMonthActual, isRate),
      formatDeviation(item.closingDeviation),
      formatNumber(item.achievementPercentage, true),
    ];
  });

  autoTable(doc, {
    head: headers,
    body: rows,
    startY: 78,
    margin: { left: 36, right: 36, bottom: 48 },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      valign: "middle",
    },
    headStyles: {
      fillColor: [122, 64, 105], // Wine/Plum matching iCapital template
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      halign: "center",
      valign: "middle",
    },
    alternateRowStyles: {
      fillColor: [250, 248, 250],
    },
    columnStyles: {
      0: { cellWidth: 100, halign: "left" },  // Strategic Objective
      1: { cellWidth: 140, halign: "left" },  // KPI Name
      2: { cellWidth: 95, halign: "left" },   // Unit
      3: { cellWidth: 54, halign: "right" },  // Annual Target
      4: { cellWidth: 62, halign: "right" },  // Monthly Target
      5: { cellWidth: 62, halign: "right" },  // Prev Dev
      6: { cellWidth: 58, halign: "right" },  // Actual
      7: { cellWidth: 62, halign: "right" },  // Adj Ach
      8: { cellWidth: 62, halign: "right" },  // Closing Dev
      9: { cellWidth: 70, halign: "right", fontStyle: "bold" }, // Ach %
    },
    didParseCell: (dataCell) => {
      // Highlight Achievement % column based on performance
      if (dataCell.section === "body" && dataCell.column.index === 9) {
        const rawText = String(dataCell.cell.raw || "");
        const val = parseFloat(rawText.replace("%", "").replace(/,/g, ""));
        if (!isNaN(val)) {
          if (val >= 100) {
            dataCell.cell.styles.textColor = [16, 149, 93]; // Emerald Green
          } else if (val >= 80) {
            dataCell.cell.styles.textColor = [37, 99, 235]; // Blue
          } else {
            dataCell.cell.styles.textColor = [220, 38, 38]; // Red
          }
        }
      }
      // Highlight Closing Deviation column
      if (dataCell.section === "body" && dataCell.column.index === 8) {
        const rawText = String(dataCell.cell.raw || "");
        if (rawText.startsWith("-")) {
          dataCell.cell.styles.textColor = [220, 38, 38]; // Red
        } else if (rawText.startsWith("+")) {
          dataCell.cell.styles.textColor = [16, 149, 93]; // Green
        }
      }
    },
  });

  // Calculate final page count and draw header/footer on all pages
  const totalPages = (doc.internal as any).getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Bottom Footnotes on the last page
    if (i === totalPages) {
      const lastTable = (doc as any).lastAutoTable;
      const finalY = lastTable ? lastTable.finalY + 12 : pageHeight - 60;
      if (finalY < pageHeight - 35) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(
          "* Additive Measures: Adjusted achievement = Current actual + previous period closing deviation   |   Closing deviation = Adjusted achievement - current period target.",
          36,
          finalY,
        );
        doc.text(
          "* Rate/Percentage Measures: Evaluated purely on current period actual (Prev. Deviation = 0, Monthly target held constant at target, Achievement floored at 0%).",
          36,
          finalY + 9,
        );
      }
    }

    // Bottom Branding Footer
    doc.setDrawColor(226, 232, 240);
    doc.line(36, pageHeight - 30, pageWidth - 36, pageHeight - 30);

    // Left: The iCapital Africa Group
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(122, 64, 105);
    doc.text("The iCapital Africa Group", 36, pageHeight - 16);

    // Center: Confidential Executive Report
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("CONFIDENTIAL · CEO DIRECT-REPORTS EXECUTIVE MONTHLY REPORT", pageWidth / 2, pageHeight - 16, {
      align: "center",
    });

    // Right: Page number
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - 36, pageHeight - 16, {
      align: "right",
    });
  }

  // File download name
  const safeMonth = data.calendarMonth.replace(/\s+/g, "_");
  const filename = `CEO_Direct_Reports_Monthly_Report_${safeMonth}.pdf`;
  doc.save(filename);
}
