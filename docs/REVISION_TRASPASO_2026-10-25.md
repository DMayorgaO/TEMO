# Revision del resumen de traspaso

Estado: cambios solo en desarrollo. Migraciones 046, 047, 048 y 050 aplicadas solo al PostgreSQL local de preview.

## Solicitud de cierre despues de corregir (2026-10-26)

- El cajero saliente selecciona su turno EN_REVISION en Arqueo y pulsa Solicitar cierre. Se confirma que las correcciones estan listas, se guardan arqueo y saldos pendientes y se actualiza la solicitud administrativa habitual. Un fallo al guardar impide enviar el aviso.
- Se mantiene EN_REVISION, sin cerrar ni reabrir el turno y sin modificar el efectivo o saldos del receptor. Solo el propietario con sesion vigente puede solicitarlo; el Administrador conserva la aprobacion final.
- La fecha de la solicitud identifica cada aviso renovado: vuelve a aparecer a los Administradores aunque hayan descartado la solicitud anterior. Los refrescos de una misma solicitud no la muestran otra vez. Se conserva el comentario de cierre existente si no se envia otro.
- La solicitud no congela las correcciones ni certifica una diferencia cero. Si el cajero vuelve a corregir despues, puede solicitar otra revision; el Administrador siempre carga los datos actuales del turno antes de aprobar.
- El evento SOLICITAR_CIERRE_TRAS_CORRECCIONES queda en Auditoria. Si falla su escritura, se revierte tambien la renovacion del aviso.
- Nuevas observaciones automaticas: Traspaso del turno TUR-xxxxxx: Nombre saliente entrega a Nombre receptor. Se conserva el motivo de revision y las observaciones escritas.
- Migracion 050 repara exclusivamente prefijos tecnicos exactos de traspasos aceptados en observaciones de apertura, cierre y solicitud. No sustituye texto libre ni elimina identificadores de las relaciones o de Auditoria. Es repetible, respeta traspasos encadenados y solo se aplico al preview local.
- Verificado: 200 pruebas backend y 27 frontend, build/lint, navegador con solicitud EN_REVISION, persistencia previa, error al guardar, aviso renovado y observaciones administrativas. Integracion comprueba propietario, sesion revocada, rechazo de otros usuarios/turnos cerrados, rollback de auditoria y aislamiento del receptor.

## Actualizacion del flujo (2026-10-26)

Esta seccion sustituye las restricciones y la accion administrativa descritas en el diagnostico inicial de abajo.

- El resumen muestra Diferencia NIO y su equivalente USD, descontando la Diferencia registrada igual que Arqueo. No muestra las filas de efectivo esperado/contado equivalente.
- Registrar diferencia suma el neto pendiente a cambio_nio mediante una transaccion con version del resumen. No reescribe los conteos ni permite sumar dos veces con una version obsoleta.
- Diferencia acumulada por compra de dolares es solo informativa; no exige una relacion mayor/menor con la registrada ni se descuenta otra vez.
- Traspasar y cerrar permite diferencias; la aceptacion expresa del receptor sigue siendo obligatoria. El rechazo conserva el turno original abierto.
- Traspasar en revision abre el turno receptor al aceptar y deja el original EN_REVISION, con solicitud administrativa PENDIENTE y notificacion a todos los Administradores activos.
- El turno EN_REVISION permite al propietario corregir arqueo y saldos, editar/anular transacciones existentes y agregar transacciones nuevas de correccion. Para agregar, se exige el identificador explicito de ese turno y se comprueba su propietario bajo bloqueo; nunca se elige implicitamente un turno en revision. No permite reaperturas ni otro traspaso del mismo turno. Solo el Administrador puede cerrarlo.
- Transacciones permite seleccionar un turno propio en revision cuando existe tambien otro turno abierto. Agregar desde Arqueo conserva ese identificador y la peticion lo envia expresamente. Editar un grupo propio carga el contexto de su turno original.
- Se corrige el refresco/autoguardado del Arqueo: pausa mientras el resumen de entrega esta abierto, espera escrituras anteriores y sincroniza la diferencia registrada. No vuelve a guardar un borrador anterior tras registrar la diferencia. Los resumenes comparan valores financieros sin incluir marcas de refresco updated_at; siguen rechazando importes realmente modificados.
- Diferencias cero se representan como ---; importes positivos y negativos conservan sus colores. La recepcion usa la misma tabla de denominaciones y agrupacion NIO/USD, con encabezado de apertura por recepcion.
- Arqueo permite seleccionar los turnos propios en revision aunque el cajero tenga posteriormente otro turno operativo. Los Administradores los ven en Turnos y en las solicitudes de cierre.
- Cada apertura recibida copia efectivo y saldos aceptados. El arqueo, movimientos y correcciones de un turno no se propagan al otro.
- Teledolar congela la aportacion ajena al momento de la entrega y recalcula solo los movimientos propios de cada turno, manteniendo Pagos/Envios y las referencias de Saldo Sistema independientes.
- Las correcciones de transacciones en revision con liquidaciones aplicadas en otro turno requieren tratamiento administrativo independiente; se rechazan para no alterar fondos ya aceptados por otro cajero.
- Las propuestas anteriores a este cambio deben cancelarse y prepararse de nuevo para obtener una version actualizada del resumen.

