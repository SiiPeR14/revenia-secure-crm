# Conexiones y operación de motores

## Interruptores y permisos

`EXTERNAL_OPERATIONS_ENABLED` está apagado por defecto. Guardar credenciales las cifra y deja la conexión pausada. Solo el propietario administra conexiones y cobros. Las acciones de mensajería/IA requieren permisos CRM; el worker vuelve a comprobar la pertenencia y el rol cuando ejecuta el trabajo.

Cada trabajo conserva la versión de configuración usada al aprobarlo. Cambiar credenciales impide enviarlo con otra cuenta. La lista de empresas del worker se configura en WORKER_TENANT_IDS; no se descubren usando credenciales administradoras.

`ENGINE_DAILY_LIMIT` limita nuevos trabajos externos por tipo y empresa durante las últimas 24 horas, con valor efectivo entre 1 y 1000 y predeterminado 100. No es un tope monetario: configurar también presupuestos y alertas en cada proveedor.

## Servicios

| Servicio | Configuración | Operación implementada |
|---|---|---|
| Resend | API key, remitente verificado, secreto Svix, dirección receptora opcional | Email de texto plano, idempotencia, entrega/rebote/queja y recepción del texto mediante API |
| WhatsApp | Token, ID de teléfono, versión Graph, app secret y verify token | Plantilla aprobada sin parámetros, entrada de texto, estados y baja |
| OpenAI | API key, modelo disponible y tarifas | Responses con store:false, sin herramientas, borrador para revisión; texto, modelo, tokens y estimación persistidos |
| Stripe | API key de la empresa y secreto de webhook | Checkout alojado para una factura, importes de servidor y conciliación firmada |

Los cobros descritos pertenecen a facturas de cada empresa. La suscripción de una empresa al SaaS Revenia todavía necesita su propio módulo y cuenta/plataforma de facturación.

Las claves no se muestran después de guardarlas. La etiqueta «Configurada y habilitada» indica configuración interna; no acredita que el proveedor la haya verificado. No hay credenciales reales guardadas por esta entrega.

## Mensajes y permisos de contacto

Un borrador no se envía al guardarlo. Se requiere aprobación expresa y un cliente vinculado con autorización para el canal. En WhatsApp, el nombre de plantilla y su idioma deben existir y estar aprobados en la cuenta de Meta; el texto libre del borrador no sustituye a esa plantilla.

El worker comprueba de nuevo autorización, destinatario y supresión. Las entradas de texto STOP, BAJA o CANCELAR registran una supresión. Los rebotes y quejas de email también bloquean el destinatario. La autorización manual no elimina una supresión; no existe un botón para saltarse una baja. Otras solicitudes de baja requieren atención por el equipo; no hay clasificación automática de todas las expresiones posibles.

## Webhooks

Registrar la URL canónica HTTPS más `/api/webhooks/UUID-DE-EMPRESA/resend`, `/whatsapp` o `/stripe`. Los valores exactos aparecen en Integraciones. Meta utiliza además el GET de verificación. Configurar eventos compatibles:

- Stripe: checkout.session.completed, checkout.session.async_payment_succeeded y checkout.session.expired.
- Resend: email.sent, email.delivered, email.opened, email.bounced, email.complained, email.failed y email.received.
- Meta: mensajes entrantes y estados para el ID de teléfono configurado.

La firma se comprueba sobre el cuerpo original. Stripe y Svix admiten una tolerancia de cinco minutos; Meta utiliza HMAC más deduplicación duradera. Configurar sincronización de reloj y protección de tráfico en el proxy antes de publicar. Límite del cuerpo: 256 KB.

Los eventos se guardan cifrados antes de confirmar recepción. Si llegan antes de la respuesta del envío se concilian en ciclos posteriores. Un evento sin correspondencia se aplaza con espera progresiva y pasa a revisión al agotar 20 intentos o superar siete días. El propietario puede solicitar de nuevo su conciliación. Los eventos procesados conservan su identificador/hash y eliminan el payload cifrado.

## Errores e interrupciones

Email y Checkout emplean una clave de idempotencia estable. Como máximo se realizan cinco intentos dentro de seis horas. WhatsApp e IA no se repiten automáticamente. Si el proveedor pudo aceptar una operación pero no hay certeza del resultado, se muestra «Requiere revisión». Una interrupción del worker trata así los trabajos externos; las tareas locales se recuperan transaccionalmente.

No crear otro envío ni enlace para resolver un estado incierto sin consultar el proveedor. Los registros del servidor omiten claves y cuerpos de respuesta. La consola muestra códigos de soporte desplegables.

El worker local puede iniciarse y detenerse desde los scripts de la raíz. Su parada espera a terminar la operación en curso; si no termina, el script avisa sin apagar la base de datos a mitad de una operación. La actividad reciente aparece en Ejecuciones. Las comprobaciones externas y las alertas de operaciones siguen pendientes del entorno de publicación.

## Fuentes técnicas y validación pendiente

- [Idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
- [Verificación de webhooks de Resend](https://resend.com/docs/webhooks/verify-webhooks-requests).
- [Lectura de email recibido](https://resend.com/docs/api-reference/emails/retrieve-received-email).
- [Creación de Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create).

Los contratos locales tienen transporte simulado y no prueban las cuentas externas. Confirmar la versión Graph, plantillas y permisos de Meta, el modelo/tarifas de OpenAI y todos los flujos en sandbox antes de activar.
