# Diferencia de cierre y seguridad del Directorio — 2026-11-20

Estado: implementado en desarrollo; no publicado. Sin migraciones nuevas.

## Turnos históricos

Al abrir el detalle de un turno cerrado y pasar a Cierre, se muestran Diferencia NIO y Diferencia USD debajo del efectivo contado. Se reutilizan el cálculo y los colores de Arqueo: sobrante azul, faltante rojo y saldo equilibrado neutro. USD es el equivalente del mismo resultado, no otro faltante que deba sumarse.

La diferencia pendiente es efectivo final NIO + efectivo final USD × tasa general − esperado equivalente NIO − diferencia registrada. Por eso se ve aunque el administrador nunca haya pulsado Agregar cambio, y disminuye o queda equilibrada cuando ya se reconoció parcial o totalmente. La diferencia registrada y la diferencia por compra de dólares continúan separadas.

Es una consulta del registro guardado. No crea Cambios, arqueos, asientos ni solicitudes adicionales; usa el detalle autorizado existente. Durante la edición se conserva el formulario actual; el nuevo resumen se consulta al abrir el registro guardado. No se alteran cierres, saldos, tasas D ni liquidaciones. Se reutiliza la base contable y tasa que entrega actualmente Arqueo histórico; este bloque no incorpora una nueva instantánea inmutable de tasas antiguas.

## Seguridad del Directorio

Política explícita para list, detail, create y update antes del controlador. Lectura para Administrador, Cajero y Transferista; escritura para Administrador y Cajero. Se exige versión de sesión válida y se rechaza cambio obligatorio de contraseña. Las rutas nuevas sin política (incluidas claves heredadas del objeto) se rechazan.

Las cuatro rutas rechazan parámetros de consulta no admitidos, incluyendo POST/PUT; los cuerpos conservan sus esquemas estrictos. Permanecen la identidad vigente en transacción, recibos idempotentes, versión de contenido, orden de filas y auditoría atómica.

## Evidencia

- Pruebas dirigidas: 23 aprobadas, sin omitidas (matriz HTTP y escenarios SQL de permisos, identidad, recibos y rollback de auditoría).
- Navegador con API sintética interceptada: sobrante, faltante, reconocimiento positivo/negativo y parcial; comparación exacta con Arqueo histórico; vista 1366×768 y 1920×1080; sin escrituras ni errores de página.
- Regresión general: 409 pruebas backend y 37 frontend aprobadas, sin fallos ni omitidas. Seis suites generales de navegador aprobadas (tabla, filtros de moneda, revisión, pendientes, cambio y versión de edición), además del nuevo recorrido histórico. Compilación y lint correctos. API local health 200. Vite conserva el aviso de tamaño de bundle superior a 500 kB.

Límites: no se probó ni modificó producción. La captura auxiliar sigue siendo best effort y no sustituye auditoría financiera. La matriz general y los controles externos del checklist continúan pendientes.
