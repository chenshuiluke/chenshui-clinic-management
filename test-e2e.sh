#!/bin/bash

# Exit on error
set -e

echo "Running Cypress E2E tests in Docker..."

# Change to frontend directory
cd frontend

echo "Cleaning up any existing test infrastructure..."
docker compose -f ../docker-compose.cypress.yaml down --remove-orphans --volumes

echo "Starting fresh test infrastructure..."
# Start the database first with fresh volumes
docker compose -f ../docker-compose.cypress.yaml up -d --force-recreate --renew-anon-volumes db

echo "Waiting for database to be ready..."
sleep 5

# Disable strict error mode for Cypress run
set +e

# Run the full test suite with fresh containers
echo "Starting Docker containers and running Cypress tests..."
docker compose -f ../docker-compose.cypress.yaml up --build --force-recreate --abort-on-container-exit --exit-code-from cypress
EXIT_CODE=$?

# Re-enable strict error mode
set -e

# Clean up
# echo "Cleaning up Docker containers..." @@@
docker compose -f ../docker-compose.cypress.yaml down --volumes

# Print results
if [ $EXIT_CODE -eq 0 ]; then
    echo "✓ All Cypress tests passed!"
else
    echo "✗ Cypress tests failed with exit code $EXIT_CODE"
fi

# Exit with the captured exit code
exit $EXIT_CODE