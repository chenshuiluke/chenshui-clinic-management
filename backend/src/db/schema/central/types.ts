/**
 * TypeScript types derived from the central database schema
 *
 * These types provide type-safe interfaces for working with User and Organization entities
 * throughout the application.
 */

import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { userTable, organizationTable } from './schema';

// Select types (for reading from database)
export type User = InferSelectModel<typeof userTable>;
export type Organization = InferSelectModel<typeof organizationTable>;

// Insert types (for inserting into database)
export type NewUser = InferInsertModel<typeof userTable>;
export type NewOrganization = InferInsertModel<typeof organizationTable>;

// Partial update types (for updates)
export type UserUpdate = Partial<NewUser>;
export type OrganizationUpdate = Partial<NewOrganization>;
