#!/bin/bash

# Run backend tests once
# This script starts the necessary infrastructure and runs all tests

echo "Starting test infrastructure..."
docker compose -f docker-compose.test.yaml up -d db sqs

echo "Waiting for services to be healthy..."
sleep 5

echo "Type-checking TypeScript files..."
docker compose -f docker-compose.test.yaml run --rm backend-test npm run typecheck
TYPECHECK_EXIT_CODE=$?

if [ $TYPECHECK_EXIT_CODE -ne 0 ]; then
  echo "Type-checking failed. Fix compilation errors before running tests."
  docker compose -f docker-compose.test.yaml down
  exit $TYPECHECK_EXIT_CODE
fi

echo "Running tests..."
docker compose -f docker-compose.test.yaml run --rm backend-test

# Capture exit code
EXIT_CODE=$?

echo "Cleaning up..."
docker compose -f docker-compose.test.yaml down

exit $EXIT_CODE