Validacion: build y lint; integracion con rollback y rol restringido; concurrencia e idempotencia; regresion financiera; Playwright con dos sesiones, registro de diferencia y espera superior al intervalo de refresco, ambos modos, rechazo, resumen obsoleto y aceptacion, a 1366x768, 1920x1080 y movil. Se comprueba el aislamiento de efectivo, bancos y Teledolar al agregar, editar y anular una transaccion nueva en revision, asi como su cierre administrativo. Prueba de navegador adicional verifica el turno explicito enviado al guardar aunque exista otro turno abierto. Las fechas de refresco se modifican sin cambiar importes para comprobar que no invalidan propuestas ni su aceptacion.

No se ha publicado en produccion. El control de gastos sigue local e ignorado por Git.

## Diagnostico del caso local

El turno de pruebas TUR-000244 de la captura tenia C$ 21,900.00 y USD 1,750.00 contados.
A tasa 36.40, el equivalente era C$ 85,600.00, frente a C$ 75,600.00 esperado: sobrante C$ 10,000.00.
La diferencia registrada y la diferencia por compra de dolares eran cero. Las cuentas bancarias no tenian diferencias.
Se consulto este caso sin modificar sus datos; las capturas de verificacion interceptan las llamadas de escritura del navegador.

El mensaje anterior no creaba una solicitud administrativa: solo indicaba usar el cierre habitual. Se reemplaza por detalle cuantificado y una accion explicita.

## Cambios

- Resumen con identidad del turno, arqueos NIO/USD, totales por moneda y saldos agrupados NIO/USD, con los colores y estructura del cierre administrativo de TEMO.
- Compara efectivo contado equivalente, esperado, diferencia bruta, diferencia registrada y pendiente de justificar. USD se identifica como equivalente de la misma diferencia, no como un segundo descuadre.
- Cada cuenta muestra calculado, sistema y diferencia. Teledolar conserva Pagos/Envios independientes.
- Campo informativo de diferencia por compra de dolares obtenido del mismo DollarPurchasesService que alimenta Compra de Dolares. No se descuenta automaticamente de la diferencia ni se cambian importes o tolerancias.
- El mismo campo aparece debajo de Diferencia registrada en el cierre administrativo por notificacion, formulario de cierre y consulta de cierres.
- Observaciones de traspaso hasta 2000 caracteres: se guardan en la propuesta, se muestran al receptor y se conservan en el cierre, apertura y auditoria.
- Solicitar revision administrativa crea la solicitud de cierre existente y deja el turno PENDIENTE_APROBACION. Los Administradores la ven como CLOSE_REQUEST en TEMO; no se envia correo.
- Preparar/consultar el resumen no envia solicitudes automaticamente. No se abre ningun turno receptor al solicitar revision.
- Las observaciones de la revision llegan al aviso y al formulario administrativo, y la solicitud queda auditada. Se mantienen las restricciones de transferencia con diferencias.

## Verificacion

- Pruebas de integracion: diferencias exactas de efectivo y por cuenta, vista previa sin avisos, solicitud explicita con aviso y observaciones, persistencia de observaciones de entrega, rollback e idempotencia.
- Mismas comprobaciones de traspaso con rol de base de datos restringido.
- Regresion financiera comprueba igualdad del diferencial de compra entre reporte, cierre y snapshot; no se altera el descuadre bruto.
- Playwright: dos sesiones, campo Observaciones sin interpretar HTML, revision administrativa explicita, rechazo/cancelacion/aceptacion y propuestas obsoletas.
- Capturas revisadas del caso local a 1366x768, 1920x1080 y 390x844; sin desplazamiento horizontal dentro del dialogo.
- Prueba de cierre administrativo confirma el importe informativo de C$ 141.08 para un diferencial calculado de 141.078.
- Compilacion backend/frontend y lint correctos. Pruebas unitarias del frontend correctas.

Sin publicacion en produccion ni modificaciones al control de gastos local. Las propuestas preparadas antes de ampliar el resumen deben cancelarse y reenviarse si el servidor detecta que su version ya no coincide.
