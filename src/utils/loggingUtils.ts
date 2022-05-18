import { DestinationStream, LoggerOptions, multistream, pino } from 'pino';
import { createWriteStream } from 'pino-sentry';
import { config } from '../config';
import PinoPretty from 'pino-pretty';

const properties = config.getProperties();

// - standard output with pretty
const pinoPrettyStream = PinoPretty({
  colorize: false,
  levelFirst: true,
  ignore: 'pid,hostname',
  translateTime: 'yyyy-dd-mm HH:MM:ss',
});

// - sentry output without pretty
const WITH_SENTRY: boolean = properties.withSentry;
const SENTRY_DSN: string = properties.sentryDsn;

const sentryStream = WITH_SENTRY
  ? createWriteStream({ dsn: SENTRY_DSN, level: 'warning' })
  : undefined;

// - streams 
const streams = [pinoPrettyStream, sentryStream as DestinationStream]
  .filter(stream => stream !== undefined)
  .map(stream => ({ stream }));

// - logger
const NODE_ENV: string = properties.env;

const loggerOpts: LoggerOptions = {
  level: NODE_ENV === 'prod' ? 'info' : 'debug'
};

const logger = pino(loggerOpts, multistream(streams));

// eslint-disable-next-line import/prefer-default-export
export { logger };
