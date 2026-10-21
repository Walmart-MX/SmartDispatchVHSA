/**
 * ui/mode-modal.js
 * Modal de elecci\u00f3n de modo de carga (MODO MACRO / MODO SIN MACRO).
 * Mismo patr\u00f3n Promise-based que ui/confirm-dialog.js: `choose()` resuelve con
 * 'macro' | 'sinmacro', o null si el operador lo cierra (solo posible cuando
 * `dismissible` es true; en el primer arranque debe elegir).
 *
 * El markup vive en index.html (#modeModalOverlay); aqu\u00ed solo se cablea, una
 * sola vez y de forma perezosa en la primera apertura.
 *
 * Sin dependencias de otros m\u00f3dulos propios.
 */
let _resolve = null;
let _dismissible = true;
let _wired = false;

const overlay = () => document.getElementById('modeModalOverlay');

function settle(value) {
  overlay().classList.add('hidden');
  if (_resolve) { const r = _resolve; _resolve = null; r(value); }
}

function wire() {
  if (_wired) return;
  _wired = true;
  const el = overlay();
  el.querySelectorAll('.mode-opt').forEach(btn =>
    btn.addEventListener('click', () => settle(btn.dataset.mode)));
  document.getElementById('modeModalCancel').addEventListener('click', () => settle(null));
  el.addEventListener('click', e => { if (e.target === el && _dismissible) settle(null); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _dismissible && !el.classList.contains('hidden')) settle(null);
  });
}

export const ModeModal = {
  /**
   * @param {{current?: string|null, dismissible?: boolean}} opts
   * @returns {Promise<'macro'|'sinmacro'|null>}
   */
  choose({ current = null, dismissible = true } = {}) {
    wire();
    if (_resolve) settle(null); // un modal pendiente se cancela antes de abrir otro
    _dismissible = dismissible;
    const el = overlay();
    const opts = [...el.querySelectorAll('.mode-opt')];
    opts.forEach(b => {
      const isCurrent = b.dataset.mode === current;
      b.classList.toggle('is-current', isCurrent);
      b.setAttribute('aria-pressed', String(isCurrent));
    });
    document.getElementById('modeModalCancel').style.display = dismissible ? '' : 'none';
    document.getElementById('modeModalHint').style.display   = dismissible ? 'none' : '';
    el.classList.remove('hidden');
    // Foco inicial: el modo actual; si no hay (primer arranque), sin macro — el que se queda a futuro.
    (opts.find(b => b.classList.contains('is-current')) || opts.find(b => b.dataset.mode === 'sinmacro') || opts[0]).focus();
    return new Promise(resolve => { _resolve = resolve; });
  }
};
