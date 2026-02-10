/**
 * Logger utility — wraps console methods so they only output in development.
 * In production builds (import.meta.env.PROD), all calls are no-ops.
 *
 * Usage:
 *   import { logger } from './services/logger';
 *   logger.log('Hello');        // only in dev
 *   logger.warn('⚠️ Cuidado');  // only in dev
 *   logger.error('💥 Crash');   // ALWAYS (errors should always log)
 */

const isDev = import.meta.env.DEV;

export const logger = {
    log: isDev ? console.log.bind(console) : () => { },
    warn: isDev ? console.warn.bind(console) : () => { },
    info: isDev ? console.info.bind(console) : () => { },
    debug: isDev ? console.debug.bind(console) : () => { },
    // Errors ALWAYS log — they indicate real problems
    error: console.error.bind(console),
};
