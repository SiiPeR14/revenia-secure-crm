# Publicación gratuita controlada

## Alcance

La opción gratuita está pensada para una demo de portfolio con datos propios y sintéticos. No se deben activar cobros, mensajes, IA ni datos personales reales hasta completar la validación de proveedores, privacidad, backups y límites de uso.

La web Next.js puede desplegarse en el [plan gratuito Hobby de Vercel](https://vercel.com/docs/plans/hobby). PostgreSQL y Redis siguen siendo servicios externos: se configuran con TLS, credenciales propias y límites explícitos. [Upstash Redis](https://upstash.com/pricing/redis) ofrece una cuota gratuita limitada, pero el proveedor puede cambiar sus condiciones. Vercel Hobby no mantiene un proceso persistente, por eso este proyecto conserva el worker Docker y añade `GET /api/cron/worker`, protegido por `CRON_SECRET`, para un ciclo acotado diario. El cron no sustituye un worker continuo para una operación comercial real.

## Preparación sin coste

1. Crear un repositorio GitHub público o privado bajo la cuenta personal y subir el contenido de Revenia sin `.env`, volúmenes, capturas privadas ni credenciales.
2. Crear un PostgreSQL compatible con TLS y un Redis compatible con `rediss://`. Aplicar migraciones con `DATABASE_URL` de migración y usar `DATABASE_URL` con el rol restringido en la web.
3. Importar el proyecto en Vercel Hobby y configurar las variables de `.env.production.example`. Generar `SESSION_SECRET`, `FIELD_ENCRYPTION_KEK` y `CRON_SECRET` nuevos; no reutilizar los valores locales.
4. Definir `APP_URL` con el dominio HTTPS de Vercel, `WORKER_TENANT_IDS` solo con empresas de demo y `EXTERNAL_OPERATIONS_ENABLED=false`.
5. Ejecutar el despliegue y comprobar `/api/health`, login, aislamiento entre empresas, Security Center y `/api/cron/worker` desde el panel de logs.
6. Mantener el proyecto pausado o eliminarlo si se alcanzan los límites gratuitos. No añadir tarjeta ni activar un plan de pago para esta demo.

## Puerta antes de compartir el enlace

- Base vacía migrada y sin usuario/contraseña de demostración en el HTML.
- `npm run test:all:docker`, `npm run test:e2e` y `npm audit --omit=dev` superados.
- `npm run check:deployment` superado con secretos propios, TLS, límites y origen HTTPS.
- Backups externos y restauración comprobados antes de almacenar información real.
- Correo, Stripe, WhatsApp y OpenAI permanecen apagados hasta validar sus cuentas y permisos.

La disponibilidad y los límites de cada proveedor pueden cambiar. La fuente operativa debe ser siempre la consola y la documentación vigente del proveedor antes de activar el enlace público.
