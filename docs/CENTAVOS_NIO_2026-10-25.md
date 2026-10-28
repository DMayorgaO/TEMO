# Monedas NIO y etiquetas Teledolar

Estado: implementado solo en desarrollo. Sin despliegue ni cambios en produccion.

## Cambios

- C$ 0.50 y C$ 0.25 despues de C$ 1.00 en la lista compartida del arqueo: apertura, cierre, conteo, transacciones, vuelto, pendientes y transferencias.
- Resumen de traspaso completa la presentacion de registros antiguos con ambas monedas en cero cuando no aparecen, sin modificar la instantanea guardada.
- Migracion 045 incorpora/reactiva ambas denominaciones NIO sin cambiar sus identificadores existentes, sin modificar USD y sin recalcular arqueos historicos.
- Operaciones compartidas incorporan las filas de denominaciones usadas que faltan en el arqueo ACTUAL de un turno antiguo. Esto evita perder monedas nuevas antes del siguiente autoguardado de la pantalla.
- Se elimina exclusivamente el aviso modal de diferencia minima al guardar transacciones. No se amplian tolerancias, no se anulan validaciones y no se borran diferencias contables no representables.
- Teledolar en aperturas/cierres usa Pagos para income y Envios para expense, igual que Saldos; no se invierten importes ni signos.

## Verificacion

- Migracion aplicada solo a postgresql local de preview, 127.0.0.1:55433/temo_preview.
- 25 pruebas unitarias del frontend correctas.
- 32 pruebas de integracion de regresion financiera y traspasos correctas con rollback: recibir C$ 0.75, devolver C$ 0.25, transferir C$ 0.50, anular y restaurar los saldos, cerrar/abrir con ambas monedas y preservar diferencia no representable de C$ 0.01.
- Playwright del Arqueo correcto en 1366x768, 1920x1080 y altura reducida 1366x650, sin desplazamiento de documento ni cifras cortadas. En movil se conserva desplazamiento vertical, sin horizontal.
- Playwright de traspaso con dos sesiones correcto; el resumen antiguo muestra ambas monedas nuevas.
- Compilaciones backend/frontend y lint correctos.

Pendiente la revision humana en desarrollo. El control de gastos permanece local y excluido de Git.
