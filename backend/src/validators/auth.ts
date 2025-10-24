import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export const verifyUserSchema = z.object({
  userId: z.number().int().positive('User ID must be a positive integer')
});

export const orgLoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const orgRefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

export type LoginDto = z.infer<typeof loginSchema>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
export type VerifyUserDto = z.infer<typeof verifyUserSchema>;
export type OrgLoginDto = z.infer<typeof orgLoginSchema>;
export type OrgRefreshTokenDto = z.infer<typeof orgRefreshTokenSchema>;
