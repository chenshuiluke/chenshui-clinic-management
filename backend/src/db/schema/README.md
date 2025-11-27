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