import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as cloudflare from "@cdk-cloudformation/cloudflare-dns-record";

export interface DnsStackProps extends cdk.StackProps {
  cloudflareZoneId: string;
}

export class DnsStack extends cdk.Stack {
  public readonly hostedZone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: DnsStackProps) {
    super(scope, id, props);

    // lukecs.com is currently registered with Cloudflare but we want to use Route 53 for DNS management
    this.hostedZone = new route53.PublicHostedZone(this, "HostedZone", {
      zoneName: "clinic.lukecs.com",
    });
    // Always create 4 records as route 53 always returns 4 hosted zone name servers
    for (let i = 0; i < 4; i++) {
      new cloudflare.CfnRecord(this, `CloudflareNS${i}`, {
        zoneId: props.cloudflareZoneId,
        type: cloudflare.CfnRecordPropsType.NS,
        name: "clinic",
        content: cdk.Fn.select(i, this.hostedZone.hostedZoneNameServers!),
        ttl: 3600,
      });
    }

    // Export the hosted zone ID and name for use by the InfrastructureStack
    new cdk.CfnOutput(this, "HostedZoneId", {
      value: this.hostedZone.hostedZoneId,
      description: "The hosted zone ID for clinic.lukecs.com",
      exportName: "ClinicHostedZoneId",
    });

    new cdk.CfnOutput(this, "HostedZoneName", {
      value: this.hostedZone.zoneName,
      description: "The hosted zone name",
      exportName: "ClinicHostedZoneName",
    });
  }
}
