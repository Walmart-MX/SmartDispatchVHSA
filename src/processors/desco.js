/**
 * processors/desco.js
 * Automatiza el paso que antes se hacía A MANO sobre el RUTEO: en las
 * rutas que descargan en un HUB ("DESCO MÉRIDA", "DESCO TUXTLA",
 * "FRIALSA") el plan del Excel lista las TIENDAS finales, pero el
 * camión físicamente solo va al HUB (y a las tiendas que sí entrega
 * directo). El operador reescribía a mano esas filas para que
 * coincidieran con el PDF.
 *
 * REGLA (validada contra 9 rutas reales — 7 DESCO + 2 FRIALSA — de un
 * RUTEO ya corregido a mano; ver docs/MACROS_REEMPLAZADAS.md):
 *   Para una ruta marcada como HUB (`_HUB_MARCA`, la pone
 *   ruteo-status.js) cuyo PDF ya está cargado:
 *     1. Filas de Excel cuyo DETTE SÍ está en el PDF → se quedan.
 *     2. La PRIMERA fila de Excel que no está en el PDF toma el DETTE
 *        del HUB del PDF (destino del PDF que el Excel no trae),
 *        conservando su posición.
 *     3. Las demás filas de Excel que no están en el PDF se descartan, y
 *        sus CAJAS se SUMAN a las del HUB (decisión del equipo, oct-2026:
 *        el HUB recibe físicamente todo lo que se desconsolida, así que el
 *        total de cajas de la ruta se conserva). Si hubiera más de un HUB,
 *        las descartadas se suman al primero; los demás conservan las suyas.
 *     4. ENT1 se renumera (ENT1, 2, 3…, última con "U").
 *   Sin PDF de la ruta, o sin marca, o sin diferencias → no hace nada.
 *
 * El PDF es la verdad física (qué se cargó y a dónde va), por eso guía
 * la regla — no hay tabla plaza→HUB que mantener.
 *
 * PURO e IDEMPOTENTE: no muta `xlsRows`; devuelve la MISMA referencia
 * si no hay nada que ajustar. Se invoca desde Events.triggerMerge()
 * sobre State.xlsSource, de modo que cambiar los PDFs después siempre
 * parte del Excel original.
 *
 * Dependencias: COL_RUTA, COL_DETTE_E (core/constants.js)
 */
import { COL_RUTA, COL_DETTE_E } from '../core/constants.js';

const str = v => String(v ?? '').trim();
const asDetteType = d => (/^\d+$/.test(d) ? Number(d) : d);
const cajas = r => Number(r.CAJAS) || 0;

/** Destinos del PDF por ruta, en orden de aparición: Map<ruta, string[]>. @private */
function pdfDestinosByRuta(pdfData) {
  const byRuta = new Map();
  for (const r of new Set(pdfData.values())) {
    const ruta = str(r.ruta), dest = str(r.destino);
    if (!ruta || !dest) continue;
    if (!byRuta.has(ruta)) byRuta.set(ruta, []);
    const list = byRuta.get(ruta);
    if (!list.includes(dest)) list.push(dest);
  }
  return byRuta;
}

/** Renumera ENT1 de una ruta: ENT1, 2, 3…; la última numérica lleva "U". @private */
function renumberEnt(rows) {
  return rows.map((row, i) => ({
    ...row,
    ENT1: i === 0 ? 'ENT1' : (i === rows.length - 1 ? `${i + 1}U` : i + 1)
  }));
}

/**
 * @param {Array<object>} xlsRows  filas de RUTEO NUEVO (State.xlsSource)
 * @param {Map<string,object>} pdfData  State.pdfData
 * @returns {{
 *   rows: Array<object>,
 *   adjusted: Array<{ruta:string, hub:string[], reemplazadas:string[], descartadas:string[]}>
 * }}
 */
export function applyDesco(xlsRows, pdfData) {
  const none = { rows: xlsRows, adjusted: [] };
  if (!xlsRows?.length || !pdfData?.size) return none;
  if (!xlsRows.some(r => r._HUB_MARCA)) return none;

  const pdfDest = pdfDestinosByRuta(pdfData);
  const result = [];
  const adjusted = [];
  let i = 0;

  while (i < xlsRows.length) {
    const ruta = str(xlsRows[i][COL_RUTA]);
    let j = i;
    while (j < xlsRows.length && str(xlsRows[j][COL_RUTA]) === ruta) j++;
    const group = xlsRows.slice(i, j);
    i = j;

    const pdfList = pdfDest.get(ruta);
    if (!group.some(r => r._HUB_MARCA) || !pdfList) { result.push(...group); continue; }

    const pdfSet   = new Set(pdfList);
    const xlsSet   = new Set(group.map(r => str(r[COL_DETTE_E])));
    const hubs     = pdfList.filter(d => !xlsSet.has(d));            // destinos del PDF que el Excel no trae
    const sobran   = group.filter(r => !pdfSet.has(str(r[COL_DETTE_E])));
    if (!hubs.length || !sobran.length) { result.push(...group); continue; }

    const replaced   = new Map(sobran.slice(0, hubs.length).map((r, k) => [r, hubs[k]]));
    const descartadas = sobran.slice(hubs.length);
    const cajasExtra  = descartadas.reduce((sum, r) => sum + cajas(r), 0);   // se suman al primer HUB
    const kept = [];
    for (const r of group) {
      if (replaced.has(r)) {
        const hub = { ...r, [COL_DETTE_E]: asDetteType(replaced.get(r)), _HUB_APLICADO: true };
        if (r === sobran[0] && cajasExtra) hub.CAJAS = cajas(r) + cajasExtra;
        kept.push(hub);
      } else if (pdfSet.has(str(r[COL_DETTE_E]))) kept.push(r);
    }
    result.push(...renumberEnt(kept));
    adjusted.push({
      ruta, hub: hubs,
      reemplazadas: [...replaced.keys()].map(r => str(r[COL_DETTE_E])),
      descartadas: descartadas.map(r => str(r[COL_DETTE_E]))
    });
  }
  return adjusted.length ? { rows: result, adjusted } : none;
}
