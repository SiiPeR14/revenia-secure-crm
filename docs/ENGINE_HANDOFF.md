# Motores de Revenia — punto de continuación

Actualizado: 9 de septiembre de 2026. Este documento sustituye el punto de pausa anterior.

## Continuación posterior

El bloque de cuentas, equipo y auditoría está incorporado. Su estado actualizado y presupuesto independiente están en ACCOUNT_HANDOFF.md. Las cifras y pendientes siguientes describen el cierre del bloque de motores anterior.

## Petición y límites

Preparar motores y conexiones reales para un futuro lanzamiento. Sergi todavía no tiene alta profesional ni cuentas de proveedores; las preparará más adelante. No publicar, activar servicios externos, enviar mensajes ni efectuar cargos ahora. Última autorización: continuar con un máximo de 300 créditos. Saldo de referencia: 998,603810; parar con margen antes de 698,603810. No utilizar créditos de restablecimiento de cuotas.

## Implementado y conectado a la aplicación

- Migraciones 004, 005 y 006 aplicadas: conexiones cifradas, trabajos persistentes, permisos, avisos de proveedores, supresiones y conciliación de cobros. Todas las tablas de empresa tienen RLS forzado.
- Integraciones: configuración cifrada de Resend, WhatsApp, Stripe y OpenAI, control exclusivo del propietario, claves que no se devuelven al navegador, pausa automática al sustituirlas y versión de configuración vinculada a cada trabajo.
- Permisos de contacto: registro de autorización por cliente/canal y evidencia. Bajas, rebotes y quejas prevalecen sobre el permiso manual.
- Automatizaciones: reglas estructuradas de inactividad de presupuestos u oportunidades que crean tareas y notificaciones. Dedupe por regla, origen y versión; avance por lotes; comprobación de actividad y permisos al ejecutar. Las antiguas tarjetas de ejemplo siguen identificadas como plantillas sin motor.
- Inbox: borradores, aprobación expresa, cola y estados de entrega. Email de texto plano; WhatsApp mediante plantilla aprobada sin parámetros. Recepción de texto y bajas; avisos firmados de entrega.
- IA: borrador mediante Responses API, sin herramientas ni envío automático; persistencia del texto, modelo, consumo y coste estimado según tarifas configuradas. URL individual de cada generación, aunque deje de estar entre las últimas 100.
- Stripe: enlace Checkout para una factura, importe y moneda calculados en servidor. Solo un evento firmado y conciliado confirma el cobro; la URL de retorno no modifica facturas. Idempotencia, importes comprobados y duplicados sin segundo asiento.
- Ejecuciones: historial, fallos, estados inciertos, enlaces y resultados; cancelación únicamente antes del primer intento; conciliación manual auditada de avisos en revisión.
- Webhooks: firmas sobre cuerpo original, límite de 256 KB, deduplicación, payload cifrado y borrado al procesarlo. Reintentos con espera; revisión tras 20 intentos o 7 días. Los avisos pendientes no bloquean los siguientes.
- Worker separado: arranque oculto, prevención de duplicados, parada ordenada, recuperación conservadora de interrupciones y comprobación de actividad. Usa el rol de aplicación y una lista explícita de empresas.
- Preparación de despliegue: Dockerfile y compose de web/worker; comprobación que rechaza claves de ejemplo, credenciales administradoras, empresas demo y conexiones sin TLS. Seed bloqueado en producción y login sin credenciales demo en la versión de producción.
- Redis: una conexión compartida también en producción, con coordinación de peticiones simultáneas.

## Estado local

Aplicación: http://localhost:3000. El motor está iniciado con los servicios externos desactivados. Se ha creado desde la interfaz la regla «Seguimiento de presupuestos tras 3 días»; crea tareas cuando se cumple el plazo. No se han alterado fechas de clientes para forzar ejecuciones. Las pruebas usan una empresa efímera y eliminan únicamente sus datos.

## Verificación

47 pruebas automatizadas: 11 unitarias, 8 PostgreSQL/Redis y 28 de motores. Tipos, lint y build pasan. Incluyen firmas, aislamiento, lotes de más de 100, permisos revocados, destinatario cambiado, bajas, cambio de conexión, leases, concurrencia, pagos duplicados y cantidades incorrectas. Adaptadores probados con transporte simulado: ninguna llamada externa.

Arranque/parada/reinicio y heartbeat del worker comprobados. HTTP comprueba sesión, origen, cookies y revocación. Se probó desde el navegador crear una regla, procesarla y rechazar una solicitud de IA con servicios externos apagados.

## Siguiente trabajo, en orden

1. Ampliar flujos de negocio y suscripción SaaS de Revenia, separada de los cobros de facturas de cada empresa. No compartir claves ni confundir suscripciones con los enlaces Checkout existentes.
2. Alta real de empresas y usuarios, invitaciones, MFA y recuperación de cuenta; revisión de permisos de lectura de cada módulo y prueba completa por rol.
3. Probar cuentas sandbox de los cuatro proveedores cuando existan: entrega/recepción, versión Graph y plantillas, eventos Stripe reales y generación IA. Las pruebas locales no sustituyen esa validación.
4. Crear y verificar copias y restauraciones, rotación de claves, retención/exportación/borrado, límites por plan y presupuesto de proveedores, monitorización externa, protección de webhooks en el proxy y auditoría de seguridad independiente.
5. Construir y ejecutar la imagen de contenedor en staging, fijar digest del runtime, crear base limpia sin ejemplos y practicar rollback. La plantilla Docker no ha sido construida ni desplegada en esta sesión.
6. Dominio, identidad del operador, condiciones y privacidad con datos reales; revisión legal antes del lanzamiento. No inventar datos ni afirmar cumplimiento por haber añadido controles técnicos.
7. OAuth de Google/otras fuentes, archivos, firma digital y requisitos fiscales de facturación siguen pendientes.

## Operación

- `npm run test:all:docker`: comprobación completa con los servicios locales.
- `npm run worker:local -- --once`: un ciclo, con WORKER_TENANT_IDS configurado.
- `start-worker.ps1` / `stop-worker.ps1`: inicio y parada local sin perder trabajos.
- `npm run check:deployment`: validación técnica con variables reales ya cargadas; falla deliberadamente con configuración local.
- `src/scripts/check-worker.ts`: comprueba actividad reciente de todas las empresas configuradas.

No repetir a ciegas un envío incierto. Comprobar primero el registro del proveedor; WhatsApp e IA no tienen reintento automático. Email y Checkout usan idempotencia con una ventana interna máxima de 6 horas. Cambiar credenciales invalida trabajos vinculados a la versión anterior.

Más detalles de activación y límites en PROVIDER_OPERATIONS.md y RELEASE_READINESS.md.
Cierre del bloque: última lectura de saldo 747,586485; descenso observado desde la autorización de 251,017325 créditos. Se detiene con margen respecto al máximo de 300. Las 47 pruebas y el build final pasan; worker local activo, proveedores apagados y consola de Ejecuciones abierta. Retomar por la lista de trabajo pendiente, sin repetir la implementación ya terminada.

