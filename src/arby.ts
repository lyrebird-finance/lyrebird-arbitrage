/* eslint-disable no-await-in-loop */
import { CONST, wallet } from '@cityofzion/neon-core';
import { RawData } from 'ws';
import { config } from './config';
import { logger } from './utils/loggingUtils';

import { DapiUtils } from './utils/dapiUtils';
import { ExchangeUtils } from './utils/exchangeUtils';
import { NeoNotification, NeoNotificationInit } from './utils/notificationUtils';

const properties = config.getProperties();

const PRIVATE_KEY: string = properties.privateKey;
const OWNER: wallet.Account = new wallet.Account(PRIVATE_KEY);
const DRY_RUN: boolean = properties.dryRun;

const PEG_THRESHOLD = properties.pegThreshold;
const BALANCE_THRESHOLD = properties.balanceThreshold;
// The fraction of the swap amount to return to the peg to buy/sell at once
const SWAP_RATIO = properties.swapRatio;
// MAX_SPREAD is expressed in basis points
const MAX_SPREAD = properties.maxSpread;
// SLIPPAGE_TOLERANCE is expressed in basis points
const SLIPPAGE_TOLERANCE = properties.slippageTolerance;
const SLEEP_MILLIS = properties.sleepMillis;
const VERIFY_WAIT_MILLIS = properties.verifyWaitMillis;

/**
 * Wait for a notification due to the desired Flamingo swap
 *
 * @param contractHash the hash of the token to be received
 * @param notification a WebSocket notification handler
 *
 * @returns the success of the verification.
 */
async function completeFlamingoSwap(contractHash: string, notification: NeoNotification) {
  let swapResolve: Function;
  // eslint-disable-next-line no-unused-vars
  const swapPromise = new Promise<string>((resolve, _) => {
    swapResolve = resolve;
  });
  const swapFailedT = setTimeout(() => {
    logger.info(`Flamingo swap wasn't received after ${VERIFY_WAIT_MILLIS} milliseconds.`);
    swapResolve(false);
  }, VERIFY_WAIT_MILLIS);

  async function completeFlamingoSwapCallback(
    callbackData: RawData,
    isBinary: boolean,
  ): Promise<void> {
    const message = isBinary ? callbackData : callbackData.toString();
    const data = JSON.parse(message as string);
    if (data.params) {
      const txid = data.params[0].container;
      const recipientHash = data.params[0].state.value[1].value;
      if (DapiUtils.base64MatchesAddress(recipientHash, OWNER.address)) {
        clearTimeout(swapFailedT);
        swapResolve(txid);
        notification.offCallback(completeFlamingoSwapCallback);
        logger.info(`Flamingo swap ${txid} successful`);
      }
    }
  }
  notification.onCallback(contractHash, 'Transfer', completeFlamingoSwapCallback);
  return swapPromise;
}

/**
 * Wait for a notification due to the desired Aviary swap
 * If the Oracle transaction has not been verified before
 * {@link VERIFY_WAIT_MILLIS} has elapsed, resolve the promise.
 *
 * @param contractHash the hash of the token to be received
 * @param notification a WebSocket notification handler
 *
 * @returns the success of the verification.
 */
async function completeAviarySwap(notification: NeoNotification) {
  let swapResolve: Function;
  // eslint-disable-next-line no-unused-vars
  const swapPromise = new Promise<string>((resolve, _) => {
    swapResolve = resolve;
  });
  const swapFailedT = setTimeout(() => {
    logger.info(`Aviary swap wasn't received after ${VERIFY_WAIT_MILLIS} milliseconds.`);
    swapResolve(false);
  }, VERIFY_WAIT_MILLIS);

  async function aviarySwapSuccess(
    callbackData: RawData,
    isBinary: boolean,
  ): Promise<void> {
    const message = isBinary ? callbackData : callbackData.toString();
    const data = JSON.parse(message as string);
    if (data.params && data.params[0].eventname === 'Swap') {
      const txid = data.params[0].container;
      const accountHash = data.params[0].state.value[0].value;

      if (DapiUtils.base64MatchesAddress(accountHash, OWNER.address)) {
        clearTimeout(swapFailedT);
        swapResolve(true);
        notification.offCallback(aviarySwapSuccess);
        logger.info(`Aviary swap ${txid} succeeded`);
      }
    }
  }
  async function aviarySwapFailure(
    callbackData: RawData,
    isBinary: boolean,
  ): Promise<void> {
    const message = isBinary ? callbackData : callbackData.toString();
    const data = JSON.parse(message as string);
    if (data.params && data.params[0].eventname === 'SwapFailure') {
      const txid = data.params[0].container;
      const event = data.params[0].eventname;
      const accountHash = data.params[0].state.value[0].value;

      if (DapiUtils.base64MatchesAddress(accountHash, OWNER.address)) {
        clearTimeout(swapFailedT);
        swapResolve(false);
        notification.offCallback(aviarySwapFailure);
        logger.info(`${event} Aviary event ${txid} received`);
      }
    }
  }
  notification.onCallback(DapiUtils.AVIARY_SCRIPT_HASH, 'Swap', aviarySwapSuccess);
  notification.onCallback(DapiUtils.AVIARY_SCRIPT_HASH, 'SwapFailure', aviarySwapFailure);
  return swapPromise;
}

