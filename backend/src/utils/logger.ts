import pino from 'pino';

// Configure log level based on environment
// In production, default to 'info', but allow override via LOG_LEVEL
// In test, use 'silent' to avoid noise
const logLevel = process.env.LOG_LEVEL ||
  (process.env.NODE_ENV === 'test' ? 'silent' :
   process.env.NODE_ENV === 'production' ? 'info' : 'debug');

// Create logger with security-conscious configuration
const logger = pino({
  level: logLevel,
  formatters: {
    bindings: (bindings) => {
      return { pid: bindings.pid, hostname: bindings.hostname };
    },
    level: (label) => {
      return { level: label };
    }
  },
  redact: {
    // Comprehensive list of sensitive fields to redact
    paths: [
      // Passwords and secrets
      'password',
      'newPassword',
      'oldPassword',
      'passwordHash',
      'secret',
      'apiKey',
      'privateKey',
      // Tokens
      'token',
      'refreshToken',
      'accessToken',
      'authorization',
      'jwt',
      // Nested fields
      '*.password',
      '*.newPassword',
      '*.oldPassword',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.authorization',
      '*.jwt',
      '*.secret',
      '*.apiKey',
      '*.privateKey',
      // Request bodies that might contain sensitive data
      'req.body.password',
      'req.body.newPassword',
      'req.body.oldPassword',
      'req.headers.authorization',
      'req.headers.cookie',
      'req.cookies',
      // Credit card and financial data
      'creditCard',
      'cardNumber',
      'cvv',
      'ssn',
      '*.creditCard',
      '*.cardNumber',
      '*.cvv',
      '*.ssn'
    ],
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'SYS:standard'
      }
    }
  })
});

// Security event logging helpers
export const securityLogger = {
  loginAttempt: (email: string, success: boolean, ip?: string) => {
    logger.info({
      event: 'LOGIN_ATTEMPT',
      email,
      success,
      ip: ip || 'unknown'
    }, success ? 'Login successful' : 'Login failed');
  },

  loginFailed: (email: string, reason: string, ip?: string) => {
    logger.warn({
      event: 'LOGIN_FAILED',
      email,
      reason,
      ip: ip || 'unknown'
    }, 'Login failed');
  },

  tokenRefreshed: (userId: number, orgName?: string) => {
    logger.info({
      event: 'TOKEN_REFRESHED',
      userId,
      orgName
    }, 'Token refreshed');
  },

  tokenInvalid: (reason: string, ip?: string) => {
    logger.warn({
      event: 'TOKEN_INVALID',
      reason,
      ip: ip || 'unknown'
    }, 'Invalid token presented');
  },

  logout: (userId: number, orgName?: string) => {
    logger.info({
      event: 'LOGOUT',
      userId,
      orgName
    }, 'User logged out');
  },

  userVerified: (userId: number, verifiedBy?: number) => {
    logger.info({
      event: 'USER_VERIFIED',
      userId,
      verifiedBy
    }, 'User verified');
  },

  organizationCreated: (orgName: string, createdBy: number) => {
    logger.info({
      event: 'ORG_CREATED',
      orgName,
      createdBy
    }, 'Organization created');
  },

  organizationDeleted: (orgName: string, deletedBy: number) => {
    logger.info({
      event: 'ORG_DELETED',
      orgName,
      deletedBy
    }, 'Organization deleted');
  },

  orgMismatch: (expectedOrg: string, tokenOrg: string, userId: number) => {
    logger.warn({
      event: 'ORG_MISMATCH',
      expectedOrg,
      tokenOrg,
      userId
    }, 'Organization mismatch in token');
  },

  rateLimitExceeded: (endpoint: string, ip: string) => {
    logger.warn({
      event: 'RATE_LIMIT_EXCEEDED',
      endpoint,
      ip
    }, 'Rate limit exceeded');
  },

  suspiciousActivity: (type: string, details: any, ip?: string) => {
    logger.error({
      event: 'SUSPICIOUS_ACTIVITY',
      type,
      details,
      ip: ip || 'unknown'
    }, 'Suspicious activity detected');
  }
};

export default logger;