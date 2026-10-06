# Modelo de amenazas · Revenia
Revisión 2026-10-06. Alcance: web/API, PostgreSQL, Redis, worker, recuperación y scanner local. Laboratorio separado. No es una certificación.

## Activos y límites de confianza
Credenciales y sesiones; datos comerciales de cada empresa; claves de proveedores; integridad de facturas/cobros; auditoría; tokens de recuperación. Límites: navegador → servidor; servidor → datos; worker → proveedores; operador → migraciones/backups. Los administradores de infraestructura son privilegiados: RLS no protege frente a un superusuario.

## Escenarios
| Amenaza / abuso | Control implementado | Evidencia | Riesgo restante |
|---|---|---|---|
| BOLA / leer otra empresa | Sesión servidor, RLS forzado, FK tenant | Integración cruzada | Revisar todas las rutas futuras; RLS no sustituye authz |
| Escalada de rol | RBAC servidor y revocación al cambiar membresía | Suites accounts + API | MFA pendiente |
| CSRF | SameSite Strict, Origin canónico, Server Actions | API E2E con Origin hostil | Proxy debe conservar origen confiable |
| XSS | React escaping y nonce CSP de scripts | Scanner + laboratorio | Estilos inline; revisión de HTML/CSV e integraciones futuras |
| Inyección SQL | Parámetros y validación estricta | Lab SQLi corregido + servicios | Nuevas consultas dinámicas requieren revisión |
| Pérdida de edición | Versión y bloqueo de fila | Carrera de dos PATCH | Otros módulos aún no tienen edición completa |
| Suplantación de webhooks | Firma, timestamp, deduplicación | Suites engines/billing | Verificar claves/proveedores reales |
| Robo de reset | Alta entropía, hash, payload cifrado, caducidad y consumo | E2E + concurrencia | Seguridad del buzón; verificación de correo pendiente |
| Enumeración / abuso reset | Respuesta uniforme; cuotas global/correo | Respuesta conocida/desconocida | El límite global puede causar indisponibilidad; WAF por origen en producción |
| SSRF del scanner | Loopback literal, rutas fijas, no redirect | URL negativas + scan real | No cubre SSRF en futuras integraciones |
| Consumo no acotado | Paginación, 16 KiB, cuota, timeout SQL/sonda | Límites y validación | Prueba de carga/slow clients pendiente |
| Secretos en evidencia | Redacción por diseño, cifrado y exclusiones release | Tests de empaquetado | Heurística de secretos no exhaustiva |
| Alteración de auditoría | Encadenado y verificador | Suite audit + restore | Administrador puede reescribir/truncar; anclaje externo pendiente |
| Caída/pérdida de datos | Vida/disponibilidad, restore a base nueva | Ensayo local | Backup externo, alarmas y recuperación regional pendientes |
| Dependencias comprometidas | Lockfile, actualizaciones y audit runtime | npm audit; CI preparada | Avisos dev abiertos; revisar actualizaciones |

## Dependencias: excepción de desarrollo
El 2026-10-06 la revisión local encontró cero avisos en dependencias de producción tras actualizar Next.js a 16.3.8. La revisión completa notificó cinco avisos altos en la cadena de herramientas eslint-config-next → eslint-plugin-next → fast-glob → micromatch → braces. No se ha aplicado la sugerencia de degradar Next ESLint mediante --force.

Alcance: herramientas de desarrollo/build que no reciben patrones de usuarios de la aplicación. Mitigación: CI efímera sin secretos de producción, entradas controladas, bloqueo de avisos altos de runtime, dependencias fijadas y revisión al recibir parche. Responsable: mantenedor del repositorio. Revisar antes del 2026-10-20 o de publicar, lo que ocurra primero. No se declara que el proyecto completo esté libre de avisos. La ausencia de avisos conocidos no demuestra seguridad del código.

## Referencias
[OWASP API Security](https://owasp.org/www-project-api-security/) · [Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) · [Next.js CSP](https://nextjs.org/docs/app/guides/content-security-policy).
