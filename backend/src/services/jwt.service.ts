import jwt, { Secret, SignOptions } from "jsonwebtoken";
import bcrypt from "bcrypt";
import { jwtConfig, JWTPayload, DecodedJWT } from "../config/jwt.config";

export class JWTService {
  private readonly SALT_ROUNDS = 10;

  generateAccessToken(payload: JWTPayload): string {
    const options: SignOptions = {
      expiresIn: jwtConfig.accessTokenExpiry as any,
    };
    return jwt.sign(payload, jwtConfig.accessTokenSecret as Secret, options);
  }

  generateRefreshToken(payload: JWTPayload): string {
    const options: SignOptions = {
      expiresIn: jwtConfig.refreshTokenExpiry as any,
    };
    return jwt.sign(payload, jwtConfig.refreshTokenSecret as Secret, options);
  }

  verifyAccessToken(token: string): DecodedJWT {
    try {
      return jwt.verify(
        token,
        jwtConfig.accessTokenSecret as Secret,
      ) as DecodedJWT;
    } catch (error) {
      throw new Error("Invalid or expired access token");
    }
  }

  verifyRefreshToken(token: string): DecodedJWT {
    try {
      return jwt.verify(
        token,
        jwtConfig.refreshTokenSecret as Secret,
      ) as DecodedJWT;
    } catch (error) {
      throw new Error("Invalid or expired refresh token");
    }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async comparePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  generateTokenPair(payload: JWTPayload): {
    accessToken: string;
    refreshToken: string;
  } {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }
    return authHeader.substring(7);
  }
}

export const jwtService = new JWTService();
