# Operación local y web de facturas — 10 septiembre 2026

## Decisión de arquitectura

Los motores de negocio siguen en Node.js y PostgreSQL: conservan las colas persistentes, los permisos, las reservas de uso y el aislamiento por empresa. Reescribirlos en PowerShell no demuestra una mejora de rendimiento y añadiría dependencia de Windows. PowerShell sirve de entrada cómoda al motor de operaciones portable de Node.js. No se ha medido ni anunciado una aceleración del procesamiento de negocio.

## Comandos

Desde la carpeta de Revenia:

| Windows | Equivalente portable | Resultado |
|---|---|---|
| `.\REVENIA.ps1 Estado` | `npm run ops:doctor` | Revisa Node, archivos necesarios y salud de localhost sin mostrar secretos |
| `.\REVENIA.ps1 Verificar` | `npm run ops:verify` | Tipos, lint, compilación, 108 pruebas existentes y 5 de empaquetado; registra huella de las fuentes |
| `.\REVENIA.ps1 Preparar` | `npm run ops:prepare` | Crea una carpeta nueva en releases, con manifiesto SHA-256, si las fuentes siguen verificadas |
| `.\REVENIA.ps1 Iniciar` | Utilizar arranque local existente | Inicia el entorno de desarrollo de Windows |

Verificar requiere dependencias instaladas, PostgreSQL y Redis locales encendidos. Los adaptadores de proveedor de las pruebas son simulados. En una máquina nueva se necesita Node.js 24 y ejecutar npm ci. Si PowerShell está restringido, usar los comandos npm; no hace falta desactivar la política del sistema.

Preparar no publica, no crea infraestructura, no activa Stripe y no inicia servicios. El artefacto es código fuente local, no una imagen de producción validada. No contiene .env, volúmenes, historial Git, registros ni backups. Se seleccionan únicamente src, public, database, ops y archivos concretos de compilación. Rechaza enlaces simbólicos y ciertos formatos de credenciales. El escáner es heurístico y no sustituye revisar el contenido antes de transferirlo. Las pruebas y el seed de demostración permanecen como código: nunca ejecutar seed en producción.

La huella excluye next-env.d.ts, generado por Next.js y regenerado durante build. Los artefactos releases se excluyen de TypeScript, ESLint, Git y Docker para que no se compilen, publiquen o copien recursivamente. Si se modifica el código, preparar exige verificarlo otra vez. El manifiesto aporta integridad local, no una firma externa ni una certificación de seguridad.

## Nueva web comercial

http://localhost:3000/ — portada editorial de facturas, cobros y automatización, con tonos verde/crema, demostración de tres pasos y calculadora de carga administrativa. Se conserva el CRM en /dashboard y la comparativa interactiva en /#demo y /#planes. No hay telemetría, formularios externos ni contratación nueva.

La demo de facturas usa datos ficticios: detectar → preparar → comprobar. El último paso resta 3.250 euros de un pendiente ilustrativo de 12.500. No consulta ni modifica la base de datos. La calculadora multiplica facturas por minutos y divide entre 60; no presenta esas horas como ahorro garantizado.

Las secuencias automáticas por vencimiento de factura siguen en preparación, señaladas en la página. Gestión local de facturas y motores de seguimiento comercial existentes no equivalen a facturación fiscal certificada. Continúan pendientes todos los bloqueos de RELEASE_READINESS.md.

## Orientación comercial y evidencia

Se prioriza control de facturas/cobros, recuperación de presupuestos y seguimiento con contexto. Es una decisión de posicionamiento, no un ranking acreditado de ventas en España. Stripe presenta generación de facturas, cobro y conciliación como usos de automatización: https://stripe.com/invoicing . El informe QuickBooks 2025 documenta retrasos de cobro en pequeñas empresas estadounidenses: https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2025/ . No extrapolamos sus cifras a España ni anunciamos resultados de Revenia basados en ellas.

## Verificación

113 pruebas completas, tipos, lint y build pasaron durante la implementación. Navegador: recorrido de factura y cálculo 120 facturas × 10 minutos = 20 horas comprobados; versión móvil revisada sin desbordamiento horizontal a 390 px. Para saber si una copia concreta corresponde a la última verificación, consultar su RELEASE-MANIFEST.json y la huella registrada.

Entrega final: releases/revenia-2026-09-10T16-31-33-121Z-03957ef936. Copia y manifiesto verificados automáticamente. Se comprobó además el rechazo real de preparar después de cambiar una fuente y el diagnóstico mediante REVENIA.ps1 Estado. Selector anual revisado en móvil con contraste corregido; consola sin errores observados. No se ha construido la imagen Docker ni publicado el artefacto.
