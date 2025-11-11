// Application configuration constants

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

// LocalStorage keys for token management
export const TOKEN_STORAGE_KEYS = {
  CENTRAL_ACCESS_TOKEN: 'central_access_token',
  CENTRAL_REFRESH_TOKEN: 'central_refresh_token',
  ORG_ACCESS_TOKEN: 'org_access_token',
  ORG_REFRESH_TOKEN: 'org_refresh_token',
  ORG_NAME: 'org_name',
} as const;

// Token refresh threshold (60 seconds before expiry)
// Access tokens expire in 5 minutes, so we refresh 1 minute before
export const TOKEN_REFRESH_THRESHOLD_MS = 60000;

// Application routes
export const ROUTES = {
  // Root
  HOME: '/',

  // Central Admin routes
  ADMIN_LOGIN: '/admin/login',
  ADMIN_REGISTER: '/admin/register',
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_ORGANIZATIONS: '/admin/organizations',

  // Organization routes (templates - replace :orgName with actual org name)
  ORG_LOGIN: '/:orgName/login',
  ORG_REGISTER: '/:orgName/register',
  ORG_DASHBOARD: '/:orgName/dashboard',
  ORG_ADMIN_DASHBOARD: '/:orgName/admin/dashboard',
  ORG_DOCTORS: '/:orgName/doctors',
  ORG_PATIENTS: '/:orgName/patients',
  ORG_APPOINTMENTS: '/:orgName/appointments',
  ORG_BOOK_APPOINTMENT: '/:orgName/book-appointment',
  ORG_MY_APPOINTMENTS: '/:orgName/my-appointments',
  ORG_PROFILE: '/:orgName/profile',
} as const;

// Helper function to build org-specific routes
export const buildOrgRoute = (orgName: string, route: string): string => {
  return route.replace(':orgName', orgName);
};
