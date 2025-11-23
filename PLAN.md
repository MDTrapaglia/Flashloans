# Plan para analizar estrategias de flash loans

## Objetivo

Comprender las motivaciones, rutas y beneficios detrás de flash loans detectados en el pool de Aave v3, generando reportes que expliquen cada operación relevante.

## Etapas propuestas

1. **Catalogar eventos**
   - Guardar cada `FlashLoan` detectado en un archivo estructurado (JSON/CSV) con campos clave: bloque, tx, iniciador, tokens, montos y target.
   - Enriquecer con datos externos (etiquetas de direcciones conocidas, clasificación de bots, etc.).

2. **Reconstruir la transacción**
   - Obtener el `transaction trace` y `transaction receipt` completos para identificar llamadas internas, swaps y agregadores usados.
   - Extraer los tokens movidos (via eventos Transfer) y el gas consumido.

3. **Identificar patrones**
   - Comparar las rutas con heurísticas (ej. “liquidación de posición”, “arbitraje de stablecoins”, “explotación de oráculo”).
   - Agrupar por iniciador o target para detectar bots persistentes o contratos auxiliares repetidos.

4. **Medir resultados**
   - Calcular ganancias/pérdidas estimadas combinando los montos prestados, primas pagadas y balances finales en tokens clave.
   - Registrar métricas por estrategia (ROI, duración en bloques, uso de gas).

5. **Reportar hallazgos**
   - Generar un informe corto por estrategia con: contexto del bloque, narrativa de pasos, gráficos/tablas y conclusiones.
   - Priorizar eventos anómalos (volúmenes inusuales, targets poco comunes, repetición en cortos intervalos).

## Herramientas/infra

- Script actual (`src/analyzeFlashLoans.js`) como fuente inicial de eventos.
- APIs de Alchemy (traces) y/o Etherscan para detalles finos.
- Almacenamiento local (JSON/SQLite) para poder iterar sobre los mismos datos sin relanzar queries costosas.
- Notebooks (Python/Jupyter) o dashboards ligeros para exploración visual.

## Próximos pasos inmediatos

1. Persistir cada evento en un archivo y versionarlo.
2. Construir un script auxiliar que, dado un hash de transacción, extraiga el trace y resuma las llamadas con foco en DEX/routers.
3. Definir un template de informe para documentar hallazgos estratégicos.
