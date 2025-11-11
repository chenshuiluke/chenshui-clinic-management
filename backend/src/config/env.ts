export type NodeEnv = 'development' | 'test' | 'production';

/**
 * Gets the current NODE_ENV value, with validation
 */
function getNodeEnv(): NodeEnv {
  const raw = process.env.NODE_ENV;
  if (!raw || !['development', 'test', 'production'].includes(raw)) {
    if (raw) {
      console.warn(`Invalid NODE_ENV: "${raw}", defaulting to 'development'`);
    }
    return 'development';
  }
  return raw as NodeEnv;
}

/**
 * Environment configuration with dynamic getters.
 *
 * IMPORTANT: All properties use getters to read process.env.NODE_ENV dynamically.
 * This allows tests to mutate process.env.NODE_ENV after module imports and have
 * the changes reflected in subsequent checks.
 *
 * Example:
 *   import { env } from './config/env';
 *   process.env.NODE_ENV = 'test';  // Test setup
 *   console.log(env.isTest);         // true (re-evaluates NODE_ENV)
 */
export const env = {
  get nodeEnv() {
    return getNodeEnv();
  },
  get isDevelopment() {
    return getNodeEnv() === 'development';
  },
  get isTest() {
    return getNodeEnv() === 'test';
  },
  get isProduction() {
    return getNodeEnv() === 'production';
  },
  get isMockMode() {
    return this.isDevelopment || this.isTest;
  },
} as const;
