# Copiar diferencias y Directorio — 2026-11-21

Implementado en desarrollo. Sin publicación ni cambios de backend/base de datos.

## Comportamiento

- Doble clic en una diferencia de saldos de Arqueo copia banco, Sobra/Falta y monto con su moneda. Ejemplo literal: `En BANPRO *Sobra C$ 8,312.64*`. Se usan asteriscos simples porque WhatsApp los interpreta como negrita.
- Teledólar distingue Pago y Envío: `En Teledolar Envío *Falta $ 30.00*`. Conserva los signos/cálculos visibles; no invierte ni suma diferencias. Una celda equilibrada copia `---`; Total identifica el consolidado. La tabla compartida de Saldos tiene el mismo comportamiento.
- En Directorio flotante, doble clic en número copia sólo dígitos; no copia banco, tipo, moneda ni titular. Cédulas conservan ceros iniciales y únicamente la letra final, en mayúscula. No se modifica el registro almacenado ni su presentación.
- Un clic simple no copia. Enter/espacio sobre el elemento enfocado también copian. Se muestra Copiado sólo después de éxito; si ambos métodos fallan, aparece un aviso y permite reintentar.
- Se utiliza Clipboard API cuando está disponible y un campo temporal con execCommand como alternativa para acceso HTTP por red local. El campo se elimina y se restaura foco/selección. Si el navegador bloquea ambos métodos, se informa del fallo; no se promete compatibilidad universal.

## Validación

- Compilación y lint correctos. Vite conserva el aviso previo de bundle superior a 500 kB.
- 37 pruebas frontend aprobadas, sin omitidas.
- Cuatro suites de navegador aprobadas: copia, recibos/reordenación de Directorio, filtros de monedas y diferencias históricas.
- Copia comprobada en 1366×768 y 1920×1080: textos exactos, pago/envío, equilibrio, cuentas, tarjetas, cédula con letra minúscula de origen, ceros iniciales, teclado, API denegada/ausente, fallback y fallo/reintento.
- APIs financieras y portapapeles interceptados en las pruebas para evitar escrituras reales y conservar el portapapeles del usuario. No se enviaron mensajes por WhatsApp. Inspección visual de las capturas de desarrollo.

No cambian permisos, importes, cálculos, orden del Directorio, guardado ni auditoría financiera. No fue necesario reiniciar API ni repetir regresión SQL.

## Comprobación posterior al reporte de doble clic sin copia

Se añadió clipboard-native.browser.cjs: usa la implementación real del portapapeles del navegador, sin interceptar writeText/execCommand. Verifica por lectura efectiva el texto del banco, número y cédula; también fuerza la ausencia de la API moderna para probar execCommand real. TEMO_TEST_LAN_URL permite repetir por IP local HTTP, comprobando contexto inseguro y ausencia de navigator.clipboard, y leer el resultado desde una pestaña local segura.

Resultado: aprobado en Edge automatizado en loopback y en la IP local HTTP. Se interceptan sólo APIs de TEMO con datos sintéticos; no hay escrituras financieras ni mensajes. Estas pruebas no acreditan que el navegador concreto del usuario esté cargando esta versión. Pendiente confirmar URL/versión de las capturas; no se publicó ni se cambió el código de la función a partir de este reporte.

El titular confirmó el ingreso y el copiado en desarrollo. Se desactivó la selección de texto por doble clic exclusivamente en los elementos copiables (user-select: none), conservando la copia, foco por teclado y aviso Copiado.
