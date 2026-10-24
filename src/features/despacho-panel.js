/**
 * features/despacho-panel.js
 * Tarjeta "Status de despacho" (Preparación): datos + DOM.
 *
 *   - Principal: subir el STATUS del mes (.xlsm). Se toma la hoja del día
 *     operativo del ruteo; si no hay ruteo o no existe esa hoja, el
 *     operador elige el día en el selector. Al cargar el ruteo después se
 *     vuelve a elegir sola (onRuteoLoaded).
 *   - Opción manual: pegar la hoja desde Excel.
 * Ambas entradas pasan por processors/despacho.js (columnas FIJAS) y dejan
 * State.despData igual que siempre; merge.js no cambia.
 *
 * Es el ÚNICO dueño de State.despData / State.statusBook y de esta tarjeta
 * (UI.resetAll no la toca: "Reiniciar las 4" llama además a reset()).
 * El re-cruce se inyecta en wire({onChange}) para no importar events.js
 * (events.js importa este módulo).
 */
import { State } from '../core/state.js';
import { UI } from '../ui/ui.js';
import {
  processPaste, parseStatusGrid, readStatusBook, statusSheetGrid, listDaySheets, sheetForDate
} from '../processors/despacho.js';

const IDLE_STATUS = 'Arrastra o haz clic';
const IDLE_SUB    = 'Sube el STATUS del mes (.xlsm): toma la hoja del día del ruteo';
const IDLE_FILE   = 'Arrastra aquí el STATUS del mes o haz clic';
const MAX_NOTES   = 3;

let _onChange = () => {};
const $ = id => document.getElementById(id);
const fmtDia = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Día operativo del ruteo cargado (los dos modos dejan _FECHA_DMY en cada fila), o null. */
function fechaRuteo() {
  const f = State.xlsData?.[0]?._FECHA_DMY;
  return f ? new Date(f.yyyy, f.mm - 1, f.dd) : null;
}

function renderSheets(days, selected) {
  const sel = $('despSheet');
  sel.innerHTML = (selected ? '' : '<option value="">Elige el día…</option>') +
    [...days].reverse().map(d => `<option value="${d.name}"${d.name === selected ? ' selected' : ''}>${d.name}</option>`).join('');
  $('despSheetRow').hidden = !days.length;
}

export const DespachoPanel = {
  /** Cablea la tarjeta. `onChange` = re-cruce (Events.triggerMerge). */
  wire({ onChange }) {
    _onChange = onChange;
    $('btnParse').addEventListener('click', () => DespachoPanel.handlePaste());
    $('btnPasteClear').addEventListener('click', () => DespachoPanel.clear());
    $('despSheet').addEventListener('change', e => e.target.value && DespachoPanel.applySheet(e.target.value));
  },

  async handleFile(files) {
    const file = files.find(f => /\.xls[xmb]?$/i.test(f.name));
    if (!file) { UI.setPasteSt('Sube el STATUS del mes (.xlsm o .xlsx)', 'err'); return; }
    UI.setSourceProcessing('desp', true);
    UI.setPasteSt(`Leyendo ${file.name}…`, 'proc');
    try {
      const book = await readStatusBook(file);
      const days = listDaySheets(book.SheetNames);
      if (!days.length) throw new Error(`${file.name} no trae hojas de día (dd-mm-aaaa)`);
      State.statusBook = { fileName: file.name, book, days };
      $('despFileName').textContent = file.name;
      DespachoPanel.pickSheet();
    } catch (e) {
      State.statusBook = null;
      UI.setPasteSt(e.message, 'err');
    } finally {
      UI.setSourceProcessing('desp', false);
    }
  },

  /** Toma la hoja del día del ruteo; si no se puede, pide elegirla. */
  pickSheet() {
    const sb = State.statusBook;
    if (!sb) return;
    const fecha = fechaRuteo();
    const pick  = sheetForDate(sb.days, fecha);
    renderSheets(sb.days, pick?.name || '');
    if (pick) { DespachoPanel.applySheet(pick.name); return; }
    UI.setPasteSt(fecha ? `El STATUS no tiene hoja del ${fmtDia(fecha)}: elige el día` : 'Carga el ruteo o elige el día operativo', 'warn');
  },

  /** El ruteo acaba de cargarse: re-elige la hoja si ya hay un STATUS leído. */
  onRuteoLoaded() {
    if (State.statusBook) DespachoPanel.pickSheet();
  },

  applySheet(name) {
    const sb  = State.statusBook;
    const day = sb?.days.find(d => d.name === name);
    if (!day) return;
    try {
      const res   = parseStatusGrid(statusSheetGrid(sb.book, name), { fecha: day.date });
      const fecha = fechaRuteo();
      if (fecha && fecha.getTime() !== day.date.getTime()) res.warnings.unshift(`el ruteo es del ${fmtDia(fecha)}`);
      DespachoPanel._set(res, `hoja ${name} · ${sb.fileName}`);
    } catch (e) {
      UI.setPasteSt(e.message, 'err');
    }
  },

  handlePaste() {
    const raw = $('pasteArea').value.trim();
    if (!raw) { UI.setPasteSt('Pega datos primero', 'err'); return; }
    try {
      DespachoPanel._set(processPaste(raw, { fecha: fechaRuteo() }), 'pegado manual');
    } catch (e) {
      UI.setPasteSt(e.message, 'err');
    }
  },

  _set({ data, preview, idx, how, warnings }, origin) {
    State.reviewSessionId = null;   // "reabrir para corregir": nueva fuente = sesión nueva (ver events.js)
    State.despData = data;
    const notes = warnings.length
      ? ` · \u26A0 ${warnings.slice(0, MAX_NOTES).join(' · ')}${warnings.length > MAX_NOTES ? ` · y ${warnings.length - MAX_NOTES} más` : ''}`
      : '';
    UI.setPasteSt(`\u2713 ${data.size} rutas · ${how}${notes}`, warnings.length ? 'warn' : 'ok');
    UI.setSourceStatus('desp', true, '\u2713 Completo', `${data.size} rutas · ${origin}`);
    UI.renderPastePreview(preview, idx);
    _onChange();
  },

  /** Botón Limpiar: vacía la tarjeta y re-cruza. */
  clear() {
    DespachoPanel.reset();
    _onChange();
  },

  /** Estado inicial de datos + tarjeta (sin re-cruzar; lo usa "Reiniciar las 4"). */
  reset() {
    State.despData   = new Map();
    State.statusBook = null;
    $('pasteArea').value = '';
    $('pastePreview').classList.remove('on');
    $('despFileName').textContent = IDLE_FILE;
    renderSheets([], '');
    UI.setPasteSt('', '');
    UI.setSourceStatus('desp', false, IDLE_STATUS, IDLE_SUB);
  }
};
