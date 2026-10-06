# ADR-005 · Evidencia operativa gradual
Estado: aceptado · 2026-10-06

API: logs JSON con ruta estática, método, estado, duración e identificador; sin cuerpos, cookies ni correos. Métricas en memoria por proceso, consultables con security:read. Son diagnóstico local, no una serie temporal persistente ni un SLO medido.

Vida (/api/live) separada de disponibilidad de PostgreSQL/Redis (/api/health). Fallos de dependencias no autorizan acceso. Un despliegue real necesita recolección externa, alarmas y presupuestos de cardinalidad.

CI corre sobre datos sintéticos: tipos, lint, pruebas existentes/nuevas, laboratorio, E2E, auditoría de runtime, construcción Docker y restore. CodeQL se prepara por separado y excluye el laboratorio intencionalmente vulnerable. Dependabot revisa versiones; acciones fijadas por SHA. No hay despliegue automático a una cuenta no configurada.

El ensayo de restore crea una copia consistente y una base nueva; compara filas, FORCE RLS y cadenas de auditoría y elimina solo esa base temporal. Conserva el dump local fuera del release. No equivale a backup externo cifrado, retención ni RPO/RTO contractual.
