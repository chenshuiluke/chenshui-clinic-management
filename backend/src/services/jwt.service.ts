import jwt, { Secret, SignOptions, VerifyOptions } from "jsonwebtoken";
import {
  jwtConfig,
  JWTPayload,
  DecodedJWT,
  DecodedCentralJWT,
  DecodedOrgJWT,
  getJWTSecrets,
  validateSecrets
} from "../config/jwt.config";
import cryptoService from "../utils/crypto";
import logger from "../utils/logger";

// Custom error classes for specific JWT validation failures
export class TokenTypeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenTypeError';
  }
}

export class OrgTokenMissingNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrgTokenMissingNameError';
  }
}

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenInvalidError';
  }
}

export class JWTService {

  /**
   * Generate an access token with type discrimination
   */
  generateAccessToken(payload: JWTPayload): string {
    const secrets = getJWTSecrets();
    validateSecrets(secrets);

    if (!secrets.accessTokenSecret) {
      throw new TokenInvalidError('Access token secret not configured');
    }

    const tokenPayload = {
      ...payload,
      iss: jwtConfig.issuer,
      aud: jwtConfig.audience
    };

    const options: SignOptions = {
      expiresIn: jwtConfig.accessTokenExpiry as any,
      algorithm: jwtConfig.algorithm
    };

    return jwt.sign(tokenPayload, secrets.accessTokenSecret as Secret, options);
  }

  /**
   * Generate a refresh token with type discrimination
   */
  generateRefreshToken(payload: JWTPayload): string {
    const secrets = getJWTSecrets();
    validateSecrets(secrets);

    if (!secrets.refreshTokenSecret) {
      throw new TokenInvalidError('Refresh token secret not configured');
    }

    const tokenPayload = {
      ...payload,
      iss: jwtConfig.issuer,
      aud: jwtConfig.audience
    };

    const options: SignOptions = {
      expiresIn: jwtConfig.refreshTokenExpiry as any,
      algorithm: jwtConfig.algorithm
    };

    return jwt.sign(tokenPayload, secrets.refreshTokenSecret as Secret, options);
  }

