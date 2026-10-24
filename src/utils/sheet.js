/**
 * utils/sheet.js
 * Lectura de hojas con columnas FIJAS por posición (ruteo y Status):
 * el índice 0 del grid SIEMPRE es la columna A, aunque el rango usado de la
 * hoja empiece después (SheetJS arranca en el inicio de `!ref`).
 *
 * Dependencias: XLSX (global, vendor) solo en gridFromA1.
 */

/** Índice 0-based → letra de columna de Excel (0 → A, 31 → AF). */
export function colLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

/**
 * Hoja → grid (filas × celdas) alineado a A1. Valores crudos: las fechas/horas
 * llegan como serial de Excel (sin el ruido de zona horaria de `cellDates`).
 * @param {object} ws — hoja de SheetJS
 * @returns {Array<Array>}
 */
export function gridFromA1(ws) {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  range.s.c = 0;
  range.s.r = 0;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', range });
}
