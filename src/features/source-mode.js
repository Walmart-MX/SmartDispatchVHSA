/**
 * features/source-mode.js
 * Modo de carga del Excel de rutas: MODO MACRO vs MODO SIN MACRO.
 *
 * Por qu\u00e9 existe: se est\u00e1 migrando de la macro a la app. Mientras dura la
 * transici\u00f3n conviven los dos flujos, y el operador elige cu\u00e1l usa:
 *   - macro    : Excel ya procesado por la macro (RUTEO NUEVO + CONCENTRADO
 *                FACTURAS). Comportamiento de siempre.
 *   - sinmacro : ESTATUS RUTAS crudo (solo ruteo). La app hace el trabajo de
 *                las macros; no hay concentrado, el GLS sale del Reporte de
 *                Facturaci\u00f3n y HORA DE FACTURACION queda en blanco.
 * A futuro solo quedar\u00e1 sin macro; cuando llegue ese d\u00eda se borra el modo
 * macro y este m\u00f3dulo con \u00e9l.
 *
 * La elecci\u00f3n se recuerda en este equipo (localStorage) para no preguntar
 * en cada sesi\u00f3n; se puede cambiar desde Preparaci\u00f3n.
 *
 * Dependencias: State, MODE_MACRO / MODE_SIN_MACRO (core/constants.js)
 */
import { State } from '../core/state.js';
import { MODE_MACRO, MODE_SIN_MACRO } from '../core/constants.js';

const KEY = 'sd_source_mode';

/** Lee el modo guardado en State.mode (null si el operador a\u00fan no elige). */
export function loadMode() {
  const saved = localStorage.getItem(KEY);
  State.mode = (saved === MODE_MACRO || saved === MODE_SIN_MACRO) ? saved : null;
  return State.mode;
}

/** Guarda y aplica el modo. Ignora valores inv\u00e1lidos (nunca persiste basura). */
export function saveMode(mode) {
  if (mode !== MODE_MACRO && mode !== MODE_SIN_MACRO) return;
  State.mode = mode;
  localStorage.setItem(KEY, mode);
}
