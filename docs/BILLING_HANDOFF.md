# Suscripciones y límites — punto de continuación

Actualizado el 9 de septiembre de 2026. Sustituye como punto de entrada a ACCOUNT_HANDOFF.md; ese documento conserva el historial del bloque anterior.

## Estado comprobado

108 pruebas pasan con PostgreSQL/Redis, además de tipos, ESLint, compilación y comprobación HTTP de acceso/revocación. Navegador: Configuración → Plan y uso carga correctamente y muestra que NovaTech todavía no tiene una suscripción comercial. No se ha asignado un plan ficticio a los datos del usuario.

Migraciones 012–015 aplicadas:

- 012: catálogo, cuentas de suscripción, reservas de uso y licencias de equipo.
- 013: vinculación de cliente/suscripción Stripe y conciliación restringida.
- 014: bloqueo del motor cuando una reducción de licencias deja más miembros que plazas, sin borrar personas; recuento de miembros sin exponer identidades al rol de aplicación.
- 015: recepción persistente de notificaciones de plataforma.

El motor incorpora la sincronización de suscripciones, pero los proveedores y la facturación de plataforma siguen apagados en el entorno local. No se han realizado cargos, enviado comunicaciones ni llamado a las APIs reales de Stripe en las pruebas.

## Control de uso

El servidor reserva uso antes de la llamada externa y dentro de la transacción que crea una tarea automática. La base de datos comprueba la empresa, el estado, la vigencia de acceso, la licencia de ejecución y el plan. Un bloqueo por empresa evita sobrepasar el cupo con operaciones concurrentes. Cada trabajo tiene como máximo una reserva, incluso al reintentarlo en otro mes.

Email y WhatsApp comparten el cupo por mes natural UTC. Los valores iniciales del diseño son Starter 1.000, Pro 5.000, Business 15.000 y Enterprise sin límite mensual de plan; el límite operativo diario del motor sigue siendo independiente. Starter no incluye generación de IA. IA, automatizaciones y enlaces de cobro se cuentan, pero todavía no tienen cupos mensuales comerciales específicos.

Las reservas de llamadas externas fallidas o inciertas se conservan de forma prudente. No representan mensajes entregados ni importes facturados. No hay liberación o ajuste manual de reservas todavía. Los registros previos a configurar una suscripción no se reconstruyen como consumo histórico.

Las licencias cuentan a todos los miembros, incluidos los usuarios de lectura. Las invitaciones pendientes no reservan plazas; la aceptación comprueba el cupo de forma atómica. Límites máximos iniciales: 5/20/50 usuarios para Starter/Pro/Business. Enterprise permite un número contratado de licencias, hasta el límite técnico de 100.000. Los valores son configuración preliminar, pendiente de cerrar la oferta comercial.

Una empresa local sin cuenta de facturación conserva el funcionamiento de desarrollo. Una empresa con cuenta configurada siempre aplica sus límites. En producción el motor exige cuenta de facturación aunque BILLING_REQUIRED sea false. Esto controla operaciones del motor e incorporaciones a equipos con suscripción; no bloquea la consulta de datos ni constituye un muro de pago para cada ruta CRUD del CRM.

## Stripe de la plataforma

Las claves se configuran en el servidor con prefijo PLATFORM_; no se reutilizan las claves con las que cada empresa cobra sus facturas. API fijada a `2025-03-31.basil`.

- Adaptador de Checkout recurrente: precio seleccionado desde una lista del servidor, cantidad de licencias validada, precio activo EUR de tipo licensed/per_unit, modo test/live coherente, idempotencia por operación y URL alojada validada.
- Adaptador de portal: cliente ya vinculado, retorno fijo a Revenia y URL alojada validada.
- Conciliación real mediante GET: comprueba cliente, suscripción, modo, precio permitido, una sola línea, cantidad y periodo del item. Obtiene el estado vigente, no aplica ciegamente un estado recibido por webhook.
- Sincronización cada cinco minutos, adelantada por notificaciones. Una exclusión por empresa evita aplicar respuestas concurrentes antiguas. La autorización se renueva como máximo durante 24 horas y nunca más allá del periodo/trial. Un fallo temporal no la prolonga. Una respuesta inválida, identidad incompatible o suscripción inexistente suspende el acceso del motor.
- Los cambios y las transiciones de error se auditan; no se añade una fila por cada sondeo idéntico.

