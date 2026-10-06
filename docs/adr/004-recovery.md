# ADR-004 · Recuperación por outbox con consumo atómico
Estado: aceptado · 2026-10-06

Request y envío se separan: respuesta 202 uniforme a correos conocidos/desconocidos, con cuotas globales y por correo. No se promete igualdad temporal perfecta. No se confía en X-Forwarded-For sin un proxy controlado.

Token aleatorio de 32 bytes; almacenamiento SHA-256, 30 minutos, versión de sesión al emitir y bloqueo del usuario al consumir. Un cambio válido invalida todos sus tokens pendientes y sesiones. El enlace usa fragmento, que el navegador retira al cargar; no va en la consulta ni se registra en logs.

El correo pendiente se cifra con AES-GCM y contexto específico. Funciones SQL estrechas administran identidad global; el rol web no tiene acceso directo a la tabla. Outbox: lease de un minuto, máximo tres intentos, eliminación del payload al terminar y limpieza de expirados al procesar. Resend usa idempotencia estable por mensaje. Mailpit es solo local.

Producción: requiere RECOVERY_MAIL_PROVIDER=resend, clave/remitente propios y EXTERNAL_OPERATIONS_ENABLED=true; en su ausencia se oculta el enlace de login y se rechaza la solicitud. No se ha probado un envío real. La rotación de clave necesita tratar payloads pendientes; las peticiones no entregadas caducan. Una nueva solicitud legítima permite recuperarse.

Pendientes antes de datos sensibles: verificación de correo, MFA/reauth reforzada y revisión de parámetros de hashing. Los tokens de reset no son sesiones nuevas.
