import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as centralSchema from '../db/schema/central/schema';
import * as distributedSchema from '../db/schema/distributed/schema';
import * as distributedRelations from '../db/schema/distributed/relations';
import type { CentralJWTPayload, OrgJWTPayload } from '../config/jwt.config';
import { getUserRole } from '../middleware/auth';
import jwtService from './jwt.service';
import cryptoService from '../utils/crypto';
import { securityLogger } from '../utils/logger';

type CentralDatabase = NodePgDatabase<typeof centralSchema>;
type OrgDatabase = NodePgDatabase<typeof distributedSchema & typeof distributedRelations>;

class AuthService {
  async loginCentral(
    db: CentralDatabase,
    email: string,
    password: string,
    ipAddress?: string
  ) {
    // Query user from central database
    const users = await db
      .select()
      .from(centralSchema.userTable)
      .where(eq(centralSchema.userTable.email, email))
      .limit(1);

    const user = users[0];

    if (!user) {
      securityLogger.loginFailed(email, 'user not found', ipAddress);
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await jwtService.comparePassword(
      password,
      user.password
    );

    if (!isValidPassword) {
      securityLogger.loginFailed(email, 'invalid password', ipAddress);
      throw new Error('Invalid credentials');
    }

    if (!user.isVerified) {
      securityLogger.loginFailed(email, 'not verified', ipAddress);
      throw new Error('User not verified');
    }

    // Generate token pair
    const payload: CentralJWTPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      type: 'central',
    };

    const { accessToken, refreshToken, refreshTokenPlain } =
      jwtService.generateTokenPair(payload);

    // Hash and store refresh token
    const hashedRefreshToken = await cryptoService.hashRefreshToken(refreshTokenPlain);

    await db
      .update(centralSchema.userTable)
      .set({ refreshToken: hashedRefreshToken })
      .where(eq(centralSchema.userTable.id, user.id));

    // Log successful login
    securityLogger.loginAttempt(email, true, ipAddress);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async registerCentral(
    db: CentralDatabase,
    email: string,
    name: string,
    password: string
  ) {
    // Check for existing user with same email
    const existingEmailUsers = await db
      .select()
      .from(centralSchema.userTable)
      .where(eq(centralSchema.userTable.email, email))
      .limit(1);

    if (existingEmailUsers.length > 0) {
      throw new Error('User with this email already exists');
    }

    // Check for existing user with same name
    const existingNameUsers = await db
      .select()
      .from(centralSchema.userTable)
      .where(eq(centralSchema.userTable.name, name))
      .limit(1);

    if (existingNameUsers.length > 0) {
      throw new Error('User with this name already exists');
    }

    // Hash password
    const hashedPassword = await jwtService.hashPassword(password);

    // Determine verification status based on environment
    const isVerified =
      process.env.NODE_ENV === 'test' || process.env.CYPRESS_ENV === 'true';

    // Insert new user
    const newUsers = await db
      .insert(centralSchema.userTable)
      .values({
        email,
        name,
        password: hashedPassword,
        isVerified,
      })
      .returning();

    const newUser = newUsers[0];

    if (!newUser) {
      throw new Error('Failed to create user');
    }

    return {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
    };
  }

  async refreshCentralToken(db: CentralDatabase, refreshToken: string) {
    // Parse refresh token
    const { jwt, plain } = jwtService.parseRefreshToken(refreshToken);

    // Verify JWT portion
    const payload = jwtService.verifyRefreshToken(jwt) as CentralJWTPayload;

    // Validate token type
    if (payload.type !== 'central') {
      throw new Error('Invalid refresh token: central token required');
    }

    // Query user
    const users = await db
      .select()
      .from(centralSchema.userTable)
      .where(eq(centralSchema.userTable.id, payload.userId))
      .limit(1);

    const user = users[0];

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.refreshToken) {
      throw new Error('Invalid refresh token');
    }

    // Verify plain token against stored hash
    const isValidToken = await cryptoService.verifyRefreshToken(
      plain,
      user.refreshToken
    );

    if (!isValidToken) {
      throw new Error('Invalid refresh token');
    }

    // Generate new token pair with rotation
    const newPayload: CentralJWTPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      type: 'central',
    };

    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      refreshTokenPlain: newRefreshTokenPlain,
    } = jwtService.generateTokenPair(newPayload);

    // Update stored refresh token hash
    const newHashedRefreshToken = await cryptoService.hashRefreshToken(
      newRefreshTokenPlain
    );

    await db
      .update(centralSchema.userTable)
      .set({ refreshToken: newHashedRefreshToken })
      .where(eq(centralSchema.userTable.id, user.id));

    // Log token refresh
    securityLogger.tokenRefreshed(user.id);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logoutCentral(db: CentralDatabase, userId: number) {
    // Clear refresh token
    await db
      .update(centralSchema.userTable)
      .set({ refreshToken: null })
      .where(eq(centralSchema.userTable.id, userId));

    // Log logout
    securityLogger.logout(userId);

    return { success: true };
  }

  async getCentralUser(db: CentralDatabase, userId: number) {
    const users = await db
      .select()
      .from(centralSchema.userTable)
      .where(eq(centralSchema.userTable.id, userId))
      .limit(1);

    const user = users[0];

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }

  async verifyCentralUser(
    db: CentralDatabase,
    userId: number,
    verifierId: number,
    ipAddress?: string
  ) {
    // Prevent self-verification
    if (userId === verifierId) {
      securityLogger.suspiciousActivity(
        'self-verification attempt',
        verifierId,
        ipAddress
      );
      throw new Error('Cannot verify yourself');
    }

    // Query user to verify
    const users = await db
      .select()
      .from(centralSchema.userTable)
      .where(eq(centralSchema.userTable.id, userId))
      .limit(1);

    const user = users[0];

    if (!user) {
      throw new Error('User not found');
    }

    // Check if already verified
    if (user.isVerified) {
      throw new Error('User already verified');
    }

    // Validate verifier exists
    const verifiers = await db
      .select()
      .from(centralSchema.userTable)
      .where(eq(centralSchema.userTable.id, verifierId))
      .limit(1);

    const verifier = verifiers[0];

    if (!verifier) {
      throw new Error('Verifier not found');
    }

    // Update verification status
    await db
      .update(centralSchema.userTable)
      .set({ isVerified: true })
      .where(eq(centralSchema.userTable.id, userId));

    // Log verification
    securityLogger.userVerified(user.id, verifier.id);

    return {
      success: true,
      userId: user.id,
      verifiedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Organization Authentication Methods
  // ============================================================================

  async loginOrganization(
    db: OrgDatabase,
    email: string,
    password: string,
    organizationName: string,
    ipAddress?: string
  ) {
    // Query user with all profile relations
    const users = await db.query.organizationUserTable.findMany({
      where: eq(distributedSchema.organizationUserTable.email, email),
      with: {
        adminProfile: true,
        doctorProfile: true,
        patientProfile: true,
      },
      limit: 1,
    });

    const user = users[0];

    if (!user) {
      securityLogger.loginFailed(email, 'user not found', ipAddress);
      throw new Error('Invalid credentials');
    }

    // Validate password
    const isValidPassword = await jwtService.comparePassword(
      password,
      user.password
    );

    if (!isValidPassword) {
      securityLogger.loginFailed(email, 'invalid password', ipAddress);
      throw new Error('Invalid credentials');
    }

    // Check that user has at least one profile assigned
    if (!user.adminProfile && !user.doctorProfile && !user.patientProfile) {
      throw new Error('User role not assigned');
    }

    // Determine user role
    const role = getUserRole(user);

    // Generate token pair
    const payload: OrgJWTPayload = {
      userId: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      type: 'org',
      orgName: organizationName,
    };

    const { accessToken, refreshToken, refreshTokenPlain } =
      jwtService.generateTokenPair(payload);

    // Hash and store refresh token
    const hashedRefreshToken = await cryptoService.hashRefreshToken(refreshTokenPlain);

    await db
      .update(distributedSchema.organizationUserTable)
      .set({ refreshToken: hashedRefreshToken })
      .where(eq(distributedSchema.organizationUserTable.id, user.id));

    // Log successful login
    securityLogger.loginAttempt(email, true, ipAddress);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role,
      },
    };
  }

  async refreshOrganizationToken(
    db: OrgDatabase,
    refreshToken: string,
    organizationName: string
  ) {
    // Parse refresh token
    const { jwt, plain } = jwtService.parseRefreshToken(refreshToken);

    // Verify JWT portion
    const payload = jwtService.verifyRefreshToken(jwt) as OrgJWTPayload;

    // Validate token type
    if (payload.type !== 'org') {
      throw new Error('Invalid refresh token: organization token required');
    }

    // Validate organization name
    if (payload.orgName !== organizationName) {
      throw new Error('Invalid refresh token: organization mismatch');
    }

    // Query user with profiles
    const users = await db.query.organizationUserTable.findMany({
      where: eq(distributedSchema.organizationUserTable.id, payload.userId),
      with: {
        adminProfile: true,
        doctorProfile: true,
        patientProfile: true,
      },
      limit: 1,
    });

    const user = users[0];

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.refreshToken) {
      throw new Error('Invalid refresh token');
    }

    // Verify plain token against stored hash
    const isValidToken = await cryptoService.verifyRefreshToken(
      plain,
      user.refreshToken
    );

    if (!isValidToken) {
      throw new Error('Invalid refresh token');
    }

    // Generate new token pair with rotation
    const newPayload: OrgJWTPayload = {
      userId: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`.trim(),
      type: 'org',
      orgName: organizationName,
    };

    const {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      refreshTokenPlain: newRefreshTokenPlain,
    } = jwtService.generateTokenPair(newPayload);

    // Update stored refresh token hash
    const newHashedRefreshToken = await cryptoService.hashRefreshToken(
      newRefreshTokenPlain
    );

    await db
      .update(distributedSchema.organizationUserTable)
      .set({ refreshToken: newHashedRefreshToken })
      .where(eq(distributedSchema.organizationUserTable.id, user.id));

    // Log token refresh
    securityLogger.tokenRefreshed(user.id, organizationName);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logoutOrganization(
    db: OrgDatabase,
    userId: number,
    organizationName: string
  ) {
    // Clear refresh token
    await db
      .update(distributedSchema.organizationUserTable)
      .set({ refreshToken: null })
      .where(eq(distributedSchema.organizationUserTable.id, userId));

    // Log logout
    securityLogger.logout(userId, organizationName);

    return { success: true };
  }

  async getOrganizationUser(db: OrgDatabase, userId: number) {
    // Query user with all profile relations
    const users = await db.query.organizationUserTable.findMany({
      where: eq(distributedSchema.organizationUserTable.id, userId),
      with: {
        adminProfile: true,
        doctorProfile: true,
        patientProfile: true,
      },
      limit: 1,
    });

    const user = users[0];

    if (!user) {
      throw new Error('User not found');
    }

    // Check that user has at least one profile assigned
    if (!user.adminProfile && !user.doctorProfile && !user.patientProfile) {
      throw new Error('User role not assigned');
    }

    // Determine user role
    const role = getUserRole(user);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role,
    };
  }
}

export default new AuthService();
