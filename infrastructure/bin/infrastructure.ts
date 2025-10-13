#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfrastructureStack } from "../lib/infrastructure-stack";

const app = new cdk.App();
new InfrastructureStack(app, "InfrastructureStack", {
  env: {
    account: "918595517105",
    region: "us-east-1",
  },
});
