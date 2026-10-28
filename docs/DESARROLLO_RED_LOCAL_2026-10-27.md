# Iniciar desarrollo y probar desde la red local

Ejecutar Iniciar TEMO Desarrollo.cmd en la computadora que aloja el proyecto. Iniciar pruebas TEMO.cmd ahora delega al mismo lanzador seguro. No usar los scripts antiguos de preparacion/seed para reiniciar pruebas existentes.

## Direcciones

- Esta maquina: http://127.0.0.1:3188/#/login
- Otros equipos de la misma Wi-Fi: http://192.168.0.15:3188/#/login (direccion observada el 27 de octubre; puede cambiar por DHCP).
- La consola muestra las direcciones actuales con nombre de adaptador. Preferir Wi-Fi/Ethernet; las interfaces VMware son redes virtuales distintas.

Los otros dispositivos solo necesitan navegador y estar en la misma red local; no ejecutar el lanzador en cada dispositivo. No usar localhost desde otra computadora para acceder a la maquina anfitriona. Si el router aisla clientes/invitados o cambia la IP, comprobar la red y la direccion mostrada. No configurar redireccionamiento de puertos en el router.

## Que hace el lanzador

- Prefiere el Node portable parcheado de tmp; verifica version/flags TLS. El Node global no se actualiza. Compila el codigo actual antes de iniciar.
- Usa exclusivamente PostgreSQL local ya preparado: temo_preview en 127.0.0.1:55433. Reutiliza el cluster, usuarios, pruebas y clave MFA existentes. No crea ni reinicia movimientos, contrasenas, MFA o semillas; si falta preparacion/migraciones, se detiene con un mensaje.
- API en 127.0.0.1:4187; base de datos en 127.0.0.1:55433. Solo Vite escucha en la red, puerto 3188. La web usa /api y un proxy fijo a la API local: ningun dispositivo necesita abrir el puerto de la API.
- Correo deshabilitado. Los procesos reciben un entorno filtrado, no secretos ni configuracion de nube heredados. Nest no lee archivos .env en este modo aislado. No conecta a Render/Supabase ni realiza despliegues.
- Reinicia solo procesos gestionados por este lanzador, verificando ejecutable, script y servicio contra Windows. Un puerto/PID de otro proceso provoca rechazo; no lo termina. Reiniciar invalida sesiones de desarrollo: volver a iniciar sesion. No cambia contrasenas ni MFA.
- Logs y PID en tmp/development; base y MFA en tmp/preview. Estos directorios siguen ignorados por Git. No publicar logs, copias, certificados ni secretos; el control de gastos permanece local.

## Red autorizada

Con autorizacion explicita, se cambio solo el perfil Wi-Fi actual a Privado y se agrego TEMO-Development-LAN-3188: entrada TCP 3188, perfil Private, RemoteAddress LocalSubnet, programa Node portable y sin edge traversal. No se habilitaron puertos de PostgreSQL/API ni perfiles Public/Domain.

El lanzador no cambia automaticamente perfiles ni firewall. scripts/enable-development-lan.ps1 es el auxiliar administrativo usado para esa configuracion autorizada; no ejecutarlo al conectarse a redes desconocidas. Una futura actualizacion del ejecutable portable puede requerir actualizar el programa de la regla.

Se rechazan hosts ajenos y pares fuera de direcciones privadas/loopback. Se limita el sistema de archivos de Vite a frontend y node_modules: .env, backend, backups y tmp no se publican. HMR solo agrega origenes ws exactos de interfaces privadas. Produccion conserva su CSP y URL de API existentes.

HTTP es solo para estas pruebas en una red privada de confianza; no usar credenciales productivas ni exponer este servidor a Internet. No es un despliegue de produccion.

## Evidencia

Arranque real del lanzador, health por loopback e IP Wi-Fi y login en navegador sobre 192.168.0.15:3188 comprobados; HMR conecta sin errores CSP. Lecturas HTTP de .env.production y backend/src/main.ts por Vite rechazadas (403), al igual que Host ajeno. No se leen ni muestran contenidos privados en esas comprobaciones. Escuchas verificadas: solo la web en 0.0.0.0; API/PG en 127.0.0.1. Falta la comprobacion fisica desde el segundo dispositivo del usuario.

Reinicio del lanzador comparado con manifiesto de recuperacion antes/despues: coinciden datos, estructura y secuencias de la base existente. No se cambiaron usuarios para ejecutar las pruebas; dos fixtures de regresion fueron ajustadas para escoger un administrador activo que no tenga cambio obligatorio de contrasena, respetando la validacion real de sesiones.

Validacion final con Node 22.23.4: build/lint correctos, 241/241 pruebas backend y 29/29 frontend sin omitidas. Regresion de navegador aprobada para ediciones/anulaciones, arqueo/cierre, traspasos, liquidaciones, versionado y transacciones en revision. Pruebas de formulario fijado en escritorio, movil y paisaje; comprobacion de header/footer visibles, espacio central util y monto en pestanas. Se incluyen pruebas del entorno filtrado del lanzador, alias sin seed, CSP/HMR privados y visibilidad de pendientes propios en revision, sin permitir acceso a otros cajeros sin turno habilitante.

## Formularios y pendientes

Encabezados/herramientas y acciones inferiores permanecen visibles al desplazar cada formulario. Las pestanas de transacciones muestran el monto; el centro conserva el desplazamiento. Cierres/traspasos conservan la identidad del turno y liquidaciones multiples su total. Pruebas visuales en 1366x768, 1920x1080, 390x844 y 844x390, sin desborde horizontal del formulario; las pestanas conservan su propio desplazamiento cuando hay muchas operaciones.

Corregida la consulta de pendientes: el cajero puede ver los de su propio turno EN_REVISION aunque no tenga otro turno abierto. No se amplia el acceso de otros cajeros en revision ni se habilita liquidar en ese turno; siguen vigentes los bloqueos de solicitudes. No requiere migracion nueva ni reinsertar el pendiente existente.
