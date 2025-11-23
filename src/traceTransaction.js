import { config as loadEnv } from 'dotenv';
import { Alchemy, Network } from 'alchemy-sdk';
import { Interface, formatEther, formatUnits, getAddress } from 'ethers';

loadEnv();

const DEFAULT_NETWORK = 'eth-mainnet';
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

const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 });
const gweiFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const transferIface = new Interface([
  'event Transfer(address indexed from,address indexed to,uint256 value)',
]);
const transferTopic = transferIface.getEvent('Transfer').topicHash;

const knownContracts = [
  { address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', label: 'Uniswap V2 Router', category: 'DEX' },
  { address: '0xE592427A0AEce92De3Edee1F18E0157C05861564', label: 'Uniswap V3 Router', category: 'DEX' },
  { address: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', label: 'Uniswap V3 Router 2', category: 'DEX' },
  { address: '0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B', label: 'Uniswap Universal Router', category: 'DEX' },
  { address: '0xd9e1cE17f2641f24AE83637ab66a2cca9C378B9F', label: 'Sushiswap Router', category: 'DEX' },
  { address: '0x1111111254fb6c44bac0bed2854e76f90643097d', label: '1inch Router', category: 'Aggregator' },
  { address: '0xDEF1C0ded9bec7F1a1670819833240f027b25EfF', label: '0x / Matcha Proxy', category: 'Aggregator' },
  { address: '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57', label: 'ParaSwap Augustus', category: 'Aggregator' },
  { address: '0xBA12222222228D8Ba445958a75a0704d566BF2C8', label: 'Balancer V2 Vault', category: 'DEX' },
  { address: '0xE66b31678d6C16E9ebf358268a790B763C133750', label: 'Curve Router', category: 'DEX' },
  { address: '0xa356867fDCEa8e71AEaF87805808803806231FdC', label: 'DODO V2 Router', category: 'DEX' },
  { address: '0x818E6FECD516Ecc3849DAf6845e3EC868087B755', label: 'KyberNetwork Proxy', category: 'Aggregator' },
].map((item) => ({
  ...item,
  checksum: getAddress(item.address.toLowerCase()),
}));
const knownContractsMap = new Map(knownContracts.map((item) => [item.checksum, item]));

const shortenAddress = (address) => {
  if (!address) {
    return 'N/D';
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

const parseCliArgs = () => {
  const args = process.argv.slice(2);
  let txHash;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--tx' || arg === '-t') {
      txHash = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--tx=')) {
      txHash = arg.split('=')[1];
    } else if (!arg.startsWith('-') && !txHash) {
      txHash = arg;
    }
  }
  return {
    txHash: txHash || process.env.TX_HASH || null,
  };
};

const validateTxHash = (hash) => {
  if (!hash || typeof hash !== 'string' || !hash.startsWith('0x') || hash.length !== 66) {
    throw new Error('Debes especificar un hash de transacción válido (0x + 64 hex).');
  }
  return hash.toLowerCase();
};

const formatIso = (timestamp) => {
  if (!timestamp && timestamp !== 0) {
    return 'N/D';
  }
  return new Date(timestamp * 1000).toISOString();
};

const toBigIntSafe = (value) => {
  if (value === undefined || value === null) {
    return 0n;
  }
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const normalized = value.startsWith('0x') ? value : `0x${value}`;
    try {
      return BigInt(normalized);
    } catch {
      return 0n;
    }
  }
  return 0n;
};

const formatEthValue = (weiValue) => {
  if (weiValue === undefined || weiValue === null) {
    return 'N/D';
  }
  const numeric = Number(formatEther(weiValue));
  if (!Number.isFinite(numeric)) {
    return formatEther(weiValue);
  }
  return numberFormatter.format(numeric);
};

const formatGweiValue = (weiValue) => {
  if (weiValue === undefined || weiValue === null) {
    return 'N/D';
  }
  const numeric = Number(formatUnits(weiValue, 'gwei'));
  if (!Number.isFinite(numeric)) {
    return formatUnits(weiValue, 'gwei');
  }
  return gweiFormatter.format(numeric);
};

const normalizeAddress = (value) => {
  if (!value) {
    return null;
  }
  try {
    return getAddress(value);
  } catch {
    return null;
  }
};

const fetchTokenMetadata = async (alchemy, addresses) => {
  const metadataMap = new Map();
  for (const address of addresses) {
    try {
      const metadata = await alchemy.core.getTokenMetadata(address);
      metadataMap.set(address, {
        address,
        symbol: metadata?.symbol || shortenAddress(address),
        name: metadata?.name || 'Token sin nombre',
        decimals: typeof metadata?.decimals === 'number' ? metadata.decimals : 18,
      });
    } catch (error) {
      console.warn(`No se pudo obtener metadata para ${address}: ${error.message}`);
      metadataMap.set(address, {
        address,
        symbol: shortenAddress(address),
        name: 'Token desconocido',
        decimals: 18,
      });
    }
  }
  return metadataMap;
};

const extractTransferEvents = (receipt) => {
  if (!receipt?.logs?.length) {
    return [];
  }
  return receipt.logs
    .map((log) => {
      if (!log.topics?.length || log.topics[0] !== transferTopic) {
        return null;
      }
      try {
        const parsed = transferIface.parseLog(log);
        return {
          token: normalizeAddress(log.address),
          from: normalizeAddress(parsed.args.from),
          to: normalizeAddress(parsed.args.to),
          value: BigInt(parsed.args.value),
          logIndex:
            typeof log.logIndex === 'string'
              ? Number(BigInt(log.logIndex))
              : Number(log.logIndex ?? 0),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const flattenTrace = (traceResult) => {
  if (!traceResult) {
    return [];
  }
  const results = [];
  const nodes = Array.isArray(traceResult) ? traceResult : [traceResult];
  const visit = (node, depth) => {
    if (!node) {
      return;
    }
    const to = normalizeAddress(node.to);
    const callEntry = {
      depth,
      type: node.type,
      from: normalizeAddress(node.from),
      to,
      valueWei: toBigIntSafe(node.value),
      gas: Number(toBigIntSafe(node.gas)),
      gasUsed: Number(toBigIntSafe(node.gasUsed)),
      input: typeof node.input === 'string' ? node.input : '0x',
      selector:
        typeof node.input === 'string' && node.input.length >= 10
          ? node.input.slice(0, 10)
          : '0x',
      error: node.error || node.revertReason || null,
      knownContract: to ? knownContractsMap.get(to) : undefined,
    };
    results.push(callEntry);
    if (Array.isArray(node.calls)) {
      node.calls.forEach((child) => visit(child, depth + 1));
    }
  };
  nodes.forEach((root) => visit(root, 0));
  return results;
};

const printCallTree = (calls) => {
  if (!calls.length) {
    console.log('\nNo se recibió información del trace.');
    return;
  }
  const maxRows = 40;
  console.log('\nÁrbol resumido de llamadas:');
  calls.slice(0, maxRows).forEach((call) => {
    const indent = '  '.repeat(call.depth);
    const label = call.knownContract?.label || shortenAddress(call.to) || '[creation]';
    const valueTag = call.valueWei > 0n ? ` | valor ${formatEthValue(call.valueWei)} ETH` : '';
    const selectorTag = call.selector && call.selector !== '0x' ? ` | selector ${call.selector}` : '';
    const errorTag = call.error ? ` | ⚠️ ${call.error}` : '';
    console.log(`${indent}- [${call.type}] ${label}${selectorTag}${valueTag}${errorTag}`);
  });
  if (calls.length > maxRows) {
    console.log(`... (${calls.length - maxRows} llamadas adicionales no mostradas)`);
  }
};

const renderDexTable = (dexCalls) => {
  if (!dexCalls.length) {
    console.log('\nNo se detectaron DEX/routers conocidos en el trace.');
    return;
  }
  const rows = dexCalls.map((call, index) => ({
    '#': index + 1,
    Profundidad: call.depth,
    Contrato: `${call.knownContract.label} (${call.knownContract.category})`,
    Dirección: shortenAddress(call.to),
    Selector: call.selector,
    'Valor ETH': formatEthValue(call.valueWei),
    'Gas usado': call.gasUsed || 'N/D',
    Error: call.error || '',
  }));
  console.log('\nLlamadas a DEX/routers detectadas:');
  console.table(rows);
};

const main = async () => {
  const apiKey = process.env.ALCHEMY_API_KEY;
  if (!apiKey) {
    throw new Error('Falta ALCHEMY_API_KEY en el entorno (.env).');
  }
  const { txHash } = parseCliArgs();
  const normalizedHash = validateTxHash(txHash);
  const network = resolveNetwork(process.env.ALCHEMY_NETWORK);

  const alchemy = new Alchemy({ apiKey, network });
  console.log('==============================================');
  console.log('Inspector de transacciones (receipt + trace)');
  console.log('==============================================');
  console.log(`Red: ${process.env.ALCHEMY_NETWORK || DEFAULT_NETWORK}`);
  console.log(`Transacción: ${normalizedHash}`);

  const [tx, receipt] = await Promise.all([
    alchemy.core.getTransaction(normalizedHash),
    alchemy.core.getTransactionReceipt(normalizedHash),
  ]);

  if (!tx || !receipt) {
    throw new Error('No se pudo obtener la transacción o su receipt.');
  }

  const block =
    tx.blockNumber !== null && tx.blockNumber !== undefined
      ? await alchemy.core.getBlock(tx.blockNumber)
      : null;

  const transfers = extractTransferEvents(receipt);
  const tokenAddresses = Array.from(
    new Set(transfers.map((event) => event.token).filter(Boolean)),
  );
  const metadataMap = tokenAddresses.length
    ? await fetchTokenMetadata(alchemy, tokenAddresses)
    : new Map();

  let traceResult = null;
  try {
    traceResult = await alchemy.debug.traceTransaction(normalizedHash, {
      type: 'callTracer',
      onlyTopCall: false,
    });
  } catch (error) {
    console.warn(`No se pudo obtener el trace: ${error.message}`);
  }

  const valueWei = tx.value ? BigInt(tx.value) : 0n;
  const gasUsed = toBigIntSafe(receipt.gasUsed);
  const effectiveGasPrice = toBigIntSafe(receipt.effectiveGasPrice);
  const totalFeeWei = gasUsed * effectiveGasPrice;

  console.log('\nContexto general:');
  console.log(`Bloque: ${tx.blockNumber ?? 'pending'} | Fecha: ${formatIso(block?.timestamp)}`);
  console.log(`From: ${tx.from} -> To: ${tx.to || 'Contract creation'}`);
  console.log(`Valor enviado: ${formatEthValue(valueWei)} ETH`);
  console.log(
    `Estado: ${receipt.status === 1 ? '✅ Success' : '❌ Revertido'} | Gas usado: ${
      gasUsed ? gasUsed.toString() : 'N/D'
    } | Gas price: ${formatGweiValue(effectiveGasPrice)} gwei | Fee: ${
      gasUsed && effectiveGasPrice ? `${formatEthValue(totalFeeWei)} ETH` : 'N/D'
    }`,
  );
  console.log(`Input selector: ${tx.data?.slice(0, 10) || '0x'}`);

  if (transfers.length) {
    const transferRows = transfers.map((event) => {
      const metadata = metadataMap.get(event.token) || {
        symbol: shortenAddress(event.token),
        decimals: 18,
      };
      const formattedAmount = Number(formatUnits(event.value, metadata.decimals));
      return {
        Token: `${metadata.symbol} (${shortenAddress(event.token)})`,
        'Desde -> Hasta': `${shortenAddress(event.from)} -> ${shortenAddress(event.to)}`,
        Cantidad: `${numberFormatter.format(formattedAmount)} ${metadata.symbol}`,
      };
    });
    console.log('\nTransferencias detectadas (logs ERC20):');
    console.table(transferRows);
  } else {
    console.log('\nNo se detectaron eventos Transfer ERC20 en el receipt.');
  }

  const flattenedTrace = flattenTrace(traceResult);
  renderDexTable(flattenedTrace.filter((call) => call.knownContract));
  printCallTree(flattenedTrace);
};

main().catch((error) => {
  console.error('Error ejecutando el inspector:', error.message);
  process.exit(1);
});
