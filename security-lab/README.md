# Revenia Security Lab

Cuatro escenarios sintéticos independientes del CRM. No usan su base de datos, secretos, usuarios, red ni sesiones. La SQLite en memoria solo contiene dos filas ficticias. No importar este código en `src`.

## Reproducir y verificar

`npm run test:lab` ejecuta las variantes vulnerables y corregidas en un puerto efímero ligado a 127.0.0.1. No inicia servicios persistentes. Para observación manual: `docker compose -f security-lab/compose.yml --profile lab up --build -d`; detener con el mismo comando acabado en `down`. El perfil no se activa en el Compose del producto. Cada reinicio restablece los fixtures; no hay volúmenes que borrar.

| Caso | Causa | Reproducción y evidencia | Corrección / regresión |
|---|---|---|---|
| LAB-01 IDOR/BOLA | Consulta por identificador sin tenant | La fixture del actor A obtiene B-1 en vulnerable/idor | secure/idor exige tenant A y devuelve 404 para B-1 |
| LAB-02 XSS | HTML de entrada sin escape | vulnerable/xss refleja el script de la fixture | secure/xss escapa caracteres y aplica CSP sin scripts; test de respuesta, no prueba de ejecución de navegador |
| LAB-03 SQLi | Concatenación de texto en consulta | Fixture devuelve ambas filas con la entrada adversa del test | Parámetros vinculados y ámbito A, devuelve cero filas |
| LAB-04 consumo | Operación sin cuota | Cuatro peticiones vulnerables aceptadas | Tres aceptadas y cuarta rechazada con 429; límite didáctico restablecido al reiniciar |

Guardar salida con versión de Node, fecha y revisión del código. Las pruebas son locales y de bajo volumen. El laboratorio solo demuestra esas diferencias; no prueba que toda la aplicación sea segura. En el producto hay pruebas independientes con PostgreSQL/RLS y Redis.

## Contención

Red Docker interna sin salida y sin conexión al backend. Puerto host solo en loopback. Sin mounts, secretos ni socket Docker; usuario no root, rootfs de solo lectura, capacidades eliminadas y recursos limitados. El servidor no implementa destinos arbitrarios ni clientes de red. `.dockerignore` y la selección de archivos de publicación excluyen el laboratorio. Nunca exponerlo con túneles o despliegues públicos.
