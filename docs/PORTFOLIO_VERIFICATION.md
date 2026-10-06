# Evidencia de verificación · 2026-10-06

## Ejecutado localmente
- TypeScript y ESLint: superados.
- Contrato OpenAPI: prueba independiente superada para operaciones, seguridad y errores.
- Compilación Next.js: superada después de actualizar Next/eslint-config-next a 16.3.8.
- Suite previa test:all:docker: superada, incluyendo aislamiento, cuentas, auditoría, motores, suscripciones, avisos y facturas.
- test:portfolio: 11 pruebas superadas. Contratos; acceso cruzado; edición simultánea; archivo sin perder relaciones; API sin sesión/CSRF/cuerpo excesivo; destinos del scanner; deduplicación/cierre; reset concurrente; expiración; respuesta uniforme; transporte desactivado/idempotente.
- test:lab: cinco pruebas superadas para cuatro escenarios y límites del servidor.
- E2E Chromium: cinco pruebas superadas. Alta/edición API con persistencia, conflicto y origen hostil; scanner e informe; pantallas a 390 px; controles nombrados y foco de teclado; recuperación y revocación.
- Accesibilidad smoke: controles visibles con nombre accesible y foco de teclado contrastado verificados en Chromium; la auditoría WCAG formal sigue pendiente.
- Worker web: `GET /api/cron/worker` compilado, protegido por `CRON_SECRET` y rechazo anónimo comprobado con HTTP 401. El ciclo no se ejecuta sin `WORKER_TENANT_IDS` válido.
- Restore local: superado. Copia consistente restaurada en base nueva, recuentos y RLS comparados y cadenas de dos empresas verificadas.
- npm audit --omit=dev: cero avisos en esa consulta. No equivale a una revisión integral.

El test de edición descubrió defaults aplicados incorrectamente a PATCH; se eliminan del esquema parcial y se prueba que importe y relación permanecen. El E2E móvil descubrió desbordamiento; se corrigieron contenedores, búsqueda y navegación plegable. Son regresiones cubiertas, no resultados simulados.

## Archivos reproducibles
- src/lib/domain/portfolio.integration.test.ts
- e2e/portfolio.spec.ts y playwright.config.ts
- security-lab/lab.test.mjs
- ops/restore-drill.mjs
- .github/workflows/ci.yml y codeql.yml

Capturas privadas generadas en .revenia/security-center-desktop.png y .revenia/portfolio-mobile.png. Datos sintéticos de E2E; las cuentas se eliminan al finalizar. Los tokens de recuperación no se guardan en trazas.

## No verificado
Ejecución remota GitHub/CodeQL, despliegue público, certificados/TLS, Secure cookie bajo HTTPS real, entrega real Resend, Stripe/WhatsApp/OpenAI reales, carga sostenida, auditoría formal WCAG, anclaje externo de auditoría y backup externo. Los checks locales no sustituyen estos ensayos.
