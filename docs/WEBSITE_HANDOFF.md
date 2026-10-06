# Web comercial local — 9 septiembre 2026

Portada en http://localhost:3000/, demo en /#demo, planes en /#planes y aplicación existente en /dashboard.

Incluye presentación del CRM, servicios, cuatro planes, demo interactiva de pipeline, seguimientos e IA, calculadora por licencias y periodo, seguridad y preguntas frecuentes. El diseño adapta las referencias de Revenia con colores violeta y azul oscuro, navegación y tarjetas responsivas.

La demo utiliza datos ficticios y estado local del navegador: no modifica empresas, permisos, suscripciones ni tareas reales. Los botones de seguimiento y borrador producen ejemplos ilustrativos. Los accesos al CRM conservan la autenticación existente.

Precios orientativos de las referencias: 29/79/149/299 euros por persona y mes. El anual multiplica por 12 sin descuento. Tarifas, impuestos y alcance se deben confirmar antes del lanzamiento. Funciones futuras y validación pendiente de proveedores se identifican en la página. No hay contratación activa ni publicación externa. La portada incluye noindex.

Verificación: typecheck, lint y build completados correctamente. Navegador: los cuatro selectores cambian capacidades; Starter excluye IA; Pro muestra borrador y crea seguimiento de ejemplo; tres licencias Pro muestran 237 euros mensuales y 2844 anuales. Revisión visual de escritorio a 1440 px y precios en móvil a 390 px, sin desbordamiento horizontal observado. No se ha repetido la batería de motores porque este cambio no modifica el backend.

Archivos principales: src/app/page.tsx, src/app/marketing.css y src/components/marketing-site.tsx. El trabajo pendiente de lanzamiento y suscripciones continúa documentado en RELEASE_READINESS.md y BILLING_HANDOFF.md.

Comprobaciones finales: navegación desde Configuración → Plan y uso hasta la demo y retorno al dashboard verificados con sesión existente. Accesos añadidos en billing-summary.tsx. El menú móvil se cierra al elegir un enlace. Preguntas frecuentes desplegables y límite Starter de cinco licencias comprobados. El importe anual máximo Enterprise cabe a 320 px. Consola sin errores observados; typecheck y lint repetidos correctamente después de estos ajustes.
