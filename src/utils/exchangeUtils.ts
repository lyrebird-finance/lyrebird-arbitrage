import axios from 'axios';
import { u } from '@cityofzion/neon-core';
import { config } from '../config';
import { logger } from './loggingUtils';
import { DapiUtils } from './dapiUtils';
import { BinancePriceSource, BinancePriceInit } from './binanceUtils';

const properties = config.getProperties();

// Token names
export const LRB = 'LRB';
export const USDL = 'USDL';

export const PRICE_MULT = 1_000_000;

// Decimals
const FLM_DECIMALS = 8;
const FUSDT_DECIMALS = 6;
export const LRB_DECIMALS = 8;
export const USDL_DECIMALS = 8;

// Prices
export const PRICE_URL: string = properties.priceUrl;
export const TARGET_PRICE_URL: string = properties.targetPriceUrl;
const BINANCE_FLM_PRICE: boolean = properties.binanceFlmPrice;

let BINANCE_PRICE_SOURCE: BinancePriceSource;

// These are true if the [token0, token1] ordering is reversed from the FLP name
// and false if the ordering is the same
let FLM_FUSDT_REVERSED: boolean;
let FLM_LRB_REVERSED: boolean;
let FLM_USDL_REVERSED: boolean;
let resolveInitComplete: Function;

// initComplete MUST HAVE RETURNED true before methods can be called
// eslint-disable-next-line no-unused-vars
export const initComplete = new Promise<boolean>((resolve, _) => {
  resolveInitComplete = resolve;
});

async function getFlmIndex(scriptHash: string) {
  return DapiUtils.getToken0(scriptHash).then((token0) => {
    const tokenHash0 = u.HexString.fromHex(token0 as string).toLittleEndian();
    const flmTokenHash = u.HexString.fromHex(DapiUtils.FLM_SCRIPT_HASH).toLittleEndian();
    return tokenHash0 === flmTokenHash ? 0 : 1;
  });
}

Promise.all([
  BinancePriceInit(),
  getFlmIndex(DapiUtils.FLM_FUSDT_SCRIPT_HASH),
  getFlmIndex(DapiUtils.FLM_LRB_SCRIPT_HASH),
  getFlmIndex(DapiUtils.FLM_USDL_SCRIPT_HASH)]).then((ret) => {
  const binancePrice = ret[0];
  const flmFusdtFlmIndex = ret[1];
  const flmLrbFlmIndex = ret[2];
  const flmUsdlFlmIndex = ret[3];

  BINANCE_PRICE_SOURCE = binancePrice;
  FLM_FUSDT_REVERSED = flmFusdtFlmIndex === 1;
  FLM_LRB_REVERSED = flmLrbFlmIndex === 1;
  FLM_USDL_REVERSED = flmUsdlFlmIndex === 1;
  logger.debug(`Initialized FLM_FUSDT_REVERSED=${FLM_FUSDT_REVERSED}, `
               + `FLM_LRB_REVERSED=${FLM_LRB_REVERSED}, FLM_USDL_REVERSED=${FLM_USDL_REVERSED}`);

  BINANCE_PRICE_SOURCE.available.then(() => {
    resolveInitComplete(true);
  });
});

export async function getLrbPriceInFlm() {
  return DapiUtils.getPoolReserves(DapiUtils.FLM_LRB_SCRIPT_HASH).then((ret) => {
    const flmLrbReserves = ret;
    const flmIndex = FLM_LRB_REVERSED ? 1 : 0;
    const lrbIndex = 1 - flmIndex;

    const flmReserves = parseInt(flmLrbReserves[flmIndex].value as string, 10);
    const lrbReserves = parseInt(flmLrbReserves[lrbIndex].value as string, 10);
    const lrbInFlm = (flmReserves / 10 ** FLM_DECIMALS) / (lrbReserves / 10 ** LRB_DECIMALS);

    return lrbInFlm;
  });
}

export async function getUsdlPriceInFlm() {
  return DapiUtils.getPoolReserves(DapiUtils.FLM_USDL_SCRIPT_HASH).then((ret) => {
    const flmUsdlReserves = ret;
    const flmIndex = FLM_USDL_REVERSED ? 1 : 0;
    const usdlIndex = 1 - flmIndex;

    const flmReserves = parseInt(flmUsdlReserves[flmIndex].value as string, 10);
    const usdlReserves = parseInt(flmUsdlReserves[usdlIndex].value as string, 10);
    const usdlInFlm = (flmReserves / 10 ** FLM_DECIMALS) / (usdlReserves / 10 ** USDL_DECIMALS);

    return usdlInFlm;
  });
}

