/**
 * processors/despacho.js
 * Status de despacho → Map<ruta, {hrDesp, caseta, wtms, idIda}> (lo consume merge.js).
 *
 * Dos entradas, UNA sola lógica (parseStatusGrid):
 *   1. Archivo del STATUS mensual (.xlsm/.xlsx) — lo principal. Una hoja por
 *      día `dd-mm-aaaa`; se toma la del día operativo del ruteo.
 *   2. Texto pegado desde Excel — opción manual.
 *
 * Columnas FIJAS por posición (DESP_COLS, core/constants.js). Si el pegado
 * empieza en otra columna se recorre todo desde RUTA. Si la plantilla no
 * cuadra (p.ej. se pegaron columnas sueltas) se cae a nombre EXACTO y se avisa.
 *
 * Horas: H. DESP mezcla horas sueltas (02:33) con fecha+hora. Las sueltas se
 * ubican en el día operativo con la regla del ruteo (pasadas las 22:00 = día
 * anterior). Los seriales se convierten en hora LOCAL (sin el desfase UTC).
 *
 * Dependencias: XLSX (global, vendor) solo en readStatusBook/statusSheetGrid.
 */
import { DESP_COLS } from '../core/constants.js';
import { operativeDateTime, excelSerialToLocal, fmtDMYHM, normDateTime } from '../utils/date.js';
import { stripAccents } from '../utils/format.js';

const DAY_SHEET_RE  = /^(\d{2})-(\d{2})-(\d{4})$/;
const HEADER_SEARCH = 15;   // el encabezado vive en la fila 5; margen por si pegan desde más abajo
const PREVIEW_ROWS  = 5;
const SERIAL_1901   = 367;  // serial < 367 = fecha de 1900: error de captura (22-10, ruta 6110: "04/01/1900 11:45")

const normHeader = v => stripAccents(String(v ?? '')).toUpperCase().replace(/\s+/g, ' ').trim();
const sameDay    = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Índice 0-based → letra de columna de Excel (0 → A, 31 → AF). */
export function colLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

/** Hojas de día del libro, en orden cronológico: [{ name, date }]. */
export function listDaySheets(sheetNames) {
  return sheetNames
    .map(name => {
      const m = name.trim().match(DAY_SHEET_RE);
      if (!m) return null;
      const date = new Date(+m[3], +m[2] - 1, +m[1]);
      return date.getDate() === +m[1] ? { name, date } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);
}

/** Hoja del día operativo `fecha`, o null. */
export function sheetForDate(daySheets, fecha) {
  return (fecha && daySheets.find(s => sameDay(s.date, fecha))) || null;
}

/** Ubica las columnas: plantilla fija primero, nombre exacto como respaldo. */
function locateColumns(header) {
  const offset   = header.findIndex(c => normHeader(c) === 'RUTA') - DESP_COLS.ruta.col;
  const fixed    = {};
  const warnings = [];
  for (const [field, def] of Object.entries(DESP_COLS)) {
    const i = def.col + offset;
    if (i >= 0 && def.header.test(normHeader(header[i]))) fixed[field] = i;
    else warnings.push(`${colLetter(Math.max(i, 0))} dice "${String(header[i] ?? '').trim()}" (esperaba ${def.label})`);
  }
  if (!warnings.length) return { idx: fixed, how: 'columnas fijas', warnings };

  // Respaldo: nombre EXACTO (nunca "contiene"). SALIDA: gana la última (la de caseta va después de la programada).
  const byName = {};
  header.forEach((c, i) => {
    const h = normHeader(c);
    if (!h) return;
    for (const [field, def] of Object.entries(DESP_COLS)) {
      if (def.header.test(h) && (field === 'caseta' || byName[field] === undefined)) byName[field] = i;
    }
  });
  return { idx: byName, how: 'por encabezado (la plantilla no cuadra)', warnings };
}

/**
 * Celda de fecha/hora → "DD/MM/YYYY HH:MM"; las horas sueltas caen en el día operativo `fecha`.
 * Una fecha de 1900 se trata como hora suelta y se reporta vía `onOdd`.
 */
function cellDateTime(v, fecha, onOdd) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (v >= SERIAL_1901) return fmtDMYHM(excelSerialToLocal(v));
    if (v >= 1) onOdd();
    return fmtDMYHM(operativeDateTime(fecha, v));
  }
  const s   = String(v).trim();
  const old = s.match(/^\d{1,2}\/\d{1,2}\/(?:1899|1900)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/);
  if (old) onOdd();
  const t = (old ? old[1] : s).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (t) return fmtDMYHM(operativeDateTime(fecha, (+t[1] * 3600 + +t[2] * 60 + +(t[3] || 0)) / 86400));
  return normDateTime(s);
}

const cellText = v => (typeof v === 'number' ? String(Math.trunc(v)) : String(v ?? '').trim());

/**
 * Grid (filas × celdas, desde la columna A) → datos de despacho por ruta.
 * @param {Array<Array>} grid
 * @param {{fecha: Date|null}} opts — día operativo para las horas sueltas (sin ruteo: hoy)
 * @returns {{data: Map<string,object>, preview: object[], idx: object, how: string, warnings: string[]}}
 */
export function parseStatusGrid(grid, { fecha = null } = {}) {
  const day    = fecha || new Date();
  const hdrRow = grid.slice(0, HEADER_SEARCH).findIndex(r => (r || []).some(c => normHeader(c) === 'RUTA'));
  if (hdrRow < 0) throw new Error('No encontré la fila de encabezado (RUTA, H. DESP, ID MASTER…). Copia incluyendo el encabezado.');

  const { idx, how, warnings } = locateColumns(grid[hdrRow]);
  const at   = (r, field) => (idx[field] === undefined ? '' : r[idx[field]]);
  const data = new Map();
  const preview = [];

  for (const r of grid.slice(hdrRow + 1)) {
    const ruta = cellText(at(r || [], 'ruta'));
    if (!/^\d/.test(ruta)) continue;   // vacías, notas, totales
    const odd = label => () => warnings.push(`${ruta}: ${label} con fecha de 1900, se tomó solo la hora`);
    const row = {
      hrDesp: cellDateTime(at(r, 'hrDesp'), day, odd('H. DESP')),
      caseta: cellDateTime(at(r, 'caseta'), day, odd('SALIDA')),
      wtms:   cellText(at(r, 'wtms')),
      idIda:  cellText(at(r, 'idIda'))
    };
    data.set(ruta, row);
    if (preview.length < PREVIEW_ROWS) preview.push({ ruta, ...row });
  }
  if (!data.size) throw new Error('El encabezado está, pero no hay filas con RUTA debajo.');
  return { data, preview, idx, how, warnings };
}

/** Texto pegado (tab / ; / ,) → parseStatusGrid. */
export function processPaste(raw, { fecha = null } = {}) {
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('Se necesita encabezado + datos');
  const sep = raw.includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  return parseStatusGrid(lines.map(l => l.split(sep)), { fecha });
}

/** Lee el libro completo (una vez; cambiar de día no vuelve a leer el archivo). */
export async function readStatusBook(file) {
  return XLSX.read(await file.arrayBuffer(), { type: 'array' });
}

/** Grid de una hoja, alineado a la columna A (aunque el rango de la hoja empiece después). */
export function statusSheetGrid(book, sheetName) {
  const ws = book.Sheets[sheetName];
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  range.s.c = 0;
  range.s.r = 0;
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', range });
}
