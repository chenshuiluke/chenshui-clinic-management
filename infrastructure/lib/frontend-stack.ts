import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53_targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

import path from "path";

interface FrontendStackProps extends cdk.StackProps {
  certificate: acm.ICertificate;
  hostedZone: route53.IHostedZone;
}

export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const { certificate, hostedZone } = props;

    // 1. S3 Bucket for Frontend Assets
    this.bucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 2. CloudFront Distribution with Origin Access Control
    this.distribution = new cloudfront.Distribution(
      this,
      "FrontendDistribution",
      {
        defaultRootObject: "index.html",
        domainNames: ["clinic.lukecs.com"],
        certificate: certificate,
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy:
            cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        },
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.seconds(0),
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.seconds(0),
          },
        ],
      },
    );

    // 3. Deploy Frontend Assets to S3
    // Frontend is automatically built during deployment
    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, "../../frontend"), {
          bundling: {
            image: cdk.DockerImage.fromRegistry("node:20-alpine"),
            command: [
              "sh",
              "-c",
              [
                "npm ci --legacy-peer-deps",
                "npm run build",
                "cp -r dist/* /asset-output/",
              ].join(" && "),
            ],
            environment: {
              VITE_API_BASE_URL: "https://api.clinic.lukecs.com",
            },
            user: "root",
          },
        }),
      ],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ["/*"],
      prune: true,
    });

    // 4. Create Route53 A Record for Frontend (apex/root domain)
    new route53.ARecord(this, "FrontendARecord", {
      zone: hostedZone,
      recordName: "", // Empty string for root/apex domain (clinic.lukecs.com)
      target: route53.RecordTarget.fromAlias(
        new route53_targets.CloudFrontTarget(this.distribution),
      ),
    });

    // 5. CloudFormation Outputs
    new cdk.CfnOutput(this, "FrontendUrl", {
      value: "https://clinic.lukecs.com",
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: this.distribution.distributionId,
    });
    new cdk.CfnOutput(this, "FrontendBucketName", {
      value: this.bucket.bucketName,
    });
  }
}
