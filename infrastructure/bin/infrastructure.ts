#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { CoreInfrastructureStack } from "../lib/core-infrastructure-stack";
import { ApiStack } from "../lib/api-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { DnsStack } from "../lib/dns-stack";

const app = new cdk.App();

const envConfig = {
  account: "918595517105",
  region: "us-east-1",
};

/* This ensures that DNS changes (and any necessary DNS propogations)
    are only deployed if the DNS stack is changed, not when the infrastructure
    stack is deployed
*/
const dnsStack = new DnsStack(app, "DnsStack", {
  cloudflareZoneId: "c5a9a237becdc8ba3b085ddd98229491",
  env: envConfig,
});

// Deploy core infrastructure (VPC, RDS, certificates, secrets, etc.)
const coreStack = new CoreInfrastructureStack(app, "CoreInfrastructureStack", {
  env: envConfig,
});

// Deploy API stack (ECS Fargate service with ALB)
const apiStack = new ApiStack(app, "ApiStack", {
  env: envConfig,
  vpc: coreStack.vpc,
  database: coreStack.database,
  certificate: coreStack.certificate,
  hostedZone: coreStack.hostedZone,
  jwtAccessSecret: coreStack.jwtAccessSecret,
  jwtRefreshSecret: coreStack.jwtRefreshSecret,
  alertTopic: coreStack.alertTopic,
});

// Deploy frontend stack (S3 + CloudFront)
const frontendStack = new FrontendStack(app, "FrontendStack", {
  env: envConfig,
  certificate: coreStack.certificate,
  hostedZone: coreStack.hostedZone,
});

// Explicitly declare dependencies
coreStack.addDependency(dnsStack);
apiStack.addDependency(coreStack);
frontendStack.addDependency(coreStack);
