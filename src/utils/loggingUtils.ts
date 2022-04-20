import { pino } from 'pino';
import { config } from '../config';

const properties = config.getProperties();

const NODE_ENV: string = properties.env;

const logger = pino({
  level: NODE_ENV === 'prod' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: false,
      levelFirst: true,
      ignore: 'pid,hostname',
      translateTime: 'yyyy-dd-mm HH:MM:ss',
    },
  },
});

// eslint-disable-next-line import/prefer-default-export
export { logger };
