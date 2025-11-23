# Opciones de RPC con soporte de `debug_traceTransaction`

## Endpoint compartido

- `https://rpc.ankr.com/eth/f810cabaaae8c9d86db93c8be5629a1fb50a8e554a2faac3038e325b29861e73`
  - Respuesta: `{ "error": "message: API key not found, json-rpc code: -32050, rest code: 401" }` al consultar `eth_blockNumber`.
  - Requiere una API key válida emitida por Ankr. El formato de la URL es correcto, pero el identificador entregado parece haber expirado o no existir. Necesitamos generar una nueva desde el dashboard de Ankr.

## RPC públicos sin autenticación

Probé los siguientes endpoints mainnet. Ninguno permite `debug_traceTransaction`:

| Endpoint                               | Respuesta al pedir `debug_traceTransaction`                                      | Notas |
|----------------------------------------|----------------------------------------------------------------------------------|-------|
| `https://ethereum.publicnode.com`      | `the method debug_traceTransaction does not exist/is not available`              | Sólo métodos core. |
| `https://rpc.flashbots.net`            | `rpc method is not whitelisted`                                                  | Filtran métodos. |
| `https://eth-mainnet.public.blastapi.io` | `Only core evm requests are allowed.`                                             | Sin debug en tier público. |
| `https://eth.merkle.io`                | `method debug_traceTransaction not supported`                                    | Nodo sin módulo debug. |
| `https://rpc.payload.de`               | `method not available`                                                           | Sólo `eth_*`. |
| `https://rpc.mevblocker.io`            | HTTP 406 (HTML)                                                                  | Endpoint sólo admite métodos whitelisteados. |
| `https://gateway.tenderly.co/public/mainnet` | `rate limit exceeded` (para cualquier petición pública).                           | Necesitamos un proyecto Tenderly. |

## Proveedores con plan gratuito + autenticación

Estos sí permiten `debug_traceTransaction`, pero necesitamos generar credenciales (sin costo):

1. **Ankr Premium RPC**
   - Registro rápido en https://www.ankr.com/rpc/.
   - Crear endpoint Ethereum Mainnet → Premium. La misma URL sirve para `debug_*` en el plan free (1M req/mes).
   - Requiere reemplazar la API key en `.env` o en el script.

2. **Tenderly**
   - Crear workspace y project (gratuito) en https://dashboard.tenderly.co.
   - Cada proyecto expone un endpoint RPC con `Project Access Key`. En los endpoints `virtual.mainnet...` probados, `debug_traceTransaction` responde `not supported`, pero `trace_transaction` funciona y entrega el árbol de llamadas completo.
   - Tiene límite de ~20k simulaciones/mes en plan Free y requiere enviar el header `X-Access-Key: <Project Access Key>`.

3. **QuickNode / Blast / Chainstack**
   - Todos tienen trials gratuitos (duración o cuota limitada) y permiten habilitar `debug_traceTransaction`/`trace_transaction` agregando el add-on correspondiente. Ideal para pruebas cortas.

4. **Proveedor propio (nodo casero o de confianza)**
   - Correr Geth/Nethermind/Erigon con los módulos `debug,trace` habilitados (`--http.api=eth,debug,trace,net`), exponiendo el RPC local o vía túnel.

## Próximos pasos

- Conseguir una API key válida (Ankr o Tenderly son las opciones más rápidas) para poder volver a ejecutar `debug_traceTransaction` desde los scripts.
- Una vez dispongamos del endpoint, añadirlo al `.env` (por ejemplo usando `ALCHEMY_URL` o creando una variable `CUSTOM_RPC_URL`) y ajustar los scripts para usarlo cuando haya soporte de traces.
