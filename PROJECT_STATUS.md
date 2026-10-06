# Estado de Revenia

Actualizado el 6 de octubre de 2026. Véase el estado detallado en [PORTFOLIO_MASTER](docs/PORTFOLIO_MASTER.md). Aplicación local con motores persistentes; todavía no lista para lanzamiento público.

| Área | Implementado | Pendiente |
|---|---|---|
| CRM | Clientes, oportunidades, presupuestos, tareas, métricas y búsquedas persistentes | Clientes/tareas tienen edición con versión y archivo de clientes; otros módulos, adjuntos y firma pendientes |
| Mensajes | Borradores aprobados, cola, permisos, adaptadores de email/WhatsApp, recepción y bajas | Validación real de cuentas, adjuntos y plantillas con parámetros |
| Automatizaciones | Reglas de inactividad, tareas, notificaciones, deduplicación y worker | Más disparadores y acciones configurables |
| IA | Generación de borradores, almacenamiento de resultados y estimación de coste | Cuenta/modelo reales y evaluación de calidad |
| Facturas y cobros | CSV, importes de servidor, Stripe Checkout y conciliación firmada | Sistema fiscal, PDF, devoluciones y disputas |
| Integraciones | Credenciales cifradas, versiones, pausas, webhooks e historial | OAuth de Google y otras fuentes; pruebas de proveedores reales |
| Suscripciones SaaS | Plan mostrado en el espacio de trabajo | Contratación y cobro recurrente de Revenia, límites por plan |
| Seguridad | Sesiones revocables, RLS, RBAC, Redis, cifrado de secretos/eventos y auditoría | MFA, alta inicial de empresas, retención de producción y revisión independiente; recuperación y Security Center implementados |
| Cuentas y equipo | Contraseña, sesiones, invitaciones, roles y cambio de empresa | Alta inicial y correo verificado; recuperación probada localmente |
| Auditoría | Huellas canónicas y verificador persistente con RLS | Anclaje externo y tratamiento de formatos históricos |
| Despliegue | Plantilla web/worker, comprobación de configuración y salud | Staging, proxy HTTPS, backup externo y alertas; restore local comprobado |

La suite previa y las nuevas pruebas locales pasan; consultar evidencia y alcance en docs/PORTFOLIO_VERIFICATION.md. HTTP valida autenticación y revocación. Se ha probado desde el navegador crear/procesar una regla y bloquear IA mientras las operaciones externas están apagadas. El motor local está iniciado. No se han realizado cargos, mensajes ni llamadas de IA reales.

Documentos de continuidad:

- `docs/ENGINE_HANDOFF.md`: alcance y tareas siguientes.
- `docs/PROVIDER_OPERATIONS.md`: configuración y funcionamiento.
- `docs/RELEASE_READINESS.md`: condiciones y evidencia pendiente para publicar.
- `docs/VERIFICATION.md`: comprobaciones y límites.

Estado más reciente: `docs/PORTFOLIO_MASTER.md`; historial de facturación en `docs/BILLING_HANDOFF.md`.

Suscripciones: límites y licencias transaccionales, adaptadores de Checkout/portal, conciliación real y notificaciones persistentes implementados. Pendiente orquestar la contratación inicial y validar los flujos en sandbox antes de habilitar botones de pago.
