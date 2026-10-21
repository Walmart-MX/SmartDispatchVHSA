# Convenciones de UI — SmartDispatch

Documento corto, vivo, para decisiones de diseño que no tienen un lugar
obvio en el código. Se agrega una sección nueva cuando se toma una
decisión que vale la pena no repetir ni olvidar.

## Iconos: emoji nativo, no SVG/icon-fonts (oct-2026)

**Decisión**: SmartDispatch usa **emoji nativo de Unicode** como su
sistema de iconos principal (nav de administración, botones, headers
de pantalla, estados). No se introducen icon-fonts ni librerías de
iconos (Font Awesome, Material Icons, etc.) ni un sprite propio de SVG.

**Por qué**: al auditar el código (oct-2026) ya había más de 50 usos de
emoji nativo como ícono en toda la app — era una decisión de facto, sin
documentar. Formalizarla evita que alguien arranque una migración a
SVG a medio camino, dejando la app con dos sistemas de iconos mezclados
(el peor escenario posible).

**Actualización (oct-2026, migración completa a 100%)**: se terminó de
migrar todo el SVG que funcionaba como ícono suelto:
- Tarjetas de carga en Preparación (WTMS, Reporte de Facturación).
- Estados vacíos (tabla sin datos, sin resultados de filtro).
- El badge del Dashboard de Calidad — antes un anillo SVG que se
  llenaba según el % real; ahora un emoji que cambia según el nivel
  (trofeo / pulgar arriba / llave inglesa para ≥95% / ≥80% / menos).
  El número real de calidad sigue mostrándose como texto aparte
  (`#qRingNum`), no se perdió ningún dato.
- Ornamentos estacionales del ThemeEngine (estrella, corazón, flor,
  sol, luna, bandera de México, calavera de Día de Muertos) y la luna
  grande de Halloween.

**Trade-off aceptado a conciencia**: estos elementos ya no heredan el
color del tema activo vía `currentColor` — el emoji trae su propio
color fijo, no se puede recolorear por CSS. Se prioriza consistencia
visual (toda la app usando el mismo lenguaje de iconos) por encima de
ese matiz de theming. Documentado también como comentario en
`ornaments.js` y `particles.js` para que nadie se pregunte por qué la
regla `color: var(--brand-accent)` quedó sin efecto ahí.

**Lo que NO se migra a emoji, porque no son íconos sino infraestructura**:
- **Partículas ambientales** (pétalos/chispas/motas/copos en
  `theme-engine/ambient/particles.js`) — son puntos de color puro vía
  CSS (`background` + `border-radius`), nunca representaron nada
  pictórico. No hay ícono que migrar ahí.
- **Tiras decorativas** (`theme-engine/ambient/strips.js`) —
  banderines, papel picado y luces son un patrón SVG `<pattern>` que
  se repite para llenar un ancho variable de pantalla. Un emoji es un
  glifo de tamaño fijo, no puede hacer ese trabajo.
- Cualquier futura pieza que necesite dibujar un valor exacto en
  tiempo real (otro medidor, un gráfico) — eso es visualización de
  datos, no iconografía, y amerita SVG/canvas igual que antes.

Motivos concretos para quedarse con emoji y no migrar lo que sí es
icono suelto:
- Cero dependencias nuevas, cero build step — consistente con el resto
  del proyecto (sin bundler, todo vendorizado localmente).
- La app corre instalada como PWA, atada a Microsoft Edge en Windows
  (ver `core/pwa-install.js`) — el renderizado del emoji es consistente
  para **todos** los usuarios, a diferencia de una web abierta a
  cualquier navegador/SO.

**Reglas**:
1. Un emoji **nunca** va solo — siempre acompañado de texto visible
   (ej. `Importar`, no un botón que sea únicamente el emoji). Los
   lectores de pantalla anuncian el emoji por su nombre Unicode, que
   suele ser raro fuera de contexto ("termómetro" en vez de algo útil)
   — el texto es lo que realmente comunica.
2. SVG queda reservado exclusivamente para infraestructura que NO es
   un ícono: visualizaciones de datos en tiempo real (medidores,
   gráficos) y patrones/tiras que se repiten en un ancho variable. No
   se usa para iconos chicos de botones/nav/estados.
3. No agregar icon-fonts ni paquetes de iconos (Font Awesome, Lucide,
   Material Icons, etc.) — si hace falta un ícono que ningún emoji
   representa bien, se resuelve con un SVG inline puntual, no con una
   librería nueva.
4. Al escribir emoji en código: si se asigna vía `textContent` (JS
   puro), usar `String.fromCodePoint(...)` con el codepoint numérico.
   Si se asigna vía `innerHTML`/HTML estático, usar la entidad
   numérica (`&#9989;`). Ambas formas evitan pegar el caracter emoji
   literal en el archivo y renderizan exactamente igual en el
   navegador.
