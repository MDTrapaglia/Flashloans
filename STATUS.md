# Estado del proyecto

Última actualización: 23 de noviembre de 2025.

## Situación actual

- El script `src/analyzeFlashLoans.js` consulta el contrato `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` (Pool de Aave v3 en mainnet) y decodifica el evento `FlashLoan` usando el ABI oficial incluido en `@aave/core-v3`.
- Se soporta paginado automático respetando el límite de `10` bloques por llamada `eth_getLogs` del plan gratuito de Alchemy. El rango inicial se controla con `BLOCK_WINDOW` y, si no se encuentran eventos, el proceso continúa hacia atrás con `MAX_LOOKBACK_WINDOWS` (puede definirse como `none` para escanear indefinidamente).
- Se guardan ventanas procesadas en `.flashloan-progress.json` y se puede reanudar con `RESUME_FROM_PROGRESS=true`.
- Por cada evento se consulta metadata y precios estimados (Coingecko) para mostrar rankings de iniciadores, tokens y últimos eventos en texto.
- El script se detiene automáticamente cuando encuentra la primera tanda de `FlashLoan`, lo que permite lanzarlo y olvidarse hasta que haya resultados. Las pruebas recientes detectaron eventos en bloques `23858978+`.

## Limitaciones actuales

- Dependemos del plan gratuito de Alchemy: si se escanea un intervalo amplio, se realizan miles de llamadas y aparecen respuestas `SERVER_ERROR`. Actualmente solo se registran y se continúa, así que el tiempo total puede superar varios minutos.
- El archivo de progreso solo almacena el último bloque analizado, pero no mantiene un historial de resultados. Al repetir la ejecución se sobrescribe la información previa.
- La estimación en USD depende de la API pública de Coingecko; si la llamada se rate-limitea se muestran valores `N/D`.
- Toda la interacción se hace desde CLI; no hay endpoints ni dashboards que persistan la data para análisis posteriores.

## Plan a futuro

1. **Persistencia de resultados**: serializar cada evento encontrado a JSON/CSV para poder cargarlo en notebooks o BI sin reconsultar la cadena.
2. **Mejoras en la estrategia de escaneo**: aplicar un backoff automático y pausas configurables entre ventanas para evitar los errores 5XX del RPC y, en planes pagos, permitir chunks más grandes.
3. **Clasificación de estrategias**: enriquecer los eventos con datos adicionales (por ejemplo, función llamada en el `target`, tokens intermedios o etiquetas de bots) para inferir el tipo de flash loan.
4. **Modo histórico**: aceptar listas de bloques o timestamps específicos (por ejemplo, periodo de un exploit) y generar reportes comparativos.
5. **Interfaz adicional**: exponer la lógica como comando CLI con argumentos (sin depender de `.env`) o servir un endpoint ligero para automatizar su ejecución desde pipelines.