  /**
   * Verify an access token and return typed payload
   */
  verifyAccessToken(token: string): DecodedJWT {
    try {
      const secrets = getJWTSecrets();
      validateSecrets(secrets);

      if (!secrets.accessTokenSecret) {
        throw new TokenInvalidError('Access token secret not configured');
      }

      const options: VerifyOptions = {
        algorithms: [jwtConfig.algorithm],
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience
      };

      const decoded = jwt.verify(
        token,
        secrets.accessTokenSecret as Secret,
        options
      ) as DecodedJWT;

      // Validate token type exists
      if (!decoded.type || (decoded.type !== 'central' && decoded.type !== 'org')) {
        throw new TokenTypeError("Invalid token type");
      }

      // Additional validation for org tokens
      if (decoded.type === 'org' && !decoded.orgName) {
        throw new OrgTokenMissingNameError("Organization token missing orgName");
      }

      return decoded;
    } catch (error) {
      logger.debug({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Token verification failed');

      // Re-throw custom errors
      if (error instanceof TokenTypeError ||
          error instanceof OrgTokenMissingNameError ||
          error instanceof TokenExpiredError ||
          error instanceof TokenInvalidError) {
        throw error;
      }

      // Check for JWT specific errors
      if (error instanceof Error) {
        if (error.name === 'TokenExpiredError' || error.message.includes('expired')) {
          throw new TokenExpiredError("Token has expired");
        }
        if (error.name === 'JsonWebTokenError' || error.message.includes('invalid')) {
          throw new TokenInvalidError("Invalid token");
        }
      }

      // Generic fallback
      throw new TokenInvalidError("Invalid or expired access token");
    }
  }

  /**
   * Verify a refresh token and return typed payload
   */
  verifyRefreshToken(token: string): DecodedJWT {
    try {
      const secrets = getJWTSecrets();
      validateSecrets(secrets);

      if (!secrets.refreshTokenSecret) {
        throw new TokenInvalidError('Refresh token secret not configured');
      }

      const options: VerifyOptions = {
        algorithms: [jwtConfig.algorithm],
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience
      };

      const decoded = jwt.verify(
        token,
        secrets.refreshTokenSecret as Secret,
        options
      ) as DecodedJWT;

      // Validate token type exists
      if (!decoded.type || (decoded.type !== 'central' && decoded.type !== 'org')) {
        throw new TokenTypeError("Invalid token type");
      }

      // Additional validation for org tokens
      if (decoded.type === 'org' && !decoded.orgName) {
        throw new OrgTokenMissingNameError("Organization token missing orgName");
      }

      return decoded;
    } catch (error) {
      logger.debug({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Refresh token verification failed');

      // Re-throw custom errors
      if (error instanceof TokenTypeError ||
          error instanceof OrgTokenMissingNameError ||
          error instanceof TokenExpiredError ||
          error instanceof TokenInvalidError) {
        throw error;
      }

      // Check for JWT specific errors
      if (error instanceof Error) {
        if (error.name === 'TokenExpiredError' || error.message.includes('expired')) {
          throw new TokenExpiredError("Refresh token has expired");
        }
        if (error.name === 'JsonWebTokenError' || error.message.includes('invalid')) {
          throw new TokenInvalidError("Invalid refresh token");
        }
      }

      // Generic fallback
      throw new TokenInvalidError("Invalid or expired refresh token");
    }
  }

  /**
   * Verify access token as central type
   */
  verifyCentralAccessToken(token: string): DecodedCentralJWT {
    const decoded = this.verifyAccessToken(token);
    if (decoded.type !== 'central') {
      throw new Error("Expected central token but got org token");
    }
    return decoded as DecodedCentralJWT;
  }

  /**
   * Verify access token as org type
   */
  verifyOrgAccessToken(token: string): DecodedOrgJWT {
    const decoded = this.verifyAccessToken(token);
    if (decoded.type !== 'org') {
      throw new Error("Expected org token but got central token");
    }
    return decoded as DecodedOrgJWT;
  }

  /**
   * Hash a password using bcrypt with optional pepper
   */
  async hashPassword(password: string): Promise<string> {
    return cryptoService.hashPassword(password);
  }

  /**
   * Compare password with hash including pepper
   */
  async comparePassword(password: string, hashedPassword: string): Promise<boolean> {
    return cryptoService.verifyPassword(password, hashedPassword);
  }

  /**
   * Generate both access and refresh tokens with rotation support
   */
  generateTokenPair(payload: JWTPayload): {
    accessToken: string;
    refreshToken: string;
    refreshTokenPlain: string;
  } {
    const accessToken = this.generateAccessToken(payload);
    const refreshTokenJWT = this.generateRefreshToken(payload);

    // Generate a random token for additional security
    const refreshTokenPlain = cryptoService.generateRefreshToken();

    // Combine JWT and random token
    const combinedRefreshToken = `${refreshTokenJWT}.${refreshTokenPlain}`;

    return {
      accessToken,
      refreshToken: combinedRefreshToken,
      refreshTokenPlain: refreshTokenPlain // Store hash of this in DB
    };
  }

  /**
   * Extract and validate refresh token parts
   */
  parseRefreshToken(combinedToken: string): {
    jwt: string;
    plain: string;
  } {
    if (!combinedToken) {
      throw new Error("Refresh token is required");
    }

    const parts = combinedToken.split('.');
    if (parts.length < 4) { // JWT has 3 parts + our plain token
      throw new Error("Invalid refresh token format");
    }

    const jwtPart = parts.slice(0, 3).join('.');
    const plainPart = parts.slice(3).join('.');

    return {
      jwt: jwtPart,
      plain: plainPart
    };
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }
    return authHeader.substring(7);
  }
}

const jwtService = new JWTService();

export default jwtService;