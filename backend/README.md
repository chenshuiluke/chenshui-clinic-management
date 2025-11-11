# Clinic Management System - Backend

## Security Overview

This backend implements comprehensive security measures for a multi-tenant clinic management system.

### Authentication & Authorization

#### Token Types
The system uses two types of JWT tokens:
- **Central tokens**: For system-wide admin operations
- **Organization tokens**: For organization-specific operations (doctors, patients, admins)


