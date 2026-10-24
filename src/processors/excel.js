/**
 * processors/excel.js
 * Lectura del Excel macro: hoja RUTEO NUEVO (rutas del día) y hoja
 * CONCENTRADO FACTURAS (datos de facturación).
 *
 * NUEVO (oct-2026 — se eliminan las macros): processXLS() reconoce DOS
 * formatos por el encabezado de la hoja de rutas, y el MODO elegido por el
 * operador (features/source-mode.js) decide cuál acepta:
 *   a) CRUDO (modo sin macro) — la hoja "RUTEO NUEVO " del libro ESTATUS
 *      RUTAS tal cual (CORTINA / LLEGA / CONGE-REFRI / RUTA / DETTE…). Se
 *      aplana con processors/ruteo-status.js (lo que hacían ArbeyJr +
 *      POST_PROCESO). NO trae facturas: devuelve `factData: null` (el GLS
 *      sale del Reporte de Facturación y la hora queda en blanco).
 *   b) YA PROCESADO por la macro (modo macro) — RUTEO NUEVO + CONCENTRADO
 *      FACTURAS; flujo anterior, sin cambios.
 * Sin `mode` (scripts de validación) detecta el formato solo.
 *
 * CAMBIO (sep-2026 — concentrado de facturas OBLIGATORIO):
 *   Antes, si el Excel no traía la hoja CONCENTRADO FACTURAS (o la hoja
 *   no tenía una columna de invoice reconocible, o venía vacía),
 *   processXLS() lo aceptaba igual y solo dejaba una etiqueta de estado
 *   ("sin hoja CONCENTRADO FACTURAS"). Ahora los tres casos lanzan un
 *   Error explícito. Los throws ocurren ANTES de que
 *   events.js → handleXLS() asigne State.xlsData/State.factData, así que
 *   un intento fallido NUNCA pisa un Excel válido cargado antes (importa
 *   para el modo "Reemplazar fuentes" de Preparación).
 *
 * AJUSTE (jul-2026 — FECHA del archivo final, CUARTO intento, causa
 * raíz confirmada con diagnóstico en consola):
 *   La celda FECHA de RUTEO NUEVO es tipo `d` en SheetJS (no `n` como
 *   se asumía en los intentos anteriores) — SheetJS ya entrega
 *   `cell.v` como un objeto Date genuino, en hora LOCAL, con un margen
 *   de unos segundos respecto a medianoche exacta (confirmado:
 *   "Thu Jul 30 2026 00:00:04" en vez de "00:00:00" — imprecisión del
 *   número serial de Excel al convertirse a Date). El texto formateado
 *   `cell.w` (ej. "7/30/26") está en orden MES/DÍA — por eso los
 *   intentos que confiaban en ese texto asumiendo día/mes producían
 *   fechas en el futuro lejano cuando el día era mayor a 12.
 *
 *   SOLUCIÓN: cuando `cell.v` ya es un objeto Date, se desplaza el
 *   instante +12 horas antes de leer año/mes/día con getters LOCALES.
 *   El margen de imprecisión es de solo segundos (nunca cerca de 12
 *   horas), así que sin importar si el margen cae antes o después de
 *   medianoche, el desplazamiento garantiza aterrizar a media tarde
 *   del día CORRECTO — nunca se cruza al día anterior ni al siguiente.
 *   No se usa el texto `.w` para nada en este caso (evita el problema
 *   de orden mes/día por completo).
 *
 *   Se conserva el camino por número de serie puro (`cell.t === 'n'`,
 *   vía `XLSX.SSF.parse_date_code`) para archivos donde la celda sí
 *   venga como serial numérico en vez de tipo `d`, y el texto `.w`
 *   como último respaldo si la celda no es ninguna de las anteriores
 *   (ej. capturada como texto puro). `row['FECHA']` (el Date que sigue
 *   usando fiscal-calendar.js/merge.js para SW/DIA) no se toca.
 *
 * Dependencias:
 *   - XLSX (SheetJS, cargado globalmente desde el CDN en index.html)
 *   - SHEET_RUTEO, SHEET_FACTURAS (core/constants.js) — nombres alternativos
 *     de hoja que se buscan por coincidencia parcial, insensible a mayúsculas
 *   - formatFactDate (utils/format.js) — normaliza el valor de la celda de
 *     fecha de facturación (puede venir como Date, número serial o string)
 */
