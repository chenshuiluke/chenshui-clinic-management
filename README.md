# Chen Shui Clinic Management System

[![Tests](https://github.com/chenshuiluke/chenshui-clinic-management/actions/workflows/test.yml/badge.svg)](https://github.com/chenshuiluke/chenshui-clinic-management/actions/workflows/test.yml)

A comprehensive clinic management system built with Node.js, Express, and PostgreSQL.

There are two sections to this system: The central admin section for app level admins and the per-organization section where clinics can have their own clinic admins, doctors and patients. The central admin data is stored in a central db while each clinic or organization's data is stored in their own database.

### Deploying 
The infrastructure uses AWS CDK to setup resources and deploy infrastructure changes and code changes. To deploy, just setup the AWS CDK CLI locally and run `cdk deploy CoreInfrastructureStack FrontendStack ApiStack`. You can also deploy the `DnsStack` if you ever need to. The  `--require-approval never` flag is useful if you just need to deploy and rapidly iterate.

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
./test-e2e.sh
```