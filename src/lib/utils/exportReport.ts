/**
 * Report Export Utilities
 * Functions for exporting reports to CSV and JSON formats
 */

export type ExportFormat = "csv" | "json";

function flattenRecord(
  record: Record<string, unknown>,
  prefix = "",
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [key, value] of Object.entries(record)) {
    if (key === "__typename") continue;
    const colKey = prefix ? `${prefix}_${key}` : key;
    if (value == null || typeof value !== "object") {
      out[colKey] = value;
    } else if (Array.isArray(value)) {
      out[colKey] =
        value.length === 0
          ? ""
          : value
              .map((item) =>
                item && typeof item === "object"
                  ? JSON.stringify(item)
                  : String(item ?? ""),
              )
              .join("; ");
    } else {
      flattenRecord(value as Record<string, unknown>, colKey, out);
    }
  }
  return out;
}

function normalizeExportRows(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) {
    return data
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
      .map((item) => flattenRecord(item));
  }
  if (!data || typeof data !== "object") return [];

  const obj = data as Record<string, unknown>;
  const nestedData =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : null;

  const candidateArrays = [
    obj.kpis,
    obj.results,
    obj.rows,
    obj.items,
    obj.employeesByDept,
    obj.employeesByDiv,
    obj.topKPIs,
    nestedData?.results,
    nestedData?.kpis,
    nestedData?.rows,
  ];
  for (const candidate of candidateArrays) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate
        .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
        .map((item) => flattenRecord(item));
    }
  }

  return [flattenRecord(obj)];
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data: Array<Record<string, unknown>>): string {
  if (!data || data.length === 0) return "";

  const headerSet = new Set<string>();
  for (const row of data) {
    for (const key of Object.keys(row)) {
      headerSet.add(key);
    }
  }
  const headers = Array.from(headerSet);
  const csvRows = [];

  // Add header row
  csvRows.push(headers.map(escapeCSVValue).join(","));

  // Add data rows
  for (const row of data) {
    const values = headers.map((header) => escapeCSVValue(row[header]));
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

function escapeCSVValue(value: unknown): string {
  const raw =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const safe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');
  return /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
}

/**
 * Download a file with given content
 */
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Export report data to CSV
 */
export function exportToCSV(data: unknown, filename: string) {
  const rows = normalizeExportRows(data);
  if (rows.length === 0) {
    throw new Error("No data available to export");
  }
  const csvContent = `\uFEFF${convertToCSV(rows)}`;
  const timestamp = new Date().toISOString().split("T")[0];
  const fullFilename = `${filename}_${timestamp}.csv`;

  downloadFile(csvContent, fullFilename, "text/csv;charset=utf-8;");
}

/**
 * Export report data to JSON
 */
export function exportToJSON(data: unknown, filename: string) {
  const jsonContent = JSON.stringify(data, null, 2);
  const timestamp = new Date().toISOString().split("T")[0];
  const fullFilename = `${filename}_${timestamp}.json`;

  downloadFile(jsonContent, fullFilename, "application/json;charset=utf-8;");
}

/**
 * Export report with metadata
 */
export function exportReport(
  data: unknown,
  reportName: string,
  format: ExportFormat = "csv",
  metadata?: Record<string, unknown>,
) {
  const reportData = {
    reportName,
    generatedAt: new Date().toISOString(),
    ...metadata,
    data,
  };

  if (format === "csv") {
    exportToCSV(data, reportName);
  } else {
    // For JSON, export everything including metadata
    exportToJSON(reportData, reportName);
  }
}

/**
 * Format number for display
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

/**
 * Format percentage for display
 */
export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
