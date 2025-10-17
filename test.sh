#!/bin/bash

# Run backend tests once
# This script starts the necessary infrastructure and runs all tests

echo "Starting test infrastructure..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml up -d db sqs

echo "Waiting for services to be healthy..."
sleep 5

echo "Running tests..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml run --rm backend-test

# Capture exit code
EXIT_CODE=$?

echo "Cleaning up..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml down backend-test

exit $EXIT_CODE
