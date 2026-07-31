const encodeCell = (value: unknown): string => {
  const str = value == null ? '' : String(value);
  // Wrap in quotes and escape any internal quotes
  return `"${str.replace(/"/g, '""')}"`;
};

/**
 * Downloads data as a UTF-8 CSV file with BOM so Excel opens it correctly.
 * @param headers - Column headers for the first row
 * @param rows    - Data rows (each row is an array of values in the same order as headers)
 * @param filename - Filename without the .csv extension
 */
export const downloadCsv = (
  headers: string[],
  rows: unknown[][],
  filename: string,
): void => {
  const lines = [headers, ...rows].map(row => row.map(encodeCell).join(';'));
  // ﻿ = UTF-8 BOM — Excel uses this to auto-detect the encoding
  const content = '﻿' + lines.join('\r\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};
