import dotenv from 'dotenv';
import convict from 'convict';

dotenv.config();

const config = convict({
  env: {
    doc: 'The application environment',
    format: ['prod', 'test'],
    default: 'test',
    arg: 'nodeEnv',
    env: 'NODE_ENV',
    privateKey: process.env.PRIVATE_KEY,
  },
  privateKey: {
    format: String,
    default: '',
    arg: 'privateKey',
    env: 'PRIVATE_KEY',
  },
  rpcNodeUrl: {
    format: String,
    default: '',
    arg: 'rpcNodeUrl',
    env: 'RPC_NODE_URL',
  },
  wsNodeUrl: {
    format: String,
    default: '',
    arg: 'wsNodeUrl',
    env: 'WS_NODE_URL',
  },
  networkMagic: {
    format: Number,
    default: 0,
    arg: 'networkMagic',
    env: 'NETWORK_MAGIC',
  },
  flmScriptHash: {
    format: String,
    default: '',
    arg: 'flmScriptHash',
    env: 'FLM_SCRIPT_HASH',
  },
  lrbScriptHash: {
    format: String,
    default: '',
    arg: 'lrbScriptHash',
    env: 'LRB_SCRIPT_HASH',
  },
  usdlScriptHash: {
    format: String,
    default: '',
    arg: 'usdlScriptHash',
    env: 'USDL_SCRIPT_HASH',
  },
  aviaryScriptHash: {
    format: String,
    default: '',
    arg: 'aviaryScriptHash',
    env: 'AVIARY_SCRIPT_HASH',
  },
  flamingoRouterScriptHash: {
    format: String,
    default: '',
    arg: 'flamingoRouterScriptHash',
    env: 'FLAMINGO_ROUTER_SCRIPT_HASH',
  },
  flamingoSwapFactoryScriptHash: {
    format: String,
    default: '',
    arg: 'flamingoSwapFactoryScriptHash',
    env: 'FLAMINGO_SWAP_FACTORY_SCRIPT_HASH',
  },
  flmFusdtScriptHash: {
    format: String,
    default: '',
    arg: 'flmFusdtScriptHash',
    env: 'FLM_FUSDT_SCRIPT_HASH',
  },
  flmLrbScriptHash: {
    format: String,
    default: '',
    arg: 'flmLrbScriptHash',
    env: 'FLM_LRB_SCRIPT_HASH',
  },
  flmUsdlScriptHash: {
    format: String,
    default: '',
    arg: 'flmUsdlScriptHash',
    env: 'FLM_USDL_SCRIPT_HASH',
  },
  priceUrl: {
    format: String,
    default: '',
    arg: 'priceUrl',
    env: 'PRICE_URL',
  },
  targetPriceUrl: {
    format: String,
    default: '',
    arg: 'targetPriceUrl',
    env: 'TARGET_PRICE_URL',
  },
  binanceFlmPrice: {
    format: Boolean,
    default: false,
    arg: 'binanceFlmPrice',
    env: 'BINANCE_FLM_PRICE',
  },
  binanceRestUrl: {
    format: String,
    default: '',
    arg: 'binanceRestUrl',
    env: 'BINANCE_REST_URL',
  },
  binanceWsUrl: {
    format: String,
    default: '',
    arg: 'binanceWsUrl',
    env: 'BINANCE_WS_URL',
  },
  stalePriceMillis: {
    format: Number,
    default: 60000,
    arg: 'stalePriceMillis',
    env: 'STALE_PRICE_MILLIS',
  },
  pegThreshold: {
    format: Number,
    default: 1.05,
    arg: 'pegThreshold',
    env: 'PEG_THRESHOLD',
  },
  balanceThreshold: {
    format: Number,
    default: 0.25,
    arg: 'balanceThreshold',
    env: 'BALANCE_THRESHOLD',
  },
  swapRatio: {
    format: Number,
    default: 0.75,
    arg: 'swapRatio',
    env: 'SWAP_RATIO',
  },
  maxSpread: {
    format: Number,
    default: 100,
    arg: 'maxSpread',
    env: 'MAX_SPREAD',
  },
  slippageTolerance: {
    format: Number,
    default: 0.05,
    arg: 'slippageTolerance',
    env: 'SLIPPAGE_TOLERANCE',
  },
  sleepMillis: {
    format: Number,
    default: 300_000,
    arg: 'sleepMillis',
    env: 'SLEEP_MILLIS',
  },
  verifyWaitMillis: {
    format: Number,
    default: 60_000,
    arg: 'verifyWaitMillis',
    env: 'VERIFY_WAIT_MILLIS',
  },
  dryRun: {
    format: Boolean,
    default: true,
    arg: 'dryRun',
    env: 'DRY_RUN',
  },
});

const env = config.get('env');
config.loadFile(`./config/${env}.json`);
config.validate({ allowed: 'strict' }); // throws error if config does not conform to schema

// eslint-disable-next-line import/prefer-default-export
export { config };
