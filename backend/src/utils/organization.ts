export function sanitizeOrgName(orgName: string): string {
  return orgName.toLowerCase().replace(/[^a-z0-9]/g, "_");
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