import { SHEET_RUTEO, SHEET_FACTURAS, MODE_MACRO, MODE_SIN_MACRO } from '../core/constants.js';
import { formatFactDate } from '../utils/format.js';
import { isRuteoStatusHeader, flattenRuteoStatus, resolveFecha } from './ruteo-status.js';
import { gridFromA1 } from '../utils/sheet.js';

/**
 * Formato CRUDO de ESTATUS RUTAS → filas planas. Se relee el libro SIN
 * `cellDates` a propósito: las horas deben llegar como fracción de día
 * (la regla de cruce de medianoche trabaja sobre ese número) y así se
 * evita el ruido de zona horaria de SheetJS en fechas.
 * @private
 */
function readStatusWorkbook(buf, sheetName, fileName) {
  const wb   = XLSX.read(buf, { type: 'array' });
  const grid = gridFromA1(wb.Sheets[sheetName]);   // columnas FIJAS: el índice 0 tiene que ser la A
  const { date, fromName } = resolveFecha(fileName);
  const { rows, warnings } = flattenRuteoStatus(grid, { fecha: date });
  if (!rows.length) {
    throw new Error('El ESTATUS RUTAS no trae entregas (filas con DETTE y CAJAS) — verifica el archivo.');
  }
  // Título cambiado = se usó la columna por posición igual; solo se avisa.
  if (warnings.length) console.warn('[Ruteo] títulos distintos (se leyeron por posición):', warnings);
  const aviso = warnings.length ? ` · \u26A0 título distinto en ${warnings.map(w => w.split(' ')[0]).join(', ')} (leído por posición)` : '';
  const p = n => String(n).padStart(2, '0');
  const fechaTxt = `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}${fromName ? '' : ' (hoy)'}`;
  return { rows, factData: null, ruteoName: sheetName, factSheetLabel: `ESTATUS RUTAS · ${fechaTxt}${aviso}` };
}

/**
 * Lee el archivo Excel y extrae:
 *   - rows: array de rows de la hoja RUTEO NUEVO (o la primera hoja si no
 *     se encuentra un nombre coincidente)
 *   - factData: Map invoice# → { gls, horaFact }, leído de la hoja
 *     CONCENTRADO FACTURAS — OBLIGATORIA, con una columna de invoice
 *     reconocible (INVOICE / FACTURA / FOLIO) y al menos una factura
 *
 * @param {File} file
 * @param {{mode?: 'macro'|'sinmacro'}} [opts]  modo del operador; sin él, autodetecta
 * @returns {Promise<{
 *   rows: Array<object>,
 *   factData: Map<string, {gls:string, horaFact:string}>|null,   // null = formato crudo (facturas van aparte)
 *   ruteoName: string,
 *   factSheetLabel: string
 * }>}
 * @throws {Error} si falta la hoja de facturas, no tiene columna de
 *   invoice reconocible, o no contiene ninguna factura (solo formato macro)
 */
