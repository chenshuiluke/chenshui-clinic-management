// Authentication-related type definitions

// Token type discriminator
export type TokenType = 'central' | 'org';

// Central admin user
export interface CentralUser {
  id: number;
  email: string;
  name: string;
  isVerified: boolean;
}

// Organization user with role
export type UserRole = 'admin' | 'doctor' | 'patient';

export interface OrganizationUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

// Login response from API
export interface LoginResponse<T = CentralUser | OrganizationUser> {
  accessToken: string;
  refreshToken: string;
  user: T;
}

// Refresh response from API
export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// Central auth context type
export interface CentralAuthContextType {
  user: CentralUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

// Organization auth context type
export interface OrgAuthContextType {
  user: OrganizationUser | null;
  orgName: string | null;
  loading: boolean;
  error: string | null;
  login: (orgName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  setOrgName: (orgName: string) => void;
  setAuthFromRegistration: (accessToken: string, refreshToken: string, user: OrganizationUser, orgName: string) => void;
}
