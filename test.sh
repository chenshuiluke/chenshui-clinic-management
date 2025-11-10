#!/bin/bash

# Run backend tests once
# This script starts the necessary infrastructure and runs all tests

echo "Cleaning up any existing test infrastructure..."
docker compose -f docker-compose.test.yaml down --remove-orphans --volumes

echo "Starting fresh test infrastructure..."
docker compose -f docker-compose.test.yaml up -d --force-recreate --renew-anon-volumes db

echo "Waiting for services to be healthy..."
sleep 5

echo "Running tests (includes npm ci, typecheck, and tests)..."
docker compose -f docker-compose.test.yaml run --rm backend-test

# Capture exit code
EXIT_CODE=$?

echo "Cleaning up..."
docker compose -f docker-compose.test.yaml down

exit $EXIT_CODE