/**
 * Create a transaction on Flamingo to swap LRB for USDL.
 * The quantity of USDL to be bought is the quantity that
 * perfectly balances the FLM_USDL pool with a factor of
 * {@link SWAP_RATIO} applied.
 *
 * @param notification a WebSocket notification handler
 */
async function buyUsdl(notification : NeoNotification) {
  const perfectUsdlBuyQuantityP = ExchangeUtils.getUsdlBuyQuantity();
  const lrbPriceInFlmP = ExchangeUtils.getLrbPriceInFlm();
  const usdlPriceInFlmP = ExchangeUtils.getUsdlPriceInFlm();
  const lrbBalanceP = DapiUtils.getBalance(DapiUtils.LRB_SCRIPT_HASH, OWNER);

  const ret = await Promise.all(
    [perfectUsdlBuyQuantityP, lrbPriceInFlmP, usdlPriceInFlmP, lrbBalanceP],
  );
  const perfectUsdlBuyQuantity = ret[0];
  const lrbPriceInFlm = ret[1];
  const usdlPriceInFlm = ret[2];
  const lrbBalance = ret[3];

  // The estimated max buy quantity is the equivalent value of USDL
  // of our LRB balance with the slippage tolerance
  const estMaxBuyQuantity = Math.round(
    (lrbBalance * lrbPriceInFlm) / (usdlPriceInFlm * (1 + (SLIPPAGE_TOLERANCE / 10000))),
  );

  const desiredUsdlBuyQuantity = Math.round(perfectUsdlBuyQuantity * SWAP_RATIO);
  const usdlBuyQuantity = Math.min(desiredUsdlBuyQuantity, estMaxBuyQuantity);

  // The max in quantity is the fair value with a tolerance
  const maxInQuantity = Math.round(
    (usdlBuyQuantity * usdlPriceInFlm * (1 + (SLIPPAGE_TOLERANCE / 10000))) / lrbPriceInFlm,
  );

  logger.debug(`Computed buyUsdl: usdlBuyQuantity=${usdlBuyQuantity} `
    + `desiredUsdlBuyQuantity=${desiredUsdlBuyQuantity}, `
    + `perfectUsdlBuyQuantity=${perfectUsdlBuyQuantity}, `
    + `maxInQuantity=${maxInQuantity}, `
    + `lrbPriceInFlm=${lrbPriceInFlm}, `
    + `usdlPriceInFlm=${usdlPriceInFlm}, `
    + `lrbBalance=${lrbBalance}`);

  try {
    const transaction = await DapiUtils.createFlamingoSwapLrbForUsdl(
      usdlBuyQuantity,
      maxInQuantity,
      OWNER,
    );
    await DapiUtils.checkNetworkFee(transaction);
    await DapiUtils.checkSystemFee(transaction);
    if (DRY_RUN) {
      logger.info('Not submitting buyUsdl transaction due to dry run with: '
                 + `usdlBuyQuantity=${usdlBuyQuantity}, `
                 + `maxInQuantity=${maxInQuantity}`);
    } else {
      logger.info('Submitting buyUsdl transaction with: '
                 + `usdlBuyQuantity=${usdlBuyQuantity}, `
                 + `maxInQuantity=${maxInQuantity}`);
      const swapComplete = completeFlamingoSwap(DapiUtils.USDL_SCRIPT_HASH, notification);
      await DapiUtils.performTransfer(transaction, OWNER);
      await swapComplete;
    }
  } catch (e) {
    logger.error(e, 'Failed to submit buyUsdl transaction - likely due to slippage being too high');
  }
}

/**
 * Create a transaction on Flamingo to swap USDL for LRB.
 * The quantity of USDL to be sold is the quantity that
 * perfectly balances the FLM_USDL pool with a factor of
 * {@link SWAP_RATIO} applied.
 *
 * @param notification a WebSocket notification handler
 */
