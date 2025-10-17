# Chen Shui Clinic Management System

[![Tests](https://github.com/chenshuiluke/chenshui-clinic-management/actions/workflows/test.yml/badge.svg)](https://github.com/chenshuiluke/chenshui-clinic-management/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/chenshuiluke/chenshui-clinic-management/graph/badge.svg?token=N22Q6LB864)](https://codecov.io/gh/chenshuiluke/chenshui-clinic-management)

A comprehensive clinic management system built with Node.js, Express, and PostgreSQL.

### Running tests

```bash
# Run tests once
./test.sh

# Run tests in watch mode
docker compose -f docker-compose.yaml -f docker-compose.test.yaml up backend-test-watch
```
