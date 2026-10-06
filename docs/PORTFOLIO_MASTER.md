# Revenia · Especificación aplicada y estado de entrega

Actualización: 6 de octubre de 2026. Referencia: Especificación maestra de portfolio para Codex, 26 páginas.

## Producto y alcance
Revenia conserva su nombre: es corto, reconocible y coherente con recuperación comercial. No se ha comprobado disponibilidad de marca o dominio. Su propuesta es gestionar clientes, presupuestos, seguimientos y cobros con aislamiento entre empresas y evidencia operativa.

El objetivo de portfolio es demostrar decisiones, pruebas y capacidad de explicar límites. No implica un título de senior, certificación OWASP ni ausencia de vulnerabilidades. No se incorporan tecnologías únicamente para ampliar el listado: React/Next.js y TypeScript ya resuelven la interfaz y el servidor; NestJS queda como alternativa documentada, no como duplicación del backend.

## Ampliación incorporada
- Clientes: listado con búsqueda/paginación, alta, edición con control de versión y archivo lógico; auditoría transaccional. El archivo conserva relaciones.
- Tareas: creación, edición, finalización y reapertura; control de versión y enlace a la factura relacionada. Los campos omitidos en PATCH se conservan.
- API REST privada: contratos estrictos, DTO sin tenant ni secretos, OpenAPI 3.1, errores estructurados, permisos, Origin, cuotas en Redis y límite de cuerpo.
- Security Center: ejecuciones persistentes, reglas versionadas, evidencia, hallazgos deduplicados, seguimiento y aceptación temporal motivada. Solo una comprobación superada resuelve un hallazgo.
- Scanner interno: dos rutas fijas, conexión a loopback literal, sin DNS ni redirecciones; comprueba cabeceras, sesión obligatoria, privilegios del rol, RLS y auditoría. Los controles no observados figuran «sin evaluar».
- Security Lab: cuatro escenarios vulnerables/corregidos, datos ficticios en memoria, cinco pruebas, activación explícita y composición aislada. Excluido de la imagen y del paquete de producción.
- Acceso: recuperación por correo con token de 256 bits, huella en base de datos, payload cifrado, 30 minutos, consumo atómico, invalidación de sesiones y respuesta uniforme. Outbox con lease y tres intentos; transporte Mailpit local y adaptador Resend apagado hasta configurar y activar.
- Observabilidad: identificador de petición, logs API sin cuerpos ni credenciales, latencias y errores por ruta, endpoints de vida/disponibilidad y métricas protegidas.
- Operación: migraciones 018 y 019, construcción Docker, CI preparada, CodeQL preparado, dependencias fijadas, pruebas E2E, ensayo de restauración y ciclo de worker acotado para cron.
- UX: navegación móvil plegable, estados vacíos/error/carga, etiquetas y foco visible.

## Arquitectura y decisiones
Ver [arquitectura](ARCHITECTURE.md), [ADRs](adr/README.md), [amenazas](THREAT_MODEL.md), [operación](PORTFOLIO_OPERATIONS.md) y [verificación](PORTFOLIO_VERIFICATION.md).

## Criterios del PDF
| ID | Aplicación a Revenia | Estado/evidencia |
|---|---|---|
| AC-01 | Cliente → edición; scanner → evidencia; recuperación → nuevo acceso | Tres recorridos E2E ejecutados; tareas y facturas tienen integración |
| AC-02 | Entorno limpio con migración/seed/arranque | Docker local verificado; CI define base vacía. Ensayo completo desde clon remoto pendiente |
| AC-03 | RBAC servidor, RLS y FK por empresa | Suites existentes + accesos cruzados y denegación de escritura |
| AC-04 | Migraciones aditivas, archivo y versión | 018/019 aplicadas; edición/reset simultáneos y restauración probados |
| AC-05 | REST/OpenAPI coherentes | Esquemas Zod compartidos y HTTP E2E. Validador independiente de OpenAPI superado |
| AC-06 | Escritorio/móvil/acceso por teclado | E2E 1440 y 390 px; controles nombrados y foco de teclado verificados. Auditoría formal WCAG pendiente |
| AC-07 | CI sobre revisión publicada | Workflow preparado; esta carpeta no tiene repositorio Git ni ejecución remota |
| AC-08 | Amenazas, revisión y dependencias | Producción: auditoría npm sin avisos en la comprobación local. Herramientas dev: cinco avisos altos relacionados; ver excepciones. Revisión independiente pendiente |
| AC-09 | Diagnóstico y recuperación | Logs/métricas locales, restore probado y ciclo de worker protegido; alertas externas y retención de producción pendientes |
| AC-10 | Cuatro escenarios aislados | Cinco pruebas de laboratorio superadas; no se publica el código vulnerable |
| AC-11 | Scanner acotado y cierre verificable | Pruebas de destinos, persistencia, deduplicación y cierre; ejecución real desde navegador |
| AC-12 | Entrega explicable | Documentación, ADRs, demo y limitaciones disponibles; publicación y proveedores pendientes |

## Roadmap con puertas de calidad
1. Base: inventario, conservar negocio, migraciones aditivas. Cerrado localmente.
2. Flujo vertical: clientes/tareas + API y concurrencia. Cerrado en el alcance descrito.
3. Seguridad: amenazas, auth, recuperación, RLS, cabeceras, límites. Verificado localmente; MFA y política de contraseñas quedan para la puerta de producción.
4. Evidencia: laboratorio y Security Center. Cerrado en alcance local; no sustituye pentest.
5. Entrega: CI, análisis estático, artefactos y prueba desde clon limpio. Archivos preparados; falta ejecutar en GitHub y fijar protección de rama.
6. Producción: dominio/TLS, secretos propios, backup externo cifrado con retención, alertas, correo real y pruebas de proveedores en sandbox. No activado.
7. Portfolio público: demo de datos ficticios, vídeo de tres flujos, capturas, costes observados y revisión técnica independiente.

Las integraciones de mensajes, IA y pagos existentes conservan su estado. No se han realizado cobros, envíos reales ni llamadas de IA. Alta pública de empresas, OAuth, adjuntos, firma, fiscalidad y otras ampliaciones necesitan alcance propio y no se presentan como implementadas.

## Uso con Codex
Para continuar en este proyecto: leer este documento y PROJECT_STATUS.md; inspeccionar código, instrucciones y estado real; elegir una puerta pendiente y producir evidencia. No reescribir la aplicación ni añadir microservicios sin medir una necesidad.

Para adaptar a un proyecto nuevo: sustituir [NOMBRE], [DOMINIO], [USUARIOS], [TRES_FLUJOS], [TENANCY], [DATOS_SENSIBLES], [PRESUPUESTO_MENSUAL], [HOSTING] y [RESTRICCIONES]. Elegir un único backend y justificar Redis. Para completar otro existente: inventariar primero y conservar datos/contratos útiles.

### Prompt de continuación
Continúa Revenia tomando docs/PORTFOLIO_MASTER.md y PROJECT_STATUS.md como especificación y estado, y verifica ambos contra el código. Prioriza una puerta pendiente con valor real. Conserva datos y comportamientos existentes; no actives proveedores ni publiques sin autorización. Implementa un flujo completo con validación, autorización, aislamiento, pruebas pertinentes, UX y documentación. Distingue implementado, probado localmente, configurado y pendiente. No inventes resultados, métricas, capacidades ni nivel profesional. Registra decisiones y limitaciones; no añadas NestJS, microservicios o nuevas dependencias sin justificar el coste. Antes de declarar la entrega, ejecuta las comprobaciones aplicables y enlaza evidencia de esa revisión.
