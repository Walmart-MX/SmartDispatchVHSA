/**
 * processors/ruteo-status.js
 * Reemplazo de las macros `ArbeyJr` + `POST_PROCESO_UNIFICADO_FINAL`
 * (MACRO DESPACHO V2.xlsm). Convierte la hoja CRUDA "RUTEO NUEVO " del
 * libro ESTATUS RUTAS (formato de dos niveles: una fila-encabezado por
 * ruta + filas de entrega) en la tabla plana "RUTEO NUEVO" que ya
 * consume el resto de la app (mismas columnas y tipos que producía la
 * macro). Validado fila por fila contra un resultado real de la macro
 * (ver docs/MACROS_REEMPLAZADAS.md).
 *
 * Es PURO: recibe la matriz de la hoja (array de arrays, `raw:true`,
 * horas como fracción de día) — quien lee el libro es excel.js.
 *
 * REGLAS (extraídas del VBA, no supuestas):
 *   - Datos de RUTA (cortina, unidad, setéo, horas, T.E/T.R, TIF/FITO)
 *     viven SOLO en la fila-encabezado y se repiten en cada entrega.
 *   - Entrega = fila con DETTE numérico y CAJAS que empieza con número
 *     (las filas "ENTREGA A TIENDA", separadores y marcas sueltas se
 *     descartan). CAJAS con texto ("3T" = 3 tarimas movidas por sistema,
 *     ej. ruta 6307/4914 del 22-10) se CONSERVA tal cual — el equipo
 *     necesita verlo así (la macro lo convertía en 3 con Val()).
 *   - TRACTOR = valor de la columna RUTA en la fila SIGUIENTE al
 *     encabezado; si está vacío, se usa la UNIDAD.
 *   - Horas (LLEGADA/SOLICITUD/FORMADO/ENRAMPE/RETIRO/CASETA):
 *     fecha = FECHA − (hora > 0.91666 ? 1 : 0) + hora  (una hora pasada
 *     de las 22:00 pertenece al día anterior). Vacío → FECHA 00:00,
 *     igual que la macro.
 *   - SETEO: "3°C" según TIF/FITO → TIF|TIF/FITO=REFRI,
 *     FITO|N/A|DIC=FRUTA, otro=REVISAR; "-22°C" = CONGE.
 *   - ENT1: ENT1, 2, 3… por ruta; el último numérico lleva "U".
 *
 * DIFERENCIA INTENCIONAL con la macro: la macro rellenaba cualquier
 * celda vacía con la de arriba (podía copiar el T.E de OTRA ruta). Aquí
 * una celda vacía se queda vacía.
 *
 * Marca `_HUB_MARCA` ("DESCO MERIDA", "DESCO TUXTLA", "FRIALSA") en las
 * filas de rutas que descargan en un HUB — la usa processors/desco.js
 * (paso que antes era manual). La marca puede venir en la columna RUTA o
 * en la columna DETTE (ruta 6108 del 22-10: "FRIALSA" en DETTE).
 */
import { stripAccents } from '../utils/format.js';
import { operativeDateTime } from '../utils/date.js';

const norm = h => String(h ?? '').toUpperCase().replace(/[.\s]/g, '');
const has  = v => v !== '' && v !== null && v !== undefined;
const isNum = v => typeof v === 'number' && isFinite(v);
/** CAJAS de una entrega: número, o texto que empieza con número ("3T"). */
const isCajas = v => isNum(v) || /^\d/.test(String(v ?? '').trim());

/** Encabezados mínimos para reconocer el formato crudo (vs. el ya procesado por la macro). */
const DETECT = ['CORTINA', 'LLEGA', 'CONGE/REFRI', 'RUTA', 'DETTE', 'CAJAS', 'SETEO', 'SOLICITUD', 'ENRAMPE', 'RETIRO'];

/** ¿Esta fila de encabezado es la hoja cruda de ESTATUS RUTAS? */
export function isRuteoStatusHeader(headerRow) {
  const set = new Set((headerRow || []).map(norm));
  return DETECT.every(h => set.has(norm(h)));
}

/**
 * FECHA operativa: la trae el nombre del archivo ("RUTEO 20-10-2026.xlsx")
 * y si no, hoy. La macro usaba TODAY() a ciegas.
 * @returns {{date: Date, fromName: boolean}}
 */
export function resolveFecha(fileName, now = new Date()) {
  const m = String(fileName || '').match(/(\d{1,2})[-_.\/](\d{1,2})[-_.\/](\d{4})/);
  if (m) {
    const [dd, mm, yyyy] = [+m[1], +m[2], +m[3]];
    const d = new Date(yyyy, mm - 1, dd);
    if (d.getFullYear() === yyyy && d.getMonth() === mm - 1 && d.getDate() === dd) return { date: d, fromName: true };
  }
  return { date: new Date(now.getFullYear(), now.getMonth(), now.getDate()), fromName: false };
}

