# Macros reemplazadas por SmartDispatch (oct-2026)

`MACRO DESPACHO V2.xlsm` ya no hace falta. Este documento dice qué hacía cada
macro, qué módulo la reemplaza y **con qué evidencia** se validó (archivos
reales de `docs/MACRO/`, día 20-10-2026).

## Dos modos de carga

Durante la transición conviven dos flujos. El operador elige uno en un modal
(primer arranque en cada equipo; se recuerda y se cambia desde Preparación con
el botón **Modo … · Cambiar**). Código: `features/source-mode.js` y
`ui/mode-modal.js`.

| | **Modo macro** | **Modo sin macro** (el que se queda a futuro) |
|---|---|---|
| Tarjeta Excel | "Excel macro" — `RUTEO NUEVO` + `CONCENTRADO FACTURAS` ya procesados por la macro | "Ruteo" — hoja `RUTEO NUEVO ` del ESTATUS RUTAS **tal cual** |
| Acepta | solo el formato de la macro | solo el formato crudo |
| GLS | del concentrado | del `LOAD` del Reporte de Facturación |
| Hora de facturación | del concentrado | **en blanco** (ver abajo) |

Cada modo **rechaza el archivo del otro modo** con un mensaje que indica qué
hacer. Al cambiar de modo se quita el Excel ya cargado (con confirmación); PDFs,
WTMS, despacho y montos se conservan.

### Hora de facturación en blanco (decisión del equipo)

En modo sin macro `HORA DE FACTURACION` sale vacía. El equipo validó que es un
dato redundante y ya solicitó eliminarlo; mientras tanto la columna se conserva,
en blanco. Por eso **no hay tarjeta de Shipment Status**: su único aporte
exclusivo era esa hora (el GLS ya sale del Reporte de Facturación).

> Si algún día hiciera falta recuperar la hora: está en el `FINALIZATION TS` de
> `glsShipmentStatus_*.xls`. El módulo que la leía se validó 253/253 contra el
> concentrado y se retiró (YAGNI); este documento conserva las reglas para
> rehacerlo (ver "Facturas" abajo).

## Mapa

| Macro / paso manual | Reemplazo | Validación |
|---|---|---|
| `ArbeyJr` + `POST_PROCESO_UNIFICADO_FINAL` (aplanar `RUTEO NUEVO`, horas, seteo, ENT1, tractor) | `processors/ruteo-status.js` | 188/188 filas, mismo orden, 18 campos c/u |
| `SintesisFacturas` + hoja `CONCENTRADO FACTURAS` | GLS desde el Reporte de Facturación (`merge.js`, solo modo sin macro) | 188/188 entregas con GLS idéntico al del Reporte; ver abajo |
| **DESCO / FRIALSA** (paso manual) | `processors/desco.js` | 9/9 rutas (7 DESCO + 2 FRIALSA) |

## Reglas extraídas del VBA (no supuestas)

**Ruteo** (`ruteo-status.js`)
- Datos de ruta (cortina, unidad, seteo, horas, T.E/T.R, TIF/FITO) viven en la
  fila-encabezado y se repiten en cada entrega.
- Entrega = fila con DETTE y CAJAS numéricos.
- TRACTOR = valor de la columna RUTA de la fila siguiente al encabezado; vacío → UNIDAD.
- Horas: `FECHA - (hora > 0.91666 ? 1 : 0) + hora` (pasadas las 22:00 = día anterior).
- SETEO: `3°C` + TIF/TIF-FITO → REFRI; FITO/N/A/DIC → FRUTA; otro → REVISAR; `-22°C` → CONGE.
- ENT1: ENT1, 2, 3… por ruta, la última numérica con `U`.
- FECHA: del nombre del archivo (`RUTEO dd-mm-aaaa`); si no, hoy (la tarjeta lo avisa).

**Facturas** (referencia — `SintesisFacturas`, ya sin módulo propio)
- Se quitan las 11 filas de encabezado; `04659073767-1` → `4659073767`.
- Sam's: prefijo `6151` → `4659` (solo el prefijo; la macro reemplazaba toda aparición de "6151").
- GLS = `LOAD #`; hora = `FINALIZATION TS`.

**DESCO/FRIALSA** (`desco.js`) — el PDF es la verdad física del destino:
1. La ruta debe traer la marca (`DESCO <plaza>` o `FRIALSA`) y su PDF estar cargado.
2. Filas de Excel cuyo DETTE está en el PDF se quedan.
3. La **primera** que no está toma el DETTE del HUB del PDF (conserva su posición).
4. Las demás que no están en el PDF se descartan y **sus CAJAS se suman a las del HUB**
   (el total de cajas de la ruta se conserva: ej. ruta 4104, 8 filas → 1 fila HUB con
   2,265 cajas). Si hubiera más de un HUB en la ruta, las descartadas se suman al
   primero. ENT1 se renumera.
No hay tabla plaza→HUB que mantener (6154000 Mérida, 6154001 Tuxtla, 29999141 Frialsa salen del PDF).

## ¿El Reporte de Facturación puede reemplazar al concentrado?

**Para el GLS, sí.** Contra las 253 facturas del concentrado cubre 253/253 y
`LOAD` (= GLS) y `STORE` coinciden **al 100%**; además trae las 14 de Sam's. En
el navegador, con el cruce completo del 20-10: 188/188 entregas con GLS tomado
del Reporte. **Para la hora, no:** solo trae la hora de corrida del reporte, no
la de cada factura — de ahí que quede en blanco en modo sin macro.

## Diferencias respecto a la macro (a propósito)

1. **Hora de facturación en blanco** en modo sin macro (arriba). En modo macro
   sigue saliendo del concentrado, como siempre.
2. **Celdas vacías.** La macro rellenaba cualquier vacío con la celda de arriba (podía
   copiar el T.E de OTRA ruta). Aquí el vacío se queda vacío.
3. **ENT1 con `U`.** Tras colapsar un HUB, la última entrega queda con `U` (el RUTEO
   corregido a mano de referencia la perdió en la ruta 4113: `3` vs `3U`).
4. **CAJAS del HUB = suma.** El proceso manual conservaba las cajas de la primera tienda;
   aquí se suman las de todas las desconsolidadas (decisión del equipo). Por eso las
   CAJAS de esas filas ya no coinciden con el RUTEO corregido a mano de referencia.

## Lo que sigue siendo manual

Nada de lo identificado. (El cambio de unidad de la ruta 4407 que se vio en el RUTEO de
referencia ya viene en el ESTATUS RUTAS actualizado; no es un paso aparte.)

## Cómo reproducir la validación

Los archivos de `docs/MACRO/` son la referencia: `RUTEO 20-10-2026.xlsx` (entrada
cruda), `REPORTE DE FACTURACION` (GLS y montos), `RUTEO UNIFICADO.xlsx` (salida real
de la macro, ya con DESCO) y los PDFs del día 20-10-2026. Se compara cada salida de
los módulos nuevos contra la salida real, fila por fila y campo por campo.
