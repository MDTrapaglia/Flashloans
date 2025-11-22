import { config as loadEnv } from 'dotenv';
import { promises as fs } from 'fs';
import { Alchemy, Network } from 'alchemy-sdk';
import { Interface, formatUnits, getAddress, toQuantity } from 'ethers';

loadEnv();

const DEFAULT_NETWORK = 'eth-mainnet';
const DEFAULT_POOL_ADDRESS = '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const FLASH_LOAN_EVENT =
  'event FlashLoan(address indexed target,address indexed initiator,address indexed asset,uint256 amount,uint256 interestRateMode,uint256 premium,uint16 referralCode)';
const iface = new Interface([FLASH_LOAN_EVENT]);
const flashLoanFragment = iface.getEvent('FlashLoan');
const FLASH_LOAN_TOPIC = flashLoanFragment.topicHash;

const networkMap = {
  'eth-mainnet': Network.ETH_MAINNET,
  'eth-goerli': Network.ETH_GOERLI,
  'eth-sepolia': Network.ETH_SEPOLIA,
  'polygon-mainnet': Network.MATIC_MAINNET,
  'polygon-mumbai': Network.MATIC_MUMBAI,
  'arbitrum-mainnet': Network.ARB_MAINNET,
  'arbitrum-sepolia': Network.ARB_SEPOLIA,
  'optimism-mainnet': Network.OPT_MAINNET,
  'optimism-goerli': Network.OPT_GOERLI,
};

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const shortFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

const chunk = (arr, size) => {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
};

const shortenAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const chunkBlockRange = (fromBlock, toBlock, maxSpan) => {
  const ranges = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end = Math.min(start + maxSpan - 1, toBlock);
    ranges.push([start, end]);
    start = end + 1;
  }
  return ranges;
};

const parseEnvBool = (key, fallback) => {
  const rawValue = process.env[key];
  if (rawValue === undefined) {
    return fallback;
  }
  const normalized = rawValue.toLowerCase().trim();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  throw new Error(`La variable ${key} debe ser booleana (true/false).`);
};

const parseOptionalInt = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`No se pudo convertir "${value}" a número.`);
  }
  return parsed;
};

const parseEnvInt = (key, fallback) => {
  const rawValue = process.env[key];
  if (rawValue === undefined) {
    return fallback;
  }
  const parsed = Number(rawValue);
  if (Number.isNaN(parsed)) {
    throw new Error(`La variable ${key} debe ser un número.`);
  }
  return parsed;
};

const describeRpcError = (error) => {
  if (!error) {
    return 'Error desconocido';
  }
  if (error.error?.message) {
    return `${error.error.message} (código ${error.error.code ?? 'N/A'})`;
  }
  const bodyText = error.body || error.response?.body;
  if (bodyText) {
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed?.error?.message) {
        return `${parsed.error.message} (código ${parsed.error.code ?? 'N/A'})`;
      }
    } catch {
      return bodyText;
    }
    return bodyText;
  }
  if (error.message) {
    return error.message;
  }
  return 'Error desconocido';
};

const resolveNetwork = (value) => {
  const normalized = (value || DEFAULT_NETWORK).toLowerCase();
  const selected = networkMap[normalized];
  if (!selected) {
    const available = Object.keys(networkMap).join(', ');
    throw new Error(`Red "${normalized}" no soportada. Opciones: ${available}`);
  }
  return selected;
};

const readProgressFile = async (filepath) => {
  if (!filepath) {
    return null;
  }
  try {
    const data = await fs.readFile(filepath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`No se pudo leer ${filepath}: ${error.message}`);
    }
    return null;
  }
};

