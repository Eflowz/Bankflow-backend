import pino from 'pino';
import { isDev } from '../config/env.js';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  // Pretty-print in dev for readability; structured JSON in prod for log aggregation.
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  // Redact sensitive fields if they ever get logged
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
});