export async function getFlmPriceInFusdt() {
  const binancePrice = BINANCE_PRICE_SOURCE.getFlmPrice();

  if (binancePrice.isStale) {
    // We should have prices from Binance
    if (BINANCE_FLM_PRICE) {
      logger.error('Falling back to Flamingo FLM price because Binance FLM price is stale...');
    }
    return DapiUtils.getPoolReserves(DapiUtils.FLM_FUSDT_SCRIPT_HASH).then((ret) => {
      const flmFusdtReserves = ret;
      const flmIndex = FLM_FUSDT_REVERSED ? 1 : 0;
      const fusdtIndex = 1 - flmIndex;

      const flmReserves = parseInt(flmFusdtReserves[flmIndex].value as string, 10);
      const fusdtReserves = parseInt(flmFusdtReserves[fusdtIndex].value as string, 10);
      const flmInFusdt = (fusdtReserves / 10 ** FUSDT_DECIMALS)
      / (flmReserves / 10 ** FLM_DECIMALS);

      return flmInFusdt;
    });
  }
  // Not stale
  return new Promise<number>((resolve) => {
    resolve(binancePrice.price);
  });
}

export async function getGlobalLrbPrice() {
  return axios.get(`${PRICE_URL}?token=${LRB}`).then((ret) => ret.data[LRB] / PRICE_MULT);
}

export async function getFlamingoLrbPrice() {
  const ret = await Promise.all([getLrbPriceInFlm(), getFlmPriceInFusdt()]);
  const lrbPriceInFlm = ret[0];
  const flmPriceInFusdt = ret[1];

  return lrbPriceInFlm * flmPriceInFusdt;
}

export async function getGlobalUsdlPrice() {
  return axios.get(`${PRICE_URL}?token=${USDL}`).then((ret) => ret.data[USDL] / PRICE_MULT);
}

export async function getFlamingoUsdlPrice() {
  const ret = await Promise.all([getUsdlPriceInFlm(), getFlmPriceInFusdt()]);
  const usdlPriceInFlm = ret[0];
  const flmPriceInFusdt = ret[1];

  return usdlPriceInFlm * flmPriceInFusdt;
}

export async function getTargetUsdlPrice() {
  return axios.get(`${TARGET_PRICE_URL}?token=${USDL}`).then((ret) => ret.data[USDL] / PRICE_MULT);
}

/**
 * We start with the invariant that k = flmReserves * usdlReserves
 * => newFlmReserves = k / newUsdlReserves
 *
 * We also know the following:
 * FLM_PRICE = newUsdlReserves / newFlmReserves
 * => newUsdlReserves = FLM_PRICE * newFlmReserves
 *
 * Taking FLM_PRICE as a constant from the FLM_fUSDT pool,
 *
 * newUsdlReserves = FLM_PRICE * newFlmReserves
 * newUsdlReserves = FLM_PRICE * (k / newUsdlReserves)
 * newUsdlReserves^2 = FLM_PRICE * k
 * newUsdlReserves = sqrt(FLM_PRICE * k)
 *
 * usdlBuyQuantity = usdlReserves - newUsdlReserves
 *
 * @returns the buy quantity of USDL that balances the FLM_USDL pool
 */
export async function getUsdlBuyQuantity() {
  const flmPriceInFusdtP = getFlmPriceInFusdt();
  const flmUsdlReservesP = DapiUtils.getPoolReserves(DapiUtils.FLM_USDL_SCRIPT_HASH);

  return Promise.all([flmPriceInFusdtP, flmUsdlReservesP]).then((ret) => {
    const flmPriceInFusdt = ret[0];
    const flmUsdlReserves = ret[1];

    const flmIndex = FLM_USDL_REVERSED ? 1 : 0;
    const usdlIndex = 1 - flmIndex;
    const flmReserves = parseInt(flmUsdlReserves[flmIndex].value as string, 10)
      / 10 ** FLM_DECIMALS;
    const usdlReserves = parseInt(flmUsdlReserves[usdlIndex].value as string, 10)
      / 10 ** USDL_DECIMALS;
    const k = flmReserves * usdlReserves;

    const desiredUsdlReserves = Math.sqrt(flmPriceInFusdt * k);
    const usdlBuyQuantity = usdlReserves - desiredUsdlReserves;

    logger.debug(`ComputedusdlBuyQuantity = ${usdlBuyQuantity} with `
      + `flmReserves = ${flmReserves}, `
      + `usdlReserves = ${usdlReserves}, `
      + `desiredUsdlReserves = ${desiredUsdlReserves}, `
      + `desiredFlmReserves = ${k / desiredUsdlReserves}`);

    return Math.round(usdlBuyQuantity * 10 ** USDL_DECIMALS);
  });
}

/**
 * This is simply just the negative value of {@link getUsdlBuyQuantity()}
 *
 * @returns the sell quantity of USDL that balances the FLM_USDL pool
 */
export async function getUsdlSellQuantity() {
  return getUsdlBuyQuantity().then((ret) => -ret);
}

// eslint-disable-next-line import/no-self-import
export * as ExchangeUtils from './exchangeUtils';
