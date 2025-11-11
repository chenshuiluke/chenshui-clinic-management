# Chen Shui Clinic Management System

[![Tests](https://github.com/chenshuiluke/chenshui-clinic-management/actions/workflows/test.yml/badge.svg)](https://github.com/chenshuiluke/chenshui-clinic-management/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/chenshuiluke/chenshui-clinic-management/graph/badge.svg?token=N22Q6LB864)](https://codecov.io/gh/chenshuiluke/chenshui-clinic-management)

A comprehensive clinic management system built with Node.js, Express, and PostgreSQL.

### Running tests

**Backend Unit Tests:**

```bash
# Run tests once
./test.sh

# Run tests in watch mode
./test-wash.sh

```

**End-to-End Tests:**

The project includes comprehensive E2E tests using Cypress that test the entire application stack (frontend, backend, database) in an isolated Docker environment.

```bash
# Quick start - run all E2E tests
./test-e2e.sh
```

This script runs all Cypress tests in Docker with automatic cleanup. Tests cover all user roles:

- **Central admin:** login, organization management, admin user creation
- **Organization admin:** login, doctor management, role-based access control
- **Doctor:** login, appointment management (approve/decline/complete), patient data access
- **Patient:** registration, login, profile management, appointment booking/cancellation, account deletion
- **Cross-cutting:** authentication guards, cross-organization isolation, token validation

For detailed documentation on running E2E tests locally, debugging, and Docker configuration, see `frontend/README.md`.

**CI/CD Integration:**

The E2E test suite is designed to run in CI/CD pipelines. The `test-e2e.sh` script exits with code 0 on success and non-zero on failure, making it suitable for automated testing in GitHub Actions, GitLab CI, or other CI/CD platforms.