export async function processXLS(file, { mode } = {}) {
  const buf = await file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array', cellDates: true });

  const ruteoName = wb.SheetNames.find(n =>
    SHEET_RUTEO.some(s => n.toUpperCase().includes(s.toUpperCase()))
  ) || wb.SheetNames[0];
  const wsRuteo = wb.Sheets[ruteoName];

  // Formato CRUDO de ESTATUS RUTAS (sin macro) — ver nota de cabecera. Cada
  // modo acepta SOLO su formato: subir el archivo equivocado se avisa aquí,
  // antes de asignar nada al State.
  const rawHeader = gridFromA1(wsRuteo)[0] || [];
  const isRaw = isRuteoStatusHeader(rawHeader);
  if (mode === MODE_SIN_MACRO && !isRaw) {
    throw new Error('Este archivo no es el ESTATUS RUTAS crudo (hoja RUTEO NUEVO con CORTINA / LLEGA / CONGE-REFRI…). Si es el Excel que ya pasó por la macro, cambia a Modo macro.');
  }
  if (mode === MODE_MACRO && isRaw) {
    throw new Error('Este archivo es el ESTATUS RUTAS crudo (sin macro). Cambia a Modo sin macro, o sube el Excel que ya pasó por la macro.');
  }
  if (isRaw) return readStatusWorkbook(buf, ruteoName, file.name);

  const raw     = XLSX.utils.sheet_to_json(wsRuteo, { defval: '' });

  // ── FECHA — ver nota de cabecera "AJUSTE (jul-2026 — FECHA del
  // archivo final, CUARTO intento)". Se ubica la columna FECHA en el
  // encabezado y se lee la celda cruda del worksheet directamente.
  const headerRow   = XLSX.utils.sheet_to_json(wsRuteo, { header: 1 })[0] || [];
  const fechaColIdx = headerRow.findIndex(h => String(h || '').trim().toUpperCase() === 'FECHA');

  if (fechaColIdx > -1) {
    for (let i = 0; i < raw.length; i++) {
      const addr = XLSX.utils.encode_cell({ r: i + 1, c: fechaColIdx });
      const cell = wsRuteo[addr];
      if (!cell) continue;

      if (cell.v instanceof Date) {
        // Caso confirmado con diagnóstico (tipo 'd' de SheetJS): cell.v
        // ya es un Date en hora LOCAL, con un margen de unos segundos
        // respecto a medianoche exacta. Se desplaza +12h para leer
        // año/mes/día de forma segura, sin cruzar al día equivocado —
        // ver nota de cabecera para el razonamiento completo. NUNCA se
        // usa cell.w aquí (viene en orden mes/día, no día/mes).
        const safe = new Date(cell.v.getTime() + 12 * 3600 * 1000);
        raw[i]['_FECHA_DMY'] = { dd: safe.getDate(), mm: safe.getMonth() + 1, yyyy: safe.getFullYear() };
      } else if (cell.t === 'n' && typeof cell.v === 'number') {
        // Respaldo — celda con serial numérico puro (sin tipo 'd').
        // MISMO problema de imprecisión de punto flotante que en la
        // rama 'd' de arriba: el serial casi nunca es un entero exacto
        // (ej. 46237.99995 en vez de 46238). XLSX.SSF.parse_date_code()
        // trunca la parte entera — sin redondear primero, un serial a
        // punto de cumplir el día siguiente se decodifica como el día
        // ANTERIOR completo (justo el bug de "un día antes" detectado).
        // Se redondea al entero más cercano ANTES de decodificar —
        // elimina el margen sin importar su dirección, igual que el
        // desplazamiento +12h de la rama 'd'.
        const dc = XLSX.SSF.parse_date_code(Math.round(cell.v));
        if (dc) raw[i]['_FECHA_DMY'] = { dd: dc.d, mm: dc.m, yyyy: dc.y };
      } else if (cell.w) {
        // Último respaldo — celda de texto puro (sin valor de fecha
        // real). Se guarda el texto tal cual para intentar parsearlo
        // en el export (ver features/export.js), mejor esfuerzo.
        raw[i]['_FECHA_TEXT'] = String(cell.w).trim();
      }
    }
  }

  // ── CONCENTRADO FACTURAS — OBLIGATORIO (sep-2026) ──
  // Ver nota de cabecera. Cualquier throw de aquí en adelante ocurre
  // antes de que el caller asigne State.xlsData/State.factData.
  const factName = wb.SheetNames.find(n =>
    SHEET_FACTURAS.some(s => n.toUpperCase().includes(s.toUpperCase()))
  );
  if (!factName) {
    throw new Error('El Excel no es el formato crudo de ESTATUS RUTAS (CORTINA / LLEGA / CONGE-REFRI…) ni trae la hoja CONCENTRADO FACTURAS — verifica el archivo.');
  }

  const wsFact  = wb.Sheets[factName];
  const rawFact = XLSX.utils.sheet_to_json(wsFact, { defval: '' });
  const keys    = Object.keys(rawFact[0] || {});
  const colInv  = keys.find(k => /INVOICE|FACTURA|FOLIO/i.test(k));
  const colLoad = keys.find(k => /LOAD|GLS/i.test(k));
  const colFin  = keys.find(k => /FINAL|HORA|FACTURACION|TS/i.test(k));
  if (!colInv) {
    throw new Error(`La hoja "${factName}" no tiene una columna INVOICE / FACTURA / FOLIO reconocible.`);
  }

  const newFactData = new Map();
  for (const r of rawFact) {
    const inv = String(r[colInv] || '').trim();
    if (!inv) continue;
    newFactData.set(inv, {
      gls:      colLoad ? String(r[colLoad] || '').trim() : '',
      horaFact: colFin  ? formatFactDate(r[colFin])        : ''
    });
  }
  if (!newFactData.size) {
    throw new Error(`La hoja "${factName}" no contiene facturas — el concentrado es obligatorio.`);
  }
  const factSheetLabel = `${newFactData.size} facturas (${factName})`;

  return { rows: raw, factData: newFactData, ruteoName, factSheetLabel };
}
