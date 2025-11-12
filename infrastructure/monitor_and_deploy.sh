#!/bin/bash

echo "Starting stack monitor..."
echo "Will check every 10 minutes until deletion completes, then redeploy."

while true; do
    echo ""
    echo "================================================"
    echo "Checking at: $(date)"
    
    # Check stack status
    STATUS=$(aws cloudformation describe-stacks --stack-name InfrastructureStack --query 'Stacks[0].StackStatus' --output text 2>&1)
    
    if echo "$STATUS" | grep -q "does not exist\|Stack not found"; then
        echo "✅ Stack has been deleted successfully!"
        echo "Starting deployment with all fixes..."
        cdk deploy InfrastructureStack --require-approval never
        exit 0
    elif echo "$STATUS" | grep -q "DELETE_FAILED"; then
        echo "❌ Deletion failed! Forcing deletion..."
        cdk destroy InfrastructureStack --force
        echo "Waiting 5 minutes before checking again..."
        sleep 300
    elif echo "$STATUS" | grep -q "DELETE_IN_PROGRESS"; then
        echo "⏳ Deletion still in progress (status: $STATUS)"
        echo "Waiting 10 minutes before next check..."
        sleep 600
    else
        echo "⚠️  Unexpected status: $STATUS"
        echo "Waiting 10 minutes before next check..."
        sleep 600
    fi
done
