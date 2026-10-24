# Fuentes de datos de SmartDispatch — de dónde sale cada archivo

Documento corto de referencia operativa (no técnico) para quien carga
los archivos del día en **Preparación**. Resume las 5 fuentes
obligatorias, qué contienen y de dónde se obtienen. Si cambia el
origen de alguna, actualizar aquí primero.

> **oct-2026 — ya no hacen falta las macros.** Hay dos modos de carga del
> Excel de rutas (se elige en un modal y se cambia desde Preparación):
> **modo macro** (el Excel ya procesado, como siempre) y **modo sin macro**
> (solo el Ruteo crudo — el que se queda a futuro). En modo sin macro la app
> hace lo que hacían `ArbeyJr`, `POST_PROCESO_UNIFICADO_FINAL` y
> `SintesisFacturas`, y el paso manual DESCO/FRIALSA; la hora de facturación
> queda en blanco. Detalle y evidencia en `docs/MACROS_REEMPLAZADAS.md`.

> Aclaración de origen (oct-2026): las 4 primeras fuentes ya estaban
> bien entendidas por el equipo. La que generaba confusión era el
> **Reporte de Facturación** — quedó aclarado abajo.

## 1. PDFs de cargas
**Qué es**: uno o varios PDF por ruta (formato CeDis), con operador,
licencia, tarimas, marchamos, factura y cita de cada entrega.
**Carga**: arrastrando todos los archivos del día a la vez, o la
carpeta completa.

## 2. Ruteo / Excel de rutas (según el modo)
**Modo sin macro — tarjeta "Ruteo"**: el libro ESTATUS RUTAS del día, hoja
`RUTEO NUEVO` TAL CUAL (sin pasarla por la macro). La fecha operativa sale del
nombre del archivo (`RUTEO 20-10-2026.xlsx`); si no trae fecha, se usa hoy y la
tarjeta lo avisa. Las rutas que descargan en un HUB (`DESCO MÉRIDA`,
`DESCO TUXTLA`, `FRIALSA`) se ajustan solas contra el PDF. El GLS de cada
factura sale del Reporte de Facturación (fuente 5) y la hora de facturación
queda en blanco.
**Modo macro — tarjeta "Excel macro"**: el Excel que ya pasó por la macro,
con `RUTEO NUEVO` + `CONCENTRADO FACTURAS` (GLS y hora salen del concentrado).
**Carga**: un único `.xlsx`/`.xls`. Cada modo rechaza el archivo del otro
modo, con un mensaje que dice qué hacer.
**Columnas fijas por posición (sin macro)**: encabezado en la fila 1;
`A CORTINA · B TIF/FITO · C LLEGA · D CONGE/REFRI · E RUTA · F UNIDAD ·
H DETTE · L CAJAS · Q SETEO · W SOLICITUD · X FORMADO · Y ENRAMPE · Z T.E. ·
AA RETIRO · AB T.R. · AC CASETA` (`RUTEO_COLS`). Si un título viene distinto,
la columna se lee igual por su letra y la tarjeta avisa (`título distinto
en F`). **Si alguien inserta o mueve una columna, hay que actualizar
`RUTEO_COLS` en `src/core/constants.js`.**

## 3. Reporte WTMS
**Qué es**: CSV exportado de WTMS con ID de la carga, Carta Porte y
Siguiente Carga — solo esas tres columnas se usan, el resto se
descarta (ver `processors/wtms.js`).
**Carga**: un único `.csv`.

## 4. Status de despacho
**Qué es**: el STATUS mensual (`10 STATUS OCTUBRE 2026.xlsm`), una hoja por
día `dd-mm-aaaa`.
**Carga**: se sube el archivo; se toma sola la hoja del día del ruteo (si no
hay ruteo o falta esa hoja, se elige el día en la tarjeta). Opción manual:
copiar la hoja del día desde la columna A, con el encabezado, y pegarla.
**Columnas fijas por posición**: encabezado en la fila 5;
`B RUTA · U H. DESP · W ID MASTER · AF SALIDA (caseta) · AH USUARIO WTMS`
(`DESP_COLS`). Por nombre se confundían STATUS WTMS (Z) con USUARIO WTMS (AH)
y las dos "SALIDA" (AB programada / AF caseta). Un título distinto solo
genera aviso. Horas sueltas (`02:33`) se ubican en el día operativo (pasadas
las 22:00 = día anterior); una fecha de 1900 (error de captura) se toma solo
como hora y se avisa.

## 5. Reporte de Facturación (mainframe — "INVOICE DETAIL")
**Qué es**: el detalle línea a línea de cada factura del día (una o
varias líneas por INVOICE, con su TOTAL COST), con el que SmartDispatch
calcula `MONTO FACTURA` por factura.

**De dónde sale (aclarado oct-2026)**: **lo manda QA por correo al
cierre del día operativo** — es un reporte de mainframe (report id
`RPinvdtl`), no algo que arme manualmente quien hace el despacho. El
archivo se descarga de ese correo y se encuentra disponible en la
**carpeta `EMAIL_PROD`**.

**Formato real del archivo**: llega sin extensión reconocible al
descargarlo del correo — puede ser texto plano (`.TXT`, el caso que
procesa `processors/invoice-report.js`) o el mismo contenido ya pegado
en un `.xlsx` con columnas separadas (en ese caso se procesa como
cualquier otro Excel, no por este módulo). Si el archivo no trae
`DC#:` reconocible en el encabezado, SmartDispatch lo rechaza con un
mensaje explícito en vez de adivinar.

**Carga**: un único archivo, igual que las demás fuentes de archivo —
tarjeta "Reporte de Facturación" en Preparación.

---

### Por qué estas 5 y no menos
Las 5 fuentes son **obligatorias** — `Events.checkSources()`
(`src/events/events.js`) bloquea el cruce completo (`runMerge()`) si
falta cualquiera de ellas. Es deliberado: un cruce parcial produciría
un archivo final con columnas vacías sin que nadie se diera cuenta a
tiempo.