async function sellUsdl(notification : NeoNotification) {
  const perfectUsdlSellQuantityP = ExchangeUtils.getUsdlSellQuantity();
  const lrbPriceInFlmP = ExchangeUtils.getLrbPriceInFlm();
  const usdlPriceInFlmP = ExchangeUtils.getUsdlPriceInFlm();
  const usdlBalanceP = DapiUtils.getBalance(DapiUtils.USDL_SCRIPT_HASH, OWNER);

  const ret = await Promise.all(
    [perfectUsdlSellQuantityP, lrbPriceInFlmP, usdlPriceInFlmP, usdlBalanceP],
  );
  const perfectUsdlSellQuantity = ret[0];
  const lrbPriceInFlm = ret[1];
  const usdlPriceInFlm = ret[2];
  const usdlBalance = ret[3];

  const desiredUsdlSellQuantity = Math.round(perfectUsdlSellQuantity * SWAP_RATIO);
  const usdlSellQuantity = Math.min(desiredUsdlSellQuantity, usdlBalance);

  // The min out quantity is the fair value with a tolerance
  const minOutQuantity = Math.round(
    (usdlSellQuantity * usdlPriceInFlm) / (lrbPriceInFlm * (1 + (SLIPPAGE_TOLERANCE / 10000))),
  );

  logger.debug(`Computed sellUsdl: usdlSellQuantity=${usdlSellQuantity} `
    + `desiredUsdlSellQuantity=${desiredUsdlSellQuantity}, `
    + `perfectUsdlSellQuantity=${perfectUsdlSellQuantity}, `
    + `minOutQuantity=${minOutQuantity}, `
    + `lrbPriceInFlm=${lrbPriceInFlm}, `
    + `usdlPriceInFlm=${usdlPriceInFlm}, `
    + `usdlBalance=${usdlBalance}`);

  try {
    const transaction = await DapiUtils.createFlamingoSwapUsdlForLrb(
      usdlSellQuantity,
      minOutQuantity,
      OWNER,
    );
    await DapiUtils.checkNetworkFee(transaction);
    await DapiUtils.checkSystemFee(transaction);
    if (DRY_RUN) {
      logger.info('Not submitting sellUsdl transaction due to dry run with: '
                 + `usdlSellQuantity=${usdlSellQuantity}, `
                 + `minOutQuantity=${minOutQuantity}`);
    } else {
      logger.info('Submitting sellUsdl transaction with: '
                 + `usdlSellQuantity=${usdlSellQuantity}, `
                 + `minOutQuantity=${minOutQuantity}`);
      const swapComplete = completeFlamingoSwap(DapiUtils.LRB_SCRIPT_HASH, notification);
      await DapiUtils.performTransfer(transaction, OWNER);
      await swapComplete;
    }
  } catch (e) {
    logger.error(e, 'Failed to submit sellUsdl transaction - likely due to slippage being too high');
  }
}

/**
 * Rebalance the wallet's LRB/USDL balances to be equal in market value.
 *
 * @param notification a WebSocket notification handler
 */
