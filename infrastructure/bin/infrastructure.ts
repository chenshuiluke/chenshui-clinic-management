#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfrastructureStack } from "../lib/infrastructure-stack";
import { DnsStack } from "../lib/dns-stack";

const app = new cdk.App();

/* This ensures that DNS changes (and any necessary DNS propogations)
    are only deployed if the DNS stack is changed, not when the infrastructure
    stack is deployed
*/
new DnsStack(app, "DnsStack", {
  cloudflareZoneId: "c5a9a237becdc8ba3b085ddd98229491",
  env: {
    account: "918595517105",
    region: "us-east-1",
  },
});

// Deploy infrastructure stack
new InfrastructureStack(app, "InfrastructureStack", {
  env: {
    account: "918595517105",
    region: "us-east-1",
  },
});