const writeProgressFile = async (filepath, payload) => {
  if (!filepath) {
    return;
  }
  try {
    await fs.writeFile(filepath, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.warn(`No se pudo guardar ${filepath}: ${error.message}`);
  }
};

const formatIso = (timestamp) => {
  if (!timestamp) {
    return 'N/D';
  }
  return new Date(timestamp * 1000).toISOString();
};

const fetchBlockTimestamp = async (alchemy, blockNumber) => {
  if (blockNumber === undefined || blockNumber === null || blockNumber < 0) {
    return null;
  }
  try {
    const block = await alchemy.core.getBlock(blockNumber);
    return block?.timestamp ?? null;
  } catch (error) {
    console.warn(`No se pudo obtener timestamp para bloque ${blockNumber}: ${error.message}`);
    return null;
  }
};

const renderProgressLine = ({
  windowIndex,
  maxWindows,
  chunkIndex,
  chunkTotal,
  chunkFrom,
  chunkTo,
  fromTimeIso,
  toTimeIso,
  logsCollected,
}) => {
  const windowLabel = maxWindows === Infinity ? `${windowIndex}` : `${windowIndex}/${maxWindows}`;
  const line = `[Ventana ${windowLabel}] Chunk ${chunkIndex}/${chunkTotal} | Bloques ${chunkFrom}-${chunkTo} (${fromTimeIso} -> ${toTimeIso}) | Logs acumulados: ${logsCollected}`;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r${line}`);
  } else {
    console.log(line);
  }
};

const decodeLog = (log) => {
  const parsed = iface.parseLog(log);
  return {
    blockNumber:
      typeof log.blockNumber === 'string'
        ? Number(BigInt(log.blockNumber))
        : Number(log.blockNumber),
    txHash: log.transactionHash,
    target: getAddress(parsed.args.target),
    initiator: getAddress(parsed.args.initiator),
    asset: getAddress(parsed.args.asset),
    amount: BigInt(parsed.args.amount),
    premium: BigInt(parsed.args.premium),
    interestRateMode: Number(parsed.args.interestRateMode),
    referralCode: Number(parsed.args.referralCode),
  };
};

const fetchTokenMetadata = async (alchemy, assets) => {
  const metadataMap = new Map();
  for (const asset of assets) {
    try {
      const metadata = await alchemy.core.getTokenMetadata(asset);
      metadataMap.set(asset, {
        symbol: metadata?.symbol || shortenAddress(asset),
        name: metadata?.name || 'Unknown token',
        decimals: typeof metadata?.decimals === 'number' ? metadata.decimals : 18,
        address: asset,
      });
    } catch (error) {
      console.warn(`No se pudo obtener metadata para ${asset}: ${error.message}`);
      metadataMap.set(asset, {
        symbol: shortenAddress(asset),
        name: 'Unknown token',
        decimals: 18,
        address: asset,
      });
    }
  }
  return metadataMap;
};

const fetchUsdPrices = async (assetAddresses) => {
  const priceMap = new Map();
  if (!assetAddresses.length) {
    return priceMap;
  }

  const lowerCaseAddresses = assetAddresses.map((address) => address.toLowerCase());
  for (const addressesChunk of chunk(lowerCaseAddresses, 30)) {
    const url = new URL('https://api.coingecko.com/api/v3/simple/token_price/ethereum');
    url.searchParams.set('contract_addresses', addressesChunk.join(','));
    url.searchParams.set('vs_currencies', 'usd');
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`No se pudo obtener precios para ${addressesChunk.length} tokens.`);
        continue;
      }
      const data = await response.json();
      Object.entries(data).forEach(([address, priceInfo]) => {
        priceMap.set(getAddress(address), typeof priceInfo.usd === 'number' ? priceInfo.usd : null);
      });
    } catch (error) {
      console.warn(`Error al consultar precios: ${error.message}`);
    }
  }
  return priceMap;
};

const formatUsd = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/D';
  }
  return usdFormatter.format(value);
};

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/D';
  }
  return numberFormatter.format(value);
};

const formatAmount = (value) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/D';
  }
  return shortFormatter.format(value);
};

const prepareInitiatorRow = (address, stats) => {
  const topAssets = Array.from(stats.assets.entries())
    .sort((a, b) => (b[1].usd || 0) - (a[1].usd || 0))
    .slice(0, 3)
    .map(([symbol, payload]) => {
      const amountInfo = `${formatAmount(payload.amount)} ${symbol}`;
      if (!payload.usd) {
        return amountInfo;
      }
      return `${amountInfo} (${formatUsd(payload.usd)})`;
    });

  const avgUsd = stats.totalUsd > 0 ? stats.totalUsd / stats.count : undefined;

  return {
    Initiator: shortenAddress(address),
    Veces: stats.count,
    'Volumen USD': formatUsd(stats.totalUsd),
    'Promedio USD': formatUsd(avgUsd),
    Tokens: topAssets.join(' | ') || 'N/D',
    'Targets populares': Array.from(stats.targets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([target, times]) => `${shortenAddress(target)}(${times})`)
      .join(' '),
  };
};

const prepareAssetRow = (asset, stats) => ({
  Token: `${stats.symbol} (${shortenAddress(asset)})`,
  Eventos: stats.count,
  'Volumen token': `${formatAmount(stats.totalAmount)} ${stats.symbol}`,
  'Volumen USD': formatUsd(stats.totalUsd),
  'Iniciadores únicos': stats.uniqueInitiators.size,
});

const printRecentEvents = (events) => {
  console.log('\nEventos recientes:');
  events.forEach((event) => {
    const usdSnippet = event.usdValue ? ` ~ ${formatUsd(event.usdValue)}` : '';
    console.log(
      `• Bloque ${event.blockNumber} | ${shortenAddress(event.initiator)} tomó ${formatAmount(
        event.amountFormatted,
      )} ${event.metadata.symbol} -> target ${shortenAddress(event.target)}${usdSnippet} (tx ${
        event.txHash
      })`,
    );
  });
};

const main = async () => {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error('Falta ALCHEMY_API_KEY en el entorno (.env).');
  }

  const network = resolveNetwork(process.env.ALCHEMY_NETWORK);
  const poolAddress = process.env.FLASH_LOAN_CONTRACT
    ? getAddress(process.env.FLASH_LOAN_CONTRACT)
    : getAddress(DEFAULT_POOL_ADDRESS);
  const blockWindow = parseEnvInt('BLOCK_WINDOW', 5000);
  const topInitiatorsLimit = parseEnvInt('TOP_INITIATORS', 5);
  const explicitFromBlock = parseOptionalInt(process.env.FROM_BLOCK);
  const explicitToBlock = parseOptionalInt(process.env.TO_BLOCK);

  const alchemy = new Alchemy({ apiKey, network });
  const maxBlockSpan = parseEnvInt('LOG_CHUNK_BLOCKS', 10);
  const maxLookbackWindowsRaw = process.env.MAX_LOOKBACK_WINDOWS;
  const infiniteLookback = !maxLookbackWindowsRaw || maxLookbackWindowsRaw.toLowerCase() === 'none';
  const maxLookbackWindows = infiniteLookback ? Infinity : parseEnvInt('MAX_LOOKBACK_WINDOWS', 1);
  const progressFilePath = process.env.PROGRESS_FILE || '.flashloan-progress.json';
  const resumeFromProgress = parseEnvBool('RESUME_FROM_PROGRESS', false);

  if (blockWindow <= 0) {
    throw new Error('BLOCK_WINDOW debe ser mayor a 0.');
  }
  if (maxBlockSpan <= 0) {
    throw new Error('LOG_CHUNK_BLOCKS debe ser mayor a 0.');
  }
  if (!infiniteLookback && maxLookbackWindows <= 0) {
    throw new Error('MAX_LOOKBACK_WINDOWS debe ser mayor a 0.');
  }

  const latestBlockNumber = await alchemy.core.getBlockNumber();
  const savedProgress = resumeFromProgress ? await readProgressFile(progressFilePath) : null;
  const resumeTarget =
    resumeFromProgress && savedProgress?.nextToBlock !== undefined
      ? savedProgress.nextToBlock
      : undefined;
  if (resumeTarget !== undefined) {
    console.log(
      `Reanudando desde bloque ${resumeTarget} usando progreso guardado en ${progressFilePath}`,
    );
  }

  const toBlock = explicitToBlock ?? resumeTarget ?? latestBlockNumber;
  const fromBlock = explicitFromBlock ?? Math.max(toBlock - blockWindow + 1, 0);

  console.log('==============================================');
  console.log('Analizador de Flash Loans (Aave v3 / Alchemy)');
  console.log('==============================================');
  console.log(`Contrato Pool: ${poolAddress}`);
  console.log(`Red: ${process.env.ALCHEMY_NETWORK || DEFAULT_NETWORK}`);
  console.log(`Rango de bloques: ${fromBlock} - ${toBlock}`);
  if (!explicitFromBlock && !explicitToBlock) {
    console.log(
      `Ventanas automáticas configuradas: tamaño=${blockWindow} bloques, máximo=${maxLookbackWindows}`,
    );
  }
  if (resumeTarget !== undefined) {
    console.log(`Progreso previo: se retomará desde el bloque ${toBlock}.`);
  }

  const allLogs = [];
  const shouldIterateBackwards = explicitFromBlock === undefined && explicitToBlock === undefined;
  let currentFrom = fromBlock;
  let currentTo = toBlock;
  let windowsProcessed = 0;
  let foundLogs = false;
  const totalBlocksScanned = () => windowsProcessed * blockWindow;

  while (currentTo >= currentFrom && currentTo >= 0) {
    windowsProcessed += 1;
    const [fromTs, toTs] = await Promise.all([
      fetchBlockTimestamp(alchemy, currentFrom),
      fetchBlockTimestamp(alchemy, currentTo),
    ]);
    const windowLabel = maxLookbackWindows === Infinity ? `${windowsProcessed}` : `${windowsProcessed}/${maxLookbackWindows}`;
    const windowHeader = `[Ventana ${windowLabel}] Bloques ${currentFrom}-${currentTo} (${formatIso(
      fromTs,
    )} -> ${formatIso(toTs)})`;
    console.log(`${windowHeader} | Bloques recorridos hasta ahora: ${totalBlocksScanned()}`);

    const ranges = chunkBlockRange(currentFrom, currentTo, maxBlockSpan);
    let chunkIndex = 0;
    for (const [chunkFrom, chunkTo] of ranges) {
      chunkIndex += 1;
      renderProgressLine({
        windowIndex: windowsProcessed,
        maxWindows: maxLookbackWindows,
        chunkIndex,
        chunkTotal: ranges.length,
        chunkFrom,
        chunkTo,
        fromTimeIso: formatIso(fromTs),
        toTimeIso: formatIso(toTs),
        logsCollected: allLogs.length,
      });
      try {
        const logs = await alchemy.core.getLogs({
          address: poolAddress,
          fromBlock: toQuantity(chunkFrom),
          toBlock: toQuantity(chunkTo),
          topics: [FLASH_LOAN_TOPIC],
        });
        allLogs.push(...logs);
        if (logs.length > 0) {
          foundLogs = true;
          break;
        }
      } catch (error) {
        console.warn(
          `\nError al consultar bloques ${chunkFrom}-${chunkTo}: ${describeRpcError(
            error,
          )}. Intentando continuar...`,
        );
      }
    }
    if (process.stdout.isTTY) {
      process.stdout.write('\n');
    }

    if (foundLogs) {
      break;
    }

    const nextResumeBlock = Math.max(currentFrom - 1, 0);
    await writeProgressFile(progressFilePath, {
      lastWindowRange: { from: currentFrom, to: currentTo },
      nextToBlock: nextResumeBlock,
      updatedAt: new Date().toISOString(),
      logsCollected: allLogs.length,
    });

    const canExtend =
      shouldIterateBackwards &&
      windowsProcessed < maxLookbackWindows &&
      currentFrom > 0 &&
      !foundLogs;
    if (!canExtend) {
      break;
    }
    currentTo = currentFrom - 1;
    if (currentTo < 0) {
      break;
    }
    currentFrom = Math.max(currentTo - blockWindow + 1, 0);
    if (process.stdout.isTTY) {
      process.stdout.write('\n');
    }
  }

  if (!allLogs.length) {
    console.log('No se encontraron eventos FlashLoan en el rango seleccionado.');
    return;
  }

  const parsedEvents = allLogs.map((log) => decodeLog(log));
  const assets = Array.from(new Set(parsedEvents.map((event) => event.asset)));
  const metadataMap = await fetchTokenMetadata(alchemy, assets);
  const priceMap = await fetchUsdPrices(assets);

  const initiatorStats = new Map();
  const assetStats = new Map();

  const enrichedEvents = parsedEvents.map((event) => {
    const metadata = metadataMap.get(event.asset);
    const decimals = metadata?.decimals ?? 18;
    const amountFormatted = Number(formatUnits(event.amount, decimals));
    const premiumFormatted = Number(formatUnits(event.premium, decimals));
    const usdPrice = priceMap.get(event.asset) ?? null;
    const usdValue = usdPrice ? amountFormatted * usdPrice : null;

    const initiatorEntry =
      initiatorStats.get(event.initiator) ||
      {
        count: 0,
        totalUsd: 0,
        totalAmount: 0,
        totalPremium: 0,
        assets: new Map(),
        targets: new Map(),
      };
    initiatorEntry.count += 1;
    initiatorEntry.totalAmount += amountFormatted;
    initiatorEntry.totalPremium += premiumFormatted;
    if (typeof usdValue === 'number') {
      initiatorEntry.totalUsd += usdValue;
    }
    const assetEntry =
      initiatorEntry.assets.get(metadata.symbol) || {
        amount: 0,
        usd: 0,
      };
    assetEntry.amount += amountFormatted;
    if (typeof usdValue === 'number') {
      assetEntry.usd += usdValue;
    }
    initiatorEntry.assets.set(metadata.symbol, assetEntry);
    initiatorEntry.targets.set(
      event.target,
      (initiatorEntry.targets.get(event.target) || 0) + 1,
    );
    initiatorStats.set(event.initiator, initiatorEntry);

    const assetStatEntry =
      assetStats.get(event.asset) ||
      {
        symbol: metadata.symbol,
        count: 0,
        totalAmount: 0,
        totalUsd: 0,
        uniqueInitiators: new Set(),
      };
    assetStatEntry.count += 1;
    assetStatEntry.totalAmount += amountFormatted;
    if (typeof usdValue === 'number') {
      assetStatEntry.totalUsd += usdValue;
    }
    assetStatEntry.uniqueInitiators.add(event.initiator);
    assetStats.set(event.asset, assetStatEntry);

    return {
      ...event,
      metadata,
      amountFormatted,
      premiumFormatted,
      usdValue,
    };
  });

  console.log(`Eventos encontrados: ${enrichedEvents.length}`);

  const initiatorRows = Array.from(initiatorStats.entries())
    .map(([address, stats]) => ({ raw: stats, address }))
    .sort((a, b) => {
      const usdDiff = (b.raw.totalUsd || 0) - (a.raw.totalUsd || 0);
      if (usdDiff !== 0) {
        return usdDiff;
      }
      return b.raw.count - a.raw.count;
    })
    .slice(0, topInitiatorsLimit)
    .map(({ address, raw }) => prepareInitiatorRow(address, raw));

  if (initiatorRows.length) {
    console.log('\nTop iniciadores (por volumen estimado USD):');
    console.table(initiatorRows);
  }

  const assetRows = Array.from(assetStats.entries())
    .sort((a, b) => (b[1].totalUsd || 0) - (a[1].totalUsd || 0))
    .slice(0, 5)
    .map(([asset, stats]) => prepareAssetRow(asset, stats));

  if (assetRows.length) {
    console.log('\nTokens más utilizados:');
    console.table(assetRows);
  }

  const recentEvents = enrichedEvents
    .sort((a, b) => b.blockNumber - a.blockNumber)
    .slice(0, 5);
  printRecentEvents(recentEvents);

  console.log('\nNotas:');
  console.log(
    '- Los montos USD se estiman usando precios de Coingecko al momento de la ejecución.',
  );
  console.log(
    '- Ajusta BLOCK_WINDOW o FROM_BLOCK/TO_BLOCK en .env para explorar otros rangos.',
  );
};

main().catch((error) => {
  console.error('Error ejecutando el analizador:', error.message);
  process.exit(1);
});
