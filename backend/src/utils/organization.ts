export function sanitizeOrgName(orgName: string): string {
  return orgName.toLowerCase().replace(/[^a-z0-9]/g, "_");
}

/**
 * Converts a URL slug back to a database-searchable pattern.
 * For example: "test_organization_1" could match "test organization 1", "test-organization-1", etc.
 * This creates a SQL LIKE pattern that matches any org name that would sanitize to the given slug.
 */
export function urlSlugToDbPattern(urlSlug: string): string {
  // Convert underscores to a pattern that matches any non-alphanumeric character
  // test_organization_1 becomes test[^a-z0-9]organization[^a-z0-9]1
  return urlSlug.toLowerCase().split('_').join('%');
}

export function getOrgDbName(orgName: string): string {
  const sanitizedOrgName = sanitizeOrgName(orgName);
  return `clinic_${sanitizedOrgName}`;
}

export function getOrgDbUser(orgName: string): string {
  const sanitizedOrgName = sanitizeOrgName(orgName);
  return `${sanitizedOrgName}_user`;
}

export function getOrgSecretName(orgName: string): string {
  const sanitizedOrgName = sanitizeOrgName(orgName);
  return `clinic-db-${sanitizedOrgName}`;
}
