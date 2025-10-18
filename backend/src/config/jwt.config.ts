export const jwtConfig = {
  accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production',
  refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
  accessTokenExpiry: '15m',
  refreshTokenExpiry: '7d',
};

export interface JWTPayload {
  userId: number;
  email: string;
  name: string;
}

export interface DecodedJWT extends JWTPayload {
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: DecodedJWT;
    }
  }
}