async function rebalance(notification : NeoNotification) {
  const lrbPriceP = ExchangeUtils.getFlamingoLrbPrice();
  const usdlPriceP = ExchangeUtils.getFlamingoUsdlPrice();
  const lrbBalanceP = DapiUtils.getBalance(DapiUtils.LRB_SCRIPT_HASH, OWNER);
  const usdlBalanceP = DapiUtils.getBalance(DapiUtils.USDL_SCRIPT_HASH, OWNER);
  const lrbGlobalPriceP = ExchangeUtils.getGlobalLrbPrice();
  const usdlGlobalPriceP = ExchangeUtils.getGlobalUsdlPrice();

  const ret = await Promise.all(
    [lrbPriceP, usdlPriceP, lrbBalanceP, usdlBalanceP, lrbGlobalPriceP, usdlGlobalPriceP],
  );
  const lrbPrice = ret[0];
  const usdlPrice = ret[1];
  const lrbBalance = ret[2];
  const usdlBalance = ret[3];
  const lrbGlobalPrice = ret[4];
  const usdlGlobalPrice = ret[5];

  const lrbValue = lrbBalance * lrbPrice;
  const usdlValue = usdlBalance * usdlPrice;

  // Rebalancing is configured to be when the market value
  // of either token drops below BALANCE_THRESHOLD of
  // the combined market value of the two tokens.
  const totalValue = lrbValue + usdlValue;
  const targetValue = totalValue / 2.0;

  logger.debug(`Entered rebalance with: lrbBalance=${lrbBalance}, `
               + `usdlBalance=${usdlBalance}, `
               + `lrbValue=${lrbValue}, `
               + `usdlValue=${usdlValue}, `
               + `totalValue=${totalValue}`);

  let transaction = null;
  let swapQuantity = null;
  if (lrbValue / totalValue < BALANCE_THRESHOLD) {
    const swapValue = targetValue - lrbValue;
    swapQuantity = Math.round(swapValue / usdlPrice);
    const swapComputation = await DapiUtils.computeAviarySwap(
      Math.round(lrbGlobalPrice * ExchangeUtils.PRICE_MULT),
      Math.round(usdlGlobalPrice * ExchangeUtils.PRICE_MULT),
      true,
      swapQuantity,
    );

    logger.info(`Estimated spread=${swapComputation.spread} with `
               + `lrbGlobalPrice=${lrbGlobalPrice}, `
               + `usdlGlobalPrice=${usdlGlobalPrice}, `
               + `swapQuantity=${swapQuantity / 10 ** ExchangeUtils.USDL_DECIMALS}`);

    if (swapComputation.spread > MAX_SPREAD) {
      logger.warn(`Not swapping ${swapQuantity} USDL for LRB because `
                 + `computed spread=${swapComputation.spread} > MAX_SPREAD=${MAX_SPREAD}`);
    } else {
      transaction = await DapiUtils.createAviarySwapUsdlForLrb(swapQuantity, MAX_SPREAD, OWNER);
      logger.info(`Created transaction to swap ${swapQuantity} USDL for LRB, MAX_SPREAD=${MAX_SPREAD}`);
    }
  } else if (usdlValue / totalValue < BALANCE_THRESHOLD) {
    const swapValue = targetValue - usdlValue;
    swapQuantity = Math.round(swapValue / lrbPrice);
    const swapComputation = await DapiUtils.computeAviarySwap(
      Math.round(lrbGlobalPrice * ExchangeUtils.PRICE_MULT),
      Math.round(usdlGlobalPrice * ExchangeUtils.PRICE_MULT),
      false,
      swapQuantity,
    );

    logger.info(`Estimated spread=${swapComputation.spread} with `
               + `lrbGlobalPrice=${lrbGlobalPrice}, `
               + `usdlGlobalPrice=${usdlGlobalPrice}, `
               + `swapQuantity=${swapQuantity / 10 ** ExchangeUtils.LRB_DECIMALS}`);

    if (swapComputation.spread > MAX_SPREAD) {
      logger.warn(`Not swapping ${swapQuantity} LRB for USDL because `
                 + `computed spread=${swapComputation.spread} > MAX_SPREAD=${MAX_SPREAD}`);
    } else {
      logger.info(`Created transaction to swap ${swapQuantity} LRB for USDL, MAX_SPREAD=${MAX_SPREAD}`);
      transaction = await DapiUtils.createAviarySwapLrbForUsdl(swapQuantity, MAX_SPREAD, OWNER);
    }
  } else {
    logger.info('Not rebalancing this cycle');
  }

  if (transaction !== null) {
    await DapiUtils.checkNetworkFee(transaction);
    await DapiUtils.checkSystemFee(transaction);
    if (DRY_RUN) {
      logger.info('Not submitting rebalance transaction due to dry run with: '
               + `swapQuantity=${swapQuantity}, `
               + `lrbValue=${lrbValue}, `
               + `usdlValue=${usdlValue}, `
               + `totalValue=${totalValue}`);
    } else {
      logger.info('Submitting rebalance transaction with: '
               + `swapQuantity=${swapQuantity}, `
               + `lrbValue=${lrbValue}, `
               + `usdlValue=${usdlValue}, `
               + `totalValue=${totalValue}`);
      const swapComplete = completeAviarySwap(notification);
      await DapiUtils.performTransfer(transaction, OWNER);
      await swapComplete;
    }
  }
}

async function getBalances() {
  const lrbBalanceP = DapiUtils.getBalance(DapiUtils.LRB_SCRIPT_HASH, OWNER);
  const usdlBalanceP = DapiUtils.getBalance(DapiUtils.USDL_SCRIPT_HASH, OWNER);
  const gasBalanceP = DapiUtils.getBalance(CONST.NATIVE_CONTRACT_HASH.GasToken, OWNER);
  const gasDecimals = 8;

  return Promise.all([lrbBalanceP, usdlBalanceP, gasBalanceP]).then((ret) => {
    const lrbMultiplier = 10 ** ExchangeUtils.LRB_DECIMALS;
    const usdlMultiplier = 10 ** ExchangeUtils.USDL_DECIMALS;
    const gasMultiplier = 10 ** gasDecimals;
    return [
      ret[0] / lrbMultiplier, 
      ret[1] / usdlMultiplier,
      ret[2] / gasMultiplier
    ];
  });
}

