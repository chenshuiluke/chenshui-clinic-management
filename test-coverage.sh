#!/bin/bash

# Generate code coverage report without running tests
# Analyzes all source files and creates coverage reports

set -e

echo "[INFO] Starting test infrastructure..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml up -d db sqs

echo "[INFO] Waiting for services to be ready..."
sleep 10

echo "[INFO] Type-checking TypeScript files..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml run --rm backend-test npm run typecheck
TYPECHECK_EXIT_CODE=$?

if [ $TYPECHECK_EXIT_CODE -ne 0 ]; then
  echo "[ERROR] Type-checking failed. Fix compilation errors before generating coverage."
  docker compose -f docker-compose.yaml -f docker-compose.test.yaml down
  exit $TYPECHECK_EXIT_CODE
fi

echo "[INFO] Creating coverage directory..."
mkdir -p backend/coverage

echo "[INFO] Generating coverage report (no tests executed)..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml run --rm \
  -v $(pwd)/backend/coverage:/app/coverage \
  backend-test sh -c "
    npx nyc \
      --reporter=lcov \
      --reporter=text \
      --reporter=html \
      --reporter=json-summary \
      --report-dir=/app/coverage \
      --temp-dir=/app/.nyc_output \
      --all \
      --include='src/**/*.ts' \
      --exclude='src/__tests__/**' \
      --exclude='src/**/*.test.ts' \
      --exclude='src/migrations/**' \
      --exclude='src/seeders/**' \
      --exclude='src/mikro-orm.config.ts' \
      --exclude='src/utils/runMigrations.ts' \
      --exclude='src/utils/runSeeders.ts' \
      --exclude='src/**/*.d.ts' \
      --extension='.ts' \
      --skip-full \
      report
  " || true

# Fix coverage directory permissions
if [ -d "backend/coverage" ]; then
  chmod -R 755 backend/coverage 2>/dev/null || sudo chmod -R 755 backend/coverage 2>/dev/null || true
fi

echo "[INFO] Coverage generation completed"

if [ -f "backend/coverage/coverage-summary.json" ] && command -v jq &> /dev/null; then
  LINES=$(jq -r '.total.lines.pct' backend/coverage/coverage-summary.json)
  STATEMENTS=$(jq -r '.total.statements.pct' backend/coverage/coverage-summary.json)
  FUNCTIONS=$(jq -r '.total.functions.pct' backend/coverage/coverage-summary.json)
  BRANCHES=$(jq -r '.total.branches.pct' backend/coverage/coverage-summary.json)

  echo "[INFO] Coverage summary:"
  echo "       Lines:      ${LINES}%"
  echo "       Statements: ${STATEMENTS}%"
  echo "       Functions:  ${FUNCTIONS}%"
  echo "       Branches:   ${BRANCHES}%"
fi

echo "[INFO] Coverage reports available at:"
echo "       HTML:    backend/coverage/index.html"
echo "       LCOV:    backend/coverage/lcov.info"
echo "       Summary: backend/coverage/coverage-summary.json"

echo "[INFO] Cleaning up test containers..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml down backend-test

exit 0
