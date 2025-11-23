# Metodología para analizar estrategias de flash loans

## 1. Ingesta de eventos

1. Ejecutar `npm run analyze:flashloans` con el rango deseado.
2. Cada evento queda persistido en `data/flashloan-events.json` (configurable vía `FLASHLOAN_EVENTS_FILE`).
3. Los campos mínimos por evento:
   - Bloque, hash de la transacción, initiator y target.
   - Token prestado (dirección, símbolo, decimales), monto y prima en términos del token y en USD.
   - Timestamp del bloque (para correlacionar con precios externos o series de tiempo).

Esta capa nos permite filtrar rápidamente por initiator, token o target y priorizar qué operaciones ameritan reconstrucción completa.

## 2. Recuperación del trace

1. Se usa el script `npm run trace:tx -- --tx <hash>`.
2. Si `TRACE_RPC_URL` está definido, el script envía la solicitud directamente a ese RPC (Tenderly, Ankr, nodo propio). Por defecto usa el método `trace_transaction`, y si el proveedor lo permite, puede configurarse `TRACE_RPC_METHOD=debug_traceTransaction`.
3. Si no se define un RPC externo, el script recurre al `debug_traceTransaction` de Alchemy.

### ¿Es obligatorio `debug_traceTransaction`?

No. El plan de análisis funciona con cualquier RPC que exponga un trace completo. Con Tenderly, por ejemplo, `debug_traceTransaction` no está habilitado, pero `trace_transaction` entrega el mismo árbol de llamadas y el script lo procesa de forma transparente. `debug_traceTransaction` sólo es necesario cuando se desea aprovechar el formato "callTracer" específico de geth; para reconstruir estrategias basta con recibir un listado de `traceAddress` + `action` (el formato que devuelven la mayoría de los nodos Parity/Erigon).

## 3. Contexto y enriquecimiento del trace

El inspector imprime y exporta:

- Resumen del receipt (gas, fee, block/time, input selector).
- Eventos ERC20 `Transfer` para seguir los flujos de tokens del flash loan.
- Detección de routers/agregadores conocidos, con la profundidad dentro de la ejecución y el selector invocado.
- Árbol resumido de llamadas, destacando valores transferidos y posibles errores/reverts.

Con estos datos podemos identificar rápidamente:

- Rutas de swaps (cuando aparecen routers como Uniswap, Balancer, 1inch, Curve, etc.).
- Interacciones con `liquidationCall`, `repay`, `borrow` u oráculos que evidencien liquidaciones.
- Uso de contratos puente / cross-chain / wrappers.

## 4. Clasificación de estrategias (heurísticas iniciales)

| Estrategia objetivo               | Señales en el trace                                                            | Datos adicionales necesarios |
|----------------------------------|--------------------------------------------------------------------------------|------------------------------|
| Arbitraje de DEX/estables        | Secuencia de `swap`/`multicall` entre routers conocidos, tokens in/out iguales | Precios spot en el bloque    |
| Liquidación en protocolos de lending | Llamadas a `liquidationCall`, `repay` o `withdraw` después del flash loan            | Salud de la posición liquidada (puede obtenerse vía subgraph o lectura adicional) |
| Explotación de oráculo/precios   | Lecturas/escrituras a contratos oráculo seguidas de swaps inesperados          | Historias de precios de feeds |
| Rebalanceo de vault/LP           | Interacción con bóvedas (`deposit`, `withdraw`, `harvest`) usando el capital del préstamo | Estado de la bóveda (TVL, share price) |
| Ataques complejos (sandwich, manipulación de pools) | Gran cantidad de sub-llamadas a contratos custom + swaps repetidos               | Necesario revisar contratos específicos |

## 5. Próximos pasos

1. Automatizar la extracción de features desde `data/flashloan-events.json` y la traza (por ejemplo, un script que combine ambos y genere un registro por transacción con los contratos tocados y los tokens involucrados).
2. Etiquetar manualmente un subconjunto de transacciones para validar/ajustar las heurísticas anteriores.
3. Integrar visualizaciones (tabla o notebook) que agrupen por iniciador y estrategia.

Este documento sirve como guía para continuar con la clasificación sin depender de `debug_traceTransaction` específico de un proveedor; cualquier RPC que devuelva `trace_transaction` es suficiente para completar el pipeline descrito.
