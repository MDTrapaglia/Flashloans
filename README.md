# flashloans

Herramientas para inspeccionar actividad reciente de flash loans ejecutada sobre el pool de Aave v3 usando la API de Alchemy.

## Requisitos

- Node.js >= 18 (se usa `fetch` nativo y módulos ES).
- Una API key de [Alchemy](https://www.alchemy.com/). El usuario compartió `V8Gh3y0fnFuXXNW0B4Dnp`, puedes usarla como valor inicial mientras realizas pruebas locales.

## Configuración

1. Copia el archivo de ejemplo y rellena los valores necesarios:

   ```bash
   cp .env.example .env
   ```

2. Edita `.env` y define al menos `ALCHEMY_API_KEY`. Otros campos:
   - `ALCHEMY_NETWORK`: por defecto `eth-mainnet`.
   - `FLASH_LOAN_CONTRACT`: el contrato del Pool que emite los eventos `FlashLoan` (por defecto Aave v3 en mainnet).
   - `BLOCK_WINDOW`: número de bloques hacia atrás desde el bloque más reciente.
   - `TOP_INITIATORS`: cantidad de filas a mostrar en el ranking de iniciadores.
   - `FROM_BLOCK`/`TO_BLOCK`: opcionales para forzar un rango específico y analizar exploits históricos.
   - `LOG_CHUNK_BLOCKS`: número máximo de bloques por llamada a `eth_getLogs` (10 por defecto porque es el límite del plan Free de Alchemy).
   - `MAX_LOOKBACK_WINDOWS`: cuántas ventanas completas de tamaño `BLOCK_WINDOW` se recorrerán hacia atrás si no se encuentran eventos en la ventana más reciente (útil para inspeccionar periodos largos con planes gratuitos). Usa `none` para escanear indefinidamente hasta llegar al bloque 0 o encontrar un evento.
   - `PROGRESS_FILE`: ruta del archivo JSON donde se guarda el último bloque procesado (por defecto `.flashloan-progress.json`).
   - `RESUME_FROM_PROGRESS`: en `true` reanuda automáticamente desde el bloque almacenado en `PROGRESS_FILE` para continuar escaneando sin repetir bloques.
   - `FLASHLOAN_EVENTS_FILE`: ruta del archivo donde se persistirán los eventos detectados en formato JSON (por defecto `data/flashloan-events.json`). Déjalo vacío para desactivar la escritura.
   - `TRACE_RPC_URL`/`TRACE_RPC_METHOD`: opcionales para consultar trazas de transacciones en un proveedor externo (Tenderly, Ankr, nodo propio). Si no se definen, se usa `debug_traceTransaction` vía Alchemy. Puedes especificar encabezados de autenticación con `TRACE_RPC_HEADER_NAME`, `TRACE_RPC_HEADER_VALUE` o `TRACE_RPC_HEADERS_JSON` (JSON con pares clave-valor).

## Uso

Instala dependencias si aún no lo hiciste:

```bash
npm install
```

Luego ejecuta el analizador:

```bash
npm run analyze:flashloans
```

La salida incluye:

- Número de eventos encontrados en el rango.
- Ranking de iniciadores ordenado por volumen estimado en USD (se consulta el precio vía Coingecko).
- Tokens más utilizados y cuántos iniciadores distintos interaccionaron con cada uno.
- Un resumen textual de los eventos más recientes para detectar patrones o estrategias repetidas.
- Un archivo JSON persistido en la ruta configurada por `FLASHLOAN_EVENTS_FILE` con todos los eventos detectados (direcciones, montos, estimaciones en USD, etc.) listo para ser versionado o analizado con herramientas externas.

### Script para inspeccionar una transacción

Cuando quieras reconstruir una operación puntual (por ejemplo, una transacción con flash loan ya identificada) ejecuta:

```bash
npm run trace:tx -- --tx 0xHASH_DE_LA_TX
```

También puedes definir `TX_HASH` en tu entorno y omitir el flag `--tx`. El script consulta el receipt y el `debug_traceTransaction`, mostrando:

- Contexto general (bloque, timestamp, estado, gas usado, fee estimado).
- Eventos `Transfer` de ERC20 con cantidades formateadas.
- Tabla de llamadas dirigidas a routers/DEx/agregadores conocidos (Uniswap, 1inch, 0x, Balancer, etc.).
- Un árbol resumido de llamadas internas para detectar qué contratos participaron en la estrategia.

Si configuras `TRACE_RPC_URL` (por ejemplo, un endpoint de Tenderly), el script usará ese RPC para pedir la traza. Intenta primero el método configurado (`TRACE_RPC_METHOD`, por defecto `trace_transaction`) y, si falla, recurre automáticamente al fallback (`TRACE_RPC_FALLBACK_METHOD`). Esto permite trabajar con proveedores que no soportan `debug_traceTransaction`, manteniendo la misma salida del analizador.

## Ideas de análisis adicionales

- Ajustar `BLOCK_WINDOW` o definir `FROM_BLOCK` para enfocarse en periodos concretos (post-merge, días de alta volatilidad, etc.).
- Si usas un plan pago de Alchemy puedes subir `LOG_CHUNK_BLOCKS` para reducir el número de llamadas necesarias.
- Incrementar `MAX_LOOKBACK_WINDOWS` permite escanear automáticamente varias ventanas históricas hasta encontrar actividad relevante.
- Exportar los datos a CSV/JSON y mezclarlos con dashboards en Dune o Notebooks para cruzar con precios, salud de posiciones o bots conocidos.
- Complementar con llamadas adicionales a Alchemy (por ejemplo, `getTransactionReceipts`) para capturar más contexto como gas usado o contratos intermedios.

## Reanudación y progreso

Cada ventana procesada guarda su avance en `PROGRESS_FILE` junto al siguiente bloque desde el cual continuar (`nextToBlock`). Si activas `RESUME_FROM_PROGRESS=true`, la próxima ejecución retoma automáticamente desde ese bloque y sigue retrocediendo ventanas hasta encontrar eventos o alcanzar el límite configurado. El script también muestra en tiempo real qué ventana/chunk se está consultando, cuántos logs lleva acumulados y la marca temporal aproximada de los bloques que se están revisando, lo que te ayuda a estimar cuánto falta para llegar a un periodo específico.

Cuando se detecta al menos un evento `FlashLoan`, la búsqueda se detiene de inmediato y se muestran los resúmenes, evitando seguir escaneando bloques innecesariamente.
