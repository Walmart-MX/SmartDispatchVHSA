/**
 * features/source-mode.js
 * Modo de carga del Excel de rutas: MODO MACRO vs MODO SIN MACRO.
 *
 * Por qué existe: se está migrando de la macro a la app. Mientras dura la
 * transición conviven los dos flujos, y el operador elige cuál usa:
 *   - macro    : Excel ya procesado por la macro (RUTEO NUEVO + CONCENTRADO
 *                FACTURAS). Comportamiento de siempre.
 *   - sinmacro : ESTATUS RUTAS crudo (solo ruteo). La app hace el trabajo de
 *                las macros; no hay concentrado, el GLS sale del Reporte de
 *                Facturación.
 * A futuro solo quedará sin macro; cuando llegue ese día se borra el modo
 * macro y este módulo con él.
 *
 * CAMBIO (oct-2026): la elección YA NO se recuerda en el equipo — se pregunta
 * en CADA apertura de la app (pedido del equipo), así que vive solo en
 * State.mode durante la sesión. Se puede cambiar desde Preparación.
 *
 * Dependencias: State, MODE_MACRO / MODE_SIN_MACRO (core/constants.js)
 */
import { State } from '../core/state.js';
import { MODE_MACRO, MODE_SIN_MACRO } from '../core/constants.js';

/** Aplica el modo a la sesión. Ignora valores inválidos (nunca deja basura en State). */
export function setSourceMode(mode) {
  if (mode !== MODE_MACRO && mode !== MODE_SIN_MACRO) return;
  State.mode = mode;
}