async function printBalances() {
  const lrbPriceP = ExchangeUtils.getGlobalLrbPrice();
  const usdlPriceP = ExchangeUtils.getGlobalUsdlPrice();
  return Promise.all([getBalances(), lrbPriceP, usdlPriceP]).then((ret) => {
    const balances = ret[0];
    const lrbBalance = balances[0];
    const usdlBalance = balances[1];
    const gasBalance = balances[2];
    const lrbPrice = ret[1];
    const usdlPrice = ret[2];
    const lrbValue = lrbPrice * lrbBalance;
    const usdlValue = usdlPrice * usdlBalance;
    const totalValue = lrbValue + usdlValue;

    const formatNumber = (number: number, fractionDigits: number = 2): string => {
      const defaultRuntimeLocale = undefined;
      return number.toLocaleString(
        defaultRuntimeLocale, 
        { 
          maximumFractionDigits: fractionDigits, 
          minimumFractionDigits: fractionDigits
        }
      );
    };

    logger.info('');
    logger.info('------Balances-------');
    logger.info(`LRB Balance: ${formatNumber(lrbBalance)}`);
    logger.info(`USDL Balance: ${formatNumber(usdlBalance)}`);
    logger.info(`GAS Balance: ${formatNumber(gasBalance)}`);
    logger.info('');
    logger.info('-------Prices--------');
    logger.info(`LRB Global Price: ${formatNumber(lrbPrice, 4)}`);
    logger.info(`USDL Global Price: ${formatNumber(usdlPrice, 4)}`);
    logger.info('');
    logger.info('--USD Market Values--');
    logger.info(`LRB Market Value: ${formatNumber(lrbValue)}`);
    logger.info(`USDL Market Value: ${formatNumber(usdlValue)}`);
    logger.info(`Total Market Value: ${formatNumber(totalValue)}`);
    logger.info('');
  });
}

function sleep(millis: number) {
  // eslint-disable-next-line no-promise-executor-return
  return new Promise((resolve) => setTimeout(resolve, millis));
}

// Main loop
(async () => {
  // 0. Wait for initialization
  logger.info('Starting arby...');
  await ExchangeUtils.initComplete;
  const notification = await NeoNotificationInit();
  await notification.available;

  const { address } = OWNER;
  logger.info(`Wallet address=${address}`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const startMillis = new Date().getTime();
    await printBalances();
    // 1. Compute current exchange and target prices of USDL
    const flamingoUsdlPrice = await ExchangeUtils.getFlamingoUsdlPrice();
    // For USDL, the target price is simply 1.00
    const usdlTargetPrice = 1.00;
    const flamingoTargetRatio = flamingoUsdlPrice / usdlTargetPrice;
    logger.debug(`Fetched prices: flamingoUsdlPrice=${flamingoUsdlPrice}, usdlTargetPrice=${usdlTargetPrice}, `
      + `flamingoTargetRatio=${flamingoTargetRatio}, PEG_THRESHOLD=${PEG_THRESHOLD}`);

    if (flamingoTargetRatio > (1.0 + PEG_THRESHOLD)) {
      // 2. If current exchange price > target price by more than the threshold, sell on Flamingo
      logger.info(`Selling USDL because flamingoTargetRatio=${flamingoTargetRatio} and PEG_THRESHOLD=${PEG_THRESHOLD}`);
      await sellUsdl(notification);
    } else if ((usdlTargetPrice / flamingoUsdlPrice) > (1.0 + PEG_THRESHOLD)) {
      // 3. If current Oracle price < target price by more than the threshold, buy on Flamingo
      logger.info(`Buying USDL because inverse flamingoTargetRatio=${1 / flamingoTargetRatio} and PEG_THRESHOLD=${PEG_THRESHOLD}`);
      await buyUsdl(notification);
    } else {
      logger.info(`Not performing any trades this cycle with flamingoTargetRatio=${flamingoTargetRatio} and PEG_THRESHOLD=${PEG_THRESHOLD}`);
    }

    // 4. Rebalance LRB/USDL if past threshold
    await rebalance(notification);

    const elapsedMillis = new Date().getTime() - startMillis;
    const remainingMillis = Math.max(0, SLEEP_MILLIS - elapsedMillis);
    if (remainingMillis > 0) {
      logger.info(`Sleeping ${remainingMillis} milliseconds...`);
      await sleep(remainingMillis);
    }
  }
})();
