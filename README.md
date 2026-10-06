# Revenia

CRM de recuperación de presupuestos y seguimiento comercial. Interfaz basada en las referencias aportadas por Sergi, con Next.js, PostgreSQL, Redis y motores persistentes separados.

## Ampliación de portfolio · octubre de 2026

[Especificación aplicada y criterios](docs/PORTFOLIO_MASTER.md) · [Verificación](docs/PORTFOLIO_VERIFICATION.md) · [ADRs](docs/adr/README.md) · [Modelo de amenazas](docs/THREAT_MODEL.md) · [Operación](docs/PORTFOLIO_OPERATIONS.md).

API REST/OpenAPI, clientes y tareas editables con control de versión, Security Center con scanner interno, laboratorio aislado, recuperación de acceso, pruebas de navegador y restauración local. Mantiene el stack existente y el nombre Revenia. Requiere las migraciones hasta 019.

## Desarrollo local

Antecedente: [avisos de factura](docs/INVOICE_NOTICE_HANDOFF.md). Para esta revisión aplica todas las migraciones pendientes con npm run db:migrate.

Último avance: [motor real de seguimiento de facturas](docs/INVOICE_ENGINE_HANDOFF.md), con regla de vencimiento, tareas vinculadas y 120 pruebas completas en la verificación de operaciones.

Nuevo: [operación simplificada y rediseño de facturas](docs/OPERATIONS_HANDOFF.md). `REVENIA.ps1 Estado`, `Verificar` y `Preparar` facilitan las comprobaciones y la copia local para publicación futura, sin desplegar nada.

Web comercial: [demo pública en Vercel](https://revenia-secure-crm.vercel.app/) · Demo de planes: `/#demo` · CRM: `/dashboard`. La presentación y la calculadora son ilustrativas, sin contratación activa. El despliegue público muestra la web comercial; el CRM requiere configurar PostgreSQL/Redis y secretos de producción antes de activar cuentas reales. Consulta [estado de la web](docs/WEBSITE_HANDOFF.md).

Ejecutar `INICIAR_REVENIA.cmd` para preparar servicios, migraciones, datos locales sin sobrescribir registros existentes y worker. Aplicación en http://localhost:3000 y Mailpit en http://localhost:8025. Los mensajes comerciales utilizan Resend al activarse; la recuperación de acceso admite Mailpit local mediante npm run recovery:mail:local.

Los datos y credenciales incluidos son demostraciones locales. Los servicios externos permanecen apagados. El propietario puede preparar credenciales cifradas en Integraciones y autorizaciones en Permisos de contacto.

## Funcionalidad incorporada

19 secciones para el propietario de navegación, CRM persistente, métricas desde la base de datos, borradores de mensajes con aprobación, reglas de inactividad que crean tareas, adaptadores de Resend/WhatsApp/OpenAI/Stripe, avisos firmados y conciliación, historial de ejecuciones y control de errores inciertos.

Sesiones opacas revocables, cookies protegidas, contraseñas scrypt, RLS forzado, permisos por rol, secretos y eventos cifrados con AES-GCM, auditoría encadenada y limitación de login en Redis. La comprobación de producción rechaza configuración demo o conexiones sin TLS.

Mi cuenta incorpora contraseña, sesiones y cambio de empresa; Equipo incorpora invitaciones, roles y retirada de acceso; Seguridad verifica la auditoría persistente. Consulta [el nuevo punto de continuación](docs/BILLING_HANDOFF.md).

Las conexiones externas aún no se han validado con cuentas reales. Siguen pendientes la contratación inicial de la suscripción, OAuth de Google, firma, fiscalidad, alta pública de empresas, MFA y privacidad operativa. La recuperación se ha probado localmente; backups externos, retención y entrega de correo real necesitan configuración. Véase [estado del proyecto](PROJECT_STATUS.md).

Control de suscripciones incorporado: reservas de uso sin duplicación, licencias de equipo, sincronización con Stripe y avisos firmados. La contratación inicial y el portal todavía necesitan orquestación persistente antes de exponerlos al usuario.

## Verificar y operar

```powershell
npm run test:all:docker
```

Incluye tipos, lint, compilación y 108 pruebas con PostgreSQL/Redis activos. Las pruebas de proveedores utilizan transporte simulado y una empresa efímera.

```powershell
.\start-worker.ps1
.\stop-worker.ps1
```

La parada conserva trabajos y espera a la operación activa. `stop-dev.ps1` detiene también los servicios locales sin borrar sus volúmenes.

Para un ciclo aislado del worker, configurar WORKER_TENANT_IDS y ejecutar `npm run worker:local -- --once`. No activar EXTERNAL_OPERATIONS_ENABLED hasta preparar y autorizar las cuentas correspondientes.

## Publicación futura

`Dockerfile`, `compose.production.yml` y `.env.production.example` preparan web y worker con servicios administrados. La imagen todavía necesita construcción y pruebas en staging. No publicar el entorno demo. `npm run check:deployment` comprueba variables, rol de base de datos, RLS y conectividad con la configuración real ya cargada.

Consulta [operación de proveedores](docs/PROVIDER_OPERATIONS.md), [preparación de publicación](docs/RELEASE_READINESS.md), [verificación](docs/VERIFICATION.md) y [punto de continuación](docs/ENGINE_HANDOFF.md).

Para una demo pública gratuita y controlada, consulta [la guía de publicación gratuita](docs/FREE_DEPLOYMENT.md). El cron web está preparado para ciclos acotados; el worker Docker sigue siendo la opción adecuada para operación continua.