/** Hora (fracción de día) → Date ajustado por cruce de medianoche (regla en utils/date.js). */
function adjustedTime(fecha, v) {
  return operativeDateTime(fecha, isNum(v) ? v : 0);
}

function mapSeteo(seteo, tifFito) {
  const s = String(seteo ?? '').trim();
  if (s === '-22°C') return 'CONGE';
  if (s !== '3°C') return seteo;
  switch (String(tifFito ?? '').trim().toUpperCase()) {
    case 'TIF': case 'TIF/FITO': return 'REFRI';
    case 'FITO': case 'N/A': case 'DIC': return 'FRUTA';
    default: return 'REVISAR';
  }
}

/**
 * Marca de HUB en una celda ("DESCO MÉRIDA" → "DESCO MERIDA",
 * "FRIALSA" → "FRIALSA"); null si la celda no es una marca.
 * @private
 */
function hubMarker(v) {
  const s = stripAccents(String(v ?? '')).trim().toUpperCase().replace(/\s+/g, ' ');
  return /^DESCO\s+\S/.test(s) || s === 'FRIALSA' ? s : null;
}

/** Agrupa las filas en rutas: [{ head, next, body, hub }]. @private */
function groupRoutes(grid, headerIdx, c) {
  const isHeader = r => has(r[c.CORTINA]) || (isNum(r[c.RUTA]) && String(r[c.RUTA]).length === 4 && has(r[c['CONGE/REFRI']]));
  const groups = [];
  let cur = null;
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const r = grid[i];
    if (isHeader(r)) groups.push(cur = { head: r, next: grid[i + 1], body: [], hub: null });
    if (!cur) continue;
    cur.body.push(r);
    cur.hub ||= hubMarker(r[c.RUTA]) || hubMarker(r[c.DETTE]);
  }
  return groups;
}

/**
 * @param {Array<Array>} grid   matriz de la hoja (incluye encabezado)
 * @param {{fecha: Date}} opts
 * @returns {{rows: Array<object>, rutas: number}}
 * @throws {Error} si el encabezado no es el formato crudo
 */
export function flattenRuteoStatus(grid, { fecha }) {
  const headerIdx = grid.findIndex(isRuteoStatusHeader);
  if (headerIdx < 0) throw new Error('La hoja no tiene el formato de ESTATUS RUTAS (CORTINA / LLEGA / CONGE-REFRI / RUTA / DETTE…).');
  const c = {};
  grid[headerIdx].forEach((h, i) => { const k = norm(h); if (k && !(k in c)) c[k] = i; });
  const col = k => c[norm(k)];
  const C = { CORTINA: col('CORTINA'), RUTA: col('RUTA'), DETTE: col('DETTE'), 'CONGE/REFRI': col('CONGE/REFRI') };

  const fechaDMY = { dd: fecha.getDate(), mm: fecha.getMonth() + 1, yyyy: fecha.getFullYear() };
  const out = [];
  const groups = groupRoutes(grid, headerIdx, C);

  for (const g of groups) {
    const h = g.head;
    const tractorRaw = g.next && !has(g.next[C.CORTINA]) ? g.next[C.RUTA] : '';
    const unidad  = h[col('UNIDAD')];
    const tifFito = h[col('TIF/FITO')];
    const base = {
      RUTA: h[C.RUTA],
      SETEO: mapSeteo(h[col('SETEO')], tifFito),
      TRACTOR: has(tractorRaw) ? tractorRaw : unidad,
      UNIDAD: unidad,
      CORTINA: h[C.CORTINA],
      LLEGADA: adjustedTime(fecha, h[col('LLEGA')]),
      'T.E': h[col('T.E.')],
      'T.R': h[col('T.R.')],
      SOLICITUD: adjustedTime(fecha, h[col('SOLICITUD')]),
      FORMADO: adjustedTime(fecha, h[col('FORMADO')]),
      ENRAMPE: adjustedTime(fecha, h[col('ENRAMPE')]),
      RETIRO: adjustedTime(fecha, h[col('RETIRO')]),
      CASETA: adjustedTime(fecha, h[col('CASETA')]),
      'TIF/FITO': tifFito
    };
    const entregas = g.body.filter(r => isNum(r[col('DETTE')]) && isCajas(r[col('CAJAS')]));
    entregas.forEach((r, i) => {
      const last = i === entregas.length - 1;
      const n = i + 1;
      out.push({
        FECHA: new Date(fecha), DETTE: r[col('DETTE')], CAJAS: r[col('CAJAS')],
        ENT1: n === 1 ? 'ENT1' : (last ? `${n}U` : n),
        ...base, _FECHA_DMY: { ...fechaDMY }, ...(g.hub ? { _HUB_MARCA: g.hub } : {})
      });
    });
  }
  return { rows: out, rutas: groups.length };
}
