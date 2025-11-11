import bcrypt from 'bcrypt';
import crypto from 'crypto';

export class CryptoService {
  // Increased from 10 to 12 for stronger security
  // bcrypt cost of 12 = 2^12 = 4096 iterations
  private readonly SALT_ROUNDS = 12;

  /**
   * Generate a random refresh token
   */
  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash a refresh token for storage
   */
  async hashRefreshToken(token: string): Promise<string> {
    return bcrypt.hash(token, this.SALT_ROUNDS);
  }

  /**
   * Verify a refresh token against its hash
   */
  async verifyRefreshToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  /**
   * Hash a password with optional pepper
   *
   * IMPORTANT: Set PASSWORD_PEPPER environment variable in production.
   * The pepper is a secret value added to all passwords before hashing.
   * Unlike salt (which is random per-password), pepper is the same for all passwords
   * and provides defense-in-depth if the database is compromised but env vars are not.
   *
   * Recommendation: Generate with `openssl rand -hex 32` and store securely.
   */
  async hashPassword(password: string): Promise<string> {
    const pepper = process.env.PASSWORD_PEPPER || '';
    if (!pepper && process.env.NODE_ENV === 'production') {
      console.warn(
        '⚠️  WARNING: PASSWORD_PEPPER not set in production. ' +
        'Set PASSWORD_PEPPER for additional password security.'
      );
    }
    return bcrypt.hash(password + pepper, this.SALT_ROUNDS);
  }

  /**
   * Verify a password against its hash with pepper
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const pepper = process.env.PASSWORD_PEPPER || '';
    return bcrypt.compare(password + pepper, hash);
  }
}

const cryptoService = new CryptoService();
export default cryptoService;