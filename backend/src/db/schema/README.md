# Database Schema Documentation

This directory contains Drizzle ORM schema definitions for the clinic management system. The system uses a **multi-tenant architecture** with two database types:

1. **Central Database** (`clinic_db`): Manages authentication and organization metadata
2. **Distributed Databases** (one per organization, e.g., `clinic_acme`): Contains organization-specific data

## Directory Structure

```
src/db/schema/
├── central/
│   ├── schema.ts       # Auto-generated User and Organization tables
│   └── types.ts        # TypeScript types derived from schema
├── distributed/
│   ├── schema.ts       # Auto-generated org-specific tables
│   ├── enums.ts        # Application-level enums
│   └── types.ts        # TypeScript types derived from schema
└── README.md           # This file
```

## Database Architecture

### Central Database (`clinic_db`)

The centralized database contains:

- **`user` table**: Central authentication users who can create/manage organizations
  - email (unique)
  - name (unique)
  - password (hashed)
  - refresh_token
  - is_verified (boolean, default false)

- **`organization` table**: Tenant organizations
  - name (unique)
  - Each organization gets its own distributed database

### Distributed Databases (`clinic_<org_name>`)

Each organization has a separate database containing:

- **`organization_user` table**: Users within the organization
  - Exactly one role: admin, doctor, or patient (enforced by CHECK constraint)
  - Foreign keys to profile tables

- **`admin_profile` table**: Admin user profiles (minimal data)

- **`doctor_profile` table**: Doctor user profiles
  - specialization
  - license_number
  - phone_number

- **`patient_profile` table**: Patient user profiles
  - date_of_birth
  - phone_number
  - address
  - emergency contact information
  - medical information (blood type, allergies, chronic conditions)

- **`appointment` table**: Appointments between patients and doctors
  - patient_id (FK, nullable, indexed)
  - doctor_id (FK, nullable, indexed)
  - appointment_date_time
  - status (enum: PENDING, APPROVED, DECLINED, COMPLETED, CANCELLED)
  - notes

## Schema Generation

The schemas are auto-generated from existing PostgreSQL databases using `drizzle-kit pull`.

### Regenerating Central Schema

```bash
cd backend
npm run drizzle:pull:central
```

This command:
- Connects to the `clinic_db` database
- Introspects all tables in the `public` schema
- Generates `src/db/schema/central/schema.ts`

### Regenerating Distributed Schema

```bash
cd backend
DRIZZLE_ORG_NAME=<existing_org_name> npm run drizzle:pull:org
```

Replace `<existing_org_name>` with the name of an existing organization (e.g., "acme"). This command:
- Loads database credentials from AWS Secrets Manager (or uses local credentials in mock mode)
- Connects to the organization's database (e.g., `clinic_acme`)
- Introspects all tables
- Generates `src/db/schema/distributed/schema.ts`

### When to Regenerate

Regenerate schemas after:
- Running new MikroORM migrations (during the transition period)
- Making manual database changes (not recommended)
- Adding new tables or columns

## Important Notes

### Manual Adjustments After Generation

After running `drizzle-kit pull`, you may need to manually adjust:

1. **Timestamp types**: Change `mode: 'string'` to `mode: 'date'` for better TypeScript support
2. **Default values**: Fix any incorrect default values (drizzle-kit sometimes has parsing issues)
3. **Table exports**: Rename exports to follow convention (e.g., `userTable`, `organizationTable`)
4. **Documentation**: Add JSDoc comments to explain table purposes and complex fields

### Check Constraints

The `check_only_one_role` constraint on `organization_user` is automatically generated and ensures exactly one of these is true:
- Patient profile set, others null
- Doctor profile set, others null
- Admin profile set, others null
- All profiles null (for incomplete registrations)

### Source of Truth

**During the migration period**, MikroORM migrations are the source of truth. After the migration is complete, Drizzle schemas will become the source of truth.

## Usage Examples

### Importing Schemas

```typescript
// Central database
import { userTable, organizationTable } from '@/db/schema/central/schema';

// Distributed database
import {
  organizationUserTable,
  appointmentTable
} from '@/db/schema/distributed/schema';
```

### Using Types

```typescript
// Central types
import { User, NewUser, UserUpdate } from '@/db/schema/central/types';

// Distributed types
import {
  OrganizationUser,
  Appointment,
  AppointmentWithRelations
} from '@/db/schema/distributed/types';

// Function that returns a user
async function getUser(id: number): Promise<User> {
  // ... query logic
}

// Function that creates a user
async function createUser(data: NewUser): Promise<User> {
  // ... insert logic
}
```

### Using Enums

```typescript
import { OrganizationUserRole } from '@/db/schema/distributed/enums';

function checkUserRole(user: OrganizationUser): OrganizationUserRole {
  if (user.adminProfileId) return OrganizationUserRole.ADMIN;
  if (user.doctorProfileId) return OrganizationUserRole.DOCTOR;
  if (user.patientProfileId) return OrganizationUserRole.PATIENT;
  throw new Error('User has no role assigned');
}
```

### Query Examples

```typescript
import { db } from '@/db/connection';
import { userTable } from '@/db/schema/central/schema';
import { eq } from 'drizzle-orm';

// Select a user by email
const user = await db
  .select()
  .from(userTable)
  .where(eq(userTable.email, 'user@example.com'))
  .limit(1);

// Insert a new user
const newUser = await db
  .insert(userTable)
  .values({
    email: 'new@example.com',
    name: 'New User',
    password: hashedPassword,
    isVerified: false,
  })
  .returning();
```

## Troubleshooting

### Schema generation fails

**Problem**: `drizzle-kit pull` command fails or times out

**Solutions**:
- Ensure Docker containers are running: `docker compose up -d`
- Check database credentials in `.env` file
- Verify the organization exists: `docker compose exec db psql -U clinic_user -d clinic_db -c "SELECT name FROM organization;"`

### Generated schema has incorrect types

**Problem**: Types don't match expected database schema

**Solutions**:
- Check if MikroORM migrations were run: `npm run migration:list`
- Manually review and adjust the generated schema
- Re-run the pull command after fixing database schema

### Check constraint not generated

**Problem**: `check_only_one_role` constraint missing from generated schema

**Solution**: Manually add the constraint (see `distributed/schema.ts` for the correct syntax)

## Migration Path

This schema structure is part of the migration from MikroORM to Drizzle ORM:

1. **Current State**: MikroORM entities and migrations are the source of truth
2. **Transition**: Drizzle schemas are generated from existing databases
3. **Future State**: Drizzle schemas and migrations will be the source of truth

During the transition, maintain both systems:
- Continue using MikroORM for migrations
- Use Drizzle schemas for queries (once migration is complete)
- Regenerate Drizzle schemas after each MikroORM migration

## Related Documentation

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Drizzle Kit CLI](https://orm.drizzle.team/kit-docs/overview)
- MikroORM entity files: `src/entities/central/` and `src/entities/distributed/`
- MikroORM migrations: `src/migrations/centralized/` and `src/migrations/distributed/`
