# Arquitectura de seguridad

## Principios

1. Toda operación parte de una sesión validada en el servidor.
2. Toda lectura o escritura empresarial exige un `tenantId` obtenido de la sesión, nunca de un campo libre del navegador.
3. El permiso se comprueba en la capa de aplicación antes de acceder al repositorio.
4. La utilidad de cifrado AES-256-GCM vincula el cifrado al tenant y al tipo de campo. Su integración en los campos persistidos está pendiente.
5. Las contraseñas se derivan con scrypt, sal aleatoria y comparación en tiempo constante.
6. Las acciones críticas generan registros de auditoría encadenados para detectar modificaciones.

## Flujo autorizado

`Petición → sesión → empresa → permiso → validación → dominio → repositorio → auditoría`

La interfaz no concede permisos. Ocultar un botón mejora la experiencia, pero el servidor vuelve a verificar todas las condiciones.

## Controles implementados

- Sesiones opacas de 256 bits; PostgreSQL conserva únicamente el hash SHA-256, la expiración, la versión y la revocación.
- Cookies HttpOnly, SameSite Strict y Secure en producción.
- Validación estricta de la entrada de login.
- Comprobación del origen en mutaciones de autenticación.
- Limitación atómica de intentos por cuenta en Redis, con claves anonimizadas.
- RBAC centralizado.
- Aislamiento multiempresa en la aplicación y políticas PostgreSQL Row Level Security forzadas para el rol restringido.
- AES-256-GCM integrado en credenciales de proveedores y payloads de webhooks, con contexto de empresa y proveedor. Los campos generales del CRM todavía no tienen cifrado por campo.
- Content Security Policy diferenciada por entorno, HSTS en producción y cabeceras defensivas.
- Auditoría encadenada con SHA-256.

## Límites conocidos de esta fase

- PostgreSQL y Redis están operativos y sus ocho pruebas de integración pasan en el entorno local.
- La página de auditoría exige el permiso `security:read`; cada mutación valida su permiso en el servidor. Falta ampliar la cobertura de todas las combinaciones de rutas y roles.
- No se publica una puntuación de seguridad ni se afirma cumplimiento normativo a partir de estos controles.
- Las contraseñas y secretos incluidos son exclusivamente locales y deben sustituirse antes de cualquier despliegue.
- La CSP aún permite scripts inline necesarios para la hidratación actual de Next.js; retirar esa excepción requiere nonces por petición.
- No existe todavía MFA, recuperación de cuenta ni integración SSO.
- Esta entrega no se ha desplegado ni usa servicios externos.

## Próximo bloque de seguridad

Integrar almacenamiento cifrado de campos y claves por empresa, MFA TOTP, recuperación de cuenta, anclaje externo de auditoría y pruebas completas de autorización. La revocación y rechazo de cookies cerradas se comprueban mediante `src/scripts/check-http.ts`.


## Cuentas y auditoría incorporadas

Mi cuenta permite cambiar contraseña, cerrar otras sesiones y cambiar de empresa con renovación del token. Equipo permite invitaciones de un solo uso, roles y retirada de acceso. Las acciones sensibles requieren la contraseña actual y tienen límite de intentos. Los propietarios y el acceso propio no se pueden modificar desde esta gestión.

La pertenencia y el rol se vuelven a consultar al validar sesiones. Los disparadores de PostgreSQL revocan sesiones al cambiar roles, retirar miembros, cambiar contraseña o deshabilitar usuarios. La aceptación de una invitación no reinicia la contraseña de una cuenta existente. La entrega manual del enlace no verifica por sí sola la titularidad de su buzón.

El verificador persistente utiliza una instantánea de solo lectura y distingue contenido canónico v2, continuidad histórica v1, verificación parcial y discrepancias. No se afirma verificación completa de contenido para registros antiguos ni protección frente al borrado del final por un administrador. Documentación y evidencia: ACCOUNT_HANDOFF.md.


## Suscripciones y reservas

Las migraciones 012–015 añaden RLS a cuentas, reservas, vinculaciones y avisos de facturación. Solo el operador vincula identidades Stripe. El backend puede conciliar la vinculación exacta mediante funciones restringidas y no expone esas funciones como acciones públicas de asignación de plan. La reserva de uso se serializa por empresa y conserva idempotencia por ejecución. El motor exige suscripción en producción y limita a 24 horas la autorización renovada mediante Stripe. Las notificaciones firmadas solo adelantan una consulta; no conceden acceso desde metadata. Alcance y tareas pendientes: BILLING_HANDOFF.md.
