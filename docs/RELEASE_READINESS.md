# Preparación de publicación

Estado: desarrollo local avanzado; todavía no autorizado ni validado para lanzamiento público.

## Configuración técnica prevista

La plantilla `compose.production.yml` separa web y worker, ejecuta procesos sin root, limita privilegios y expone la web solo en loopback. Necesita un proxy HTTPS y PostgreSQL/Redis administrados con TLS. No incluye bases demo, Mailpit ni credenciales de administración.

El Dockerfile no copia archivos .env ni registros locales. La compilación utiliza una dirección ficticia de base de datos. El arranque ejecuta `check-deployment.ts` y rechaza secretos de ejemplo, variables de administración, empresas demo, un origen no HTTPS o conexiones sin verificación TLS. Comprueba también el rol restringido, RLS, migraciones y conectividad. La prueba no sustituye una auditoría, la validación legal o una restauración real.

Antes de usar la plantilla: fijar el digest aprobado de Node, construir y escanear la imagen en CI, probarla en staging, configurar límites de recursos y rotación de logs del host y registrar el identificador inmutable de la versión. Esta imagen todavía no se ha construido ni ejecutado como contenedor.

Las migraciones se ejecutan una vez con credenciales separadas; esas credenciales no deben llegar al contenedor web ni al worker. Crear una base limpia y usuarios reales mediante un proceso de alta seguro. No ejecutar el seed de demostración. La lista explícita WORKER_TENANT_IDS necesita actualizarse cuando se incorporen empresas; el alta automática todavía no está implementada.

## Pruebas pendientes antes de autorizar lanzamiento

| Área | Evidencia necesaria |
|---|---|
| Proveedores | Cuentas sandbox, dominio/remitente verificado, plantillas Meta, firmas y entregas comprobadas contra APIs reales |
| Suscripciones Revenia | Modelo de planes, precios y cobro recurrente separado de las facturas de los clientes |
| Acceso | Alta inicial de empresas, recuperación, MFA, correo verificado y prueba de cada rol; invitaciones y revocación ya implementadas |
| Datos | Copia cifrada fuera del host, restauración ensayada, RPO/RTO definidos y custodia de la clave de cifrado |
| Operación | Alertas externas de salud, cola atascada y errores; protección del proxy, cuotas y presupuestos |
| Privacidad | Exportación, borrado y retención implementados; contratos con proveedores y clientes revisados |
| Facturación | Alcance fiscal definido y revisado; una factura guardada en el CRM no certifica un sistema fiscal |
| Publicación | Dominio, TLS, base sin demo, secretos nuevos, staging, rollback y revisión independiente |

El payload cifrado de un webhook se borra al conciliarlo. Los avisos en revisión, mensajes, generaciones, auditoría y copias necesitan una política de retención todavía pendiente de implementar. No borrar la clave de cifrado al rotarla: haría irrecuperables los registros anteriores sin una migración de claves.

## Datos que aportará el propietario más adelante

Identidad y domicilio del operador, alta profesional que corresponda, dominio y contacto de soporte/privacidad, cuentas de proveedores, mercados y tipos de cliente, condiciones comerciales, plazos de conservación y encargados de tratamiento. No compartir contraseñas o claves en el chat: introducirlas en el servidor o en Integraciones.

La AEPD ofrece herramientas orientativas para preparar obligaciones de protección de datos. Su uso no produce una certificación automática de cumplimiento: [Facilita Emprende](https://www.aepd.es/guias-y-herramientas/herramientas/facilita-emprende) y [aclaración sobre Facilita](https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/3-que-obligaciones-establece-el-rgpd-para-los-responsables/FAQ-0243-sobre-el-uso-de-herramienta-facilita). Los textos definitivos deben corresponder a la actividad y proveedores reales.

## Secuencia de activación futura

1. Completar el trabajo pendiente y registrar sus evidencias.
2. Preparar cuentas sandbox y ejecutar pruebas, manteniendo producción apagada.
3. Preparar infraestructura, migraciones, backups y base limpia.
4. Configurar secretos nuevos y cuentas verificadas; revisar documentos y permisos.
5. Solicitar la autorización concreta de publicación y activación comercial del propietario.
6. Publicar la versión validada y observar errores, entregas y cobros con límites iniciales bajos.

No se ha publicado, cobrado ni enviado comunicación real durante esta entrega.
El comprobador de worker exige actividad por empresa en 90 segundos. Antes de atender muchas empresas con un mismo proceso, particionar los workers y ajustar sus lotes/monitorización a la carga para evitar alertas por esperas largas entre empresas.

