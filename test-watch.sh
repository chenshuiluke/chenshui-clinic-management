#!/bin/bash

# Run backend tests in watch mode
# This script starts the necessary infrastructure and runs tests with file watching

echo "Starting test infrastructure..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml up -d db
echo "Waiting for services to be healthy..."
sleep 5

echo "Performing initial type-check..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml run --rm backend-test npm run typecheck || echo "Warning: Type errors detected. Watch mode will continue."

echo "Starting test watcher..."
echo "Tests will rerun automatically when files change. Press Ctrl+C to stop."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml up backend-test-watch

# Cleanup on exit
echo "Cleaning up..."
docker compose -f docker-compose.yaml -f docker-compose.test.yaml down backend-test-watch
