# ADR-001 · Mantener Next.js como monolito modular
Estado: aceptado · 2026-10-06

Contexto: Revenia ya tiene servicios de dominio, PostgreSQL, worker e interfaz React. Reescribir en NestJS no añade valor funcional inmediato.

Decisión: mantener Next.js/TypeScript, componentes de servidor y acciones finas; exponer REST sobre los mismos servicios de clientes/tareas. Separar dominio, contratos, persistencia, seguridad, delivery y UI en src/lib. El worker procesa operaciones duraderas fuera de la petición web.

Alternativas: API NestJS separada, microservicios y monorepo. Se descartan por duplicar despliegue, autenticación y coordinación sin evidencia de carga.

Consecuencias: menor coste de operación; deben evitarse dependencias de Next en el dominio. Extraer un servicio solo ante necesidades de escalado, equipos o consumidores independientes medidas. Redis se justifica por contadores distribuidos de seguridad; la cola durable existente permanece en PostgreSQL.
