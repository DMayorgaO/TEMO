# Exportaciones Excel: proteccion de textos

Estado: implementado y probado en desarrollo. Produccion sin cambios.

## Alcance

El exportador compartido genera archivos .xls con contenido HTML. Ahora su modo
Excel marca las cadenas como texto mediante mso-number-format y agrega un
apostrofo protector ante prefijos =, +, - y @, incluso despues de espacios o
caracteres de control iniciales. El contenido sigue escapado como HTML.
Los valores realmente numericos conservan su valor, incluidos negativos.
Las cadenas monetarias conservan su contenido. El PDF no aplica este modo.

No se modifican registros, tasas, saldos ni arqueos. No requiere migracion.
No sustituye controles de acceso ni impide que un usuario copie datos autorizados.

## Evidencia

- 11/11 pruebas frontend: prefijos, controles, escape HTML, numeros y PDF.
- 55/55 pruebas backend contra preview local; ninguna contra produccion.
- npm run build y npm run lint correctos.

## Pendiente antes del despliegue

Abrir una exportacion en Microsoft Excel usado por el negocio y verificar
numeros, simbolos, acentos y textos. Probar en datos locales una descripcion
=1+1 y otra con tabulacion inicial: deben permanecer texto, sin evaluarse.
Comprobar tambien -150 como numero y como texto, porque el apostrofo puede
mostrarse dependiendo del importador. No se ha validado compatibilidad visual
con todas las aplicaciones de hojas de calculo; las pruebas inspeccionan el HTML.

Este avance se agrega al paquete de auditoria, permisos y exportaciones
documentado en los otros informes del 2026-10-08. Las migraciones 040-042
siguen pendientes de aprobacion para produccion.
