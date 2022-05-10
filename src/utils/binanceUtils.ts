/* eslint-disable no-unused-vars */
import { rpc } from '@cityofzion/neon-js';
import axios from 'axios';
import { RawData, WebSocket } from 'ws';
import { config } from '../config';
import { logger } from './loggingUtils';

type Price = {
  price: number,
  timestamp: number,
}

type BinancePriceSource = {
  available: Promise<boolean>,
  getFlmPrice: Function,
};

const properties = config.getProperties();

const BINANCE_FLM_PRICE: boolean = properties.binanceFlmPrice;
const BINANCE_REST_URL: string = properties.binanceRestUrl;
const BINANCE_WS_URL: string = properties.binanceWsUrl;
const STALE_PRICE_MILLIS: number = properties.stalePriceMillis;

let FLM_BINANCE_PRICE: Price = {
  price: 0.0,
  timestamp: 0,
};

async function onPriceFeedCallback(
  callbackData: RawData,
  isBinary: boolean,
): Promise<void> {
  const message = isBinary ? callbackData : callbackData.toString();
  const data = JSON.parse(message as string);
  if (data && data.p && data.T) {
    FLM_BINANCE_PRICE = {
      price: +data.p,
      timestamp: +data.T,
    };
  }
}

function getFlmPrice() {
  return {
    price: +FLM_BINANCE_PRICE.price,
    isStale: FLM_BINANCE_PRICE.timestamp < Date.now() - STALE_PRICE_MILLIS,
  };
}

const initPriceFeed = async () => {
  let resolveAvailable: Function;
  // Initialize the Binance feed
  if (BINANCE_FLM_PRICE) {
    const priceFeedAvailable = new Promise<boolean>((resolve, _) => {
      resolveAvailable = resolve;
    });

    const ws = new WebSocket(BINANCE_WS_URL);
    ws.on('message', onPriceFeedCallback);
    ws.onopen = () => {
      axios.get(BINANCE_REST_URL).then((ret) => {
        FLM_BINANCE_PRICE = {
          price: +ret.data.price,
          timestamp: Date.now(),
        };
        resolveAvailable(true);
      });
    };
    const priceSourceImpl: BinancePriceSource = <BinancePriceSource>{
      available: priceFeedAvailable,
      getFlmPrice,
    };
    logger.info('Initialized Binance price feed for FLM');
    return priceSourceImpl;
  }
  // Do not initialize the feed
  const priceFeedAvailable = new Promise<boolean>((resolve, _) => {
    resolve(true);
  });
  const priceSourceImpl: BinancePriceSource = <BinancePriceSource>{
    available: priceFeedAvailable,
    getFlmPrice,
  };
  logger.info('Did not initialize Binance price feed for FLM');
  return priceSourceImpl;
};

function BinancePriceInit(): Promise<BinancePriceSource> {
  return initPriceFeed();
}

export type { BinancePriceSource };
export { BinancePriceInit };