La vinculación inicial en billing_bindings está reservada al operador. El rol web no puede cambiar directamente cliente/suscripción ni editar las tablas de plan/uso. Las funciones de conciliación sí permiten al servidor aplicar una instantánea a la vinculación exacta: son parte de la frontera de confianza del backend, no una verificación criptográfica de Stripe dentro de PostgreSQL.

## Notificaciones

Endpoint: `POST /api/webhooks/platform-stripe`. Requiere configuración explícita, cuerpo acotado, firma Stripe válida y reciente y modo correcto. Guarda ID/tipo/huella, sin guardar datos de tarjeta ni el cuerpo íntegro. Comprueba cliente y suscripción contra una vinculación del operador; ignora metadata de empresa aportada en el evento. Las entregas repetidas no duplican el trabajo y un cuerpo conflictivo para el mismo ID se rechaza.

Los avisos de cambios de suscripción y de facturas de renovación solo adelantan la conciliación. No conceden acceso ni marcan una suscripción como pagada. Las notificaciones de suscripciones todavía no vinculadas se ignoran; el sondeo posterior recupera el estado cuando exista una vinculación. Configurar el endpoint en Stripe con la misma versión de API.

## Configuración pendiente

Ejemplos añadidos a .env.example y .env.production.example:

- PLATFORM_BILLING_ENABLED=false.
- PLATFORM_BILLING_MODE=test, coherente con la clave.
- PLATFORM_BILLING_ALLOW_LIVE=false; las claves live exigen activación explícita adicional.
- PLATFORM_STRIPE_SECRET_KEY y PLATFORM_STRIPE_WEBHOOK_SECRET vacíos.
- PLATFORM_STRIPE_PRICES: JSON de objetos `{plan, interval, priceId}`, donde interval es month/year. No se aceptan precios enviados por el navegador.
- BILLING_REQUIRED=false en desarrollo; producción lo exige por código.

El chequeo de despliegue exige tablas/funciones de facturación y una suscripción vinculada y verificada recientemente para cada empresa del motor. Sigue pendiente probar ese chequeo con configuración real de staging.

## Siguiente trabajo concreto

1. Orquestación persistente de contratación: crear/vincular el cliente Stripe de forma idempotente; registrar una operación antes de contactar al proveedor; una sola contratación abierta por empresa; recuperar resultados inciertos sin cobrar dos veces. Los adaptadores de Checkout y portal todavía NO están expuestos mediante botones ni acciones de contratación.
2. Completar checkout.session.completed y la vinculación inicial de suscripción contra la operación de contratación. Después verificar desde Stripe antes de dar acceso. Un retorno del navegador nunca basta para activar el plan.
3. Acciones de contratación/portal exclusivas del propietario, reautenticación, confirmación del precio y periodicidad, reglas de cambios de plan, prorrateos, bajas y sobreuso. Revalidar permisos en servidor en cada operación.
4. Pruebas sandbox completas cuando existan las cuentas: compra inicial, pago pendiente, renovación fallida, cancelación, trial, actualización y reintento tras caída del proceso. No activar live ni publicar sin cerrar la contratación y estos escenarios.
5. Continuar alta inicial de empresas, MFA, recuperación y correo verificado; copias/restauración, privacidad operativa y validación legal.

## Referencias contrastadas

- [Creación de Checkout](https://docs.stripe.com/api/checkout/sessions/create).
- [Suscripciones y notificaciones](https://docs.stripe.com/billing/subscriptions/webhooks).
- [Consulta de suscripción con la versión fijada](https://docs.stripe.com/api/subscriptions/retrieve?api-version=2025-03-31.basil).
- [Periodos por item en Basil](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end).

## Uso de Codex

El usuario pidió continuar y parar antes de agotar el uso disponible. Saldo de créditos observado al inicio: 456,969785, sin descenso durante las consultas de este bloque. No se han canjeado restablecimientos. Los indicadores de uso se recargaron durante el trabajo; no afirmar que se ha agotado el uso ni que se haya programado una continuación automática.

Cierre comprobado: motor reiniciado con el código actualizado y actividad reciente confirmada. Última consulta de uso: 26 % consumido del tramo de cinco horas y 4 % semanal; saldo de créditos 456,969785, igual al inicio. No se ha agotado el uso. El siguiente bloque empieza por la operación persistente de contratación descrita arriba.
