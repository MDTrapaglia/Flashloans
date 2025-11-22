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

## Ideas de análisis adicionales

- Ajustar `BLOCK_WINDOW` o definir `FROM_BLOCK` para enfocarse en periodos concretos (post-merge, días de alta volatilidad, etc.).
- Si usas un plan pago de Alchemy puedes subir `LOG_CHUNK_BLOCKS` para reducir el número de llamadas necesarias.
- Exportar los datos a CSV/JSON y mezclarlos con dashboards en Dune o Notebooks para cruzar con precios, salud de posiciones o bots conocidos.
- Complementar con llamadas adicionales a Alchemy (por ejemplo, `getTransactionReceipts`) para capturar más contexto como gas usado o contratos intermedios.
