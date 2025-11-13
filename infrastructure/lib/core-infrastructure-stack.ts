import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as ses from "aws-cdk-lib/aws-ses";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sns_subscriptions from "aws-cdk-lib/aws-sns-subscriptions";

export class CoreInfrastructureStack extends cdk.Stack {
  public readonly vpc: Vpc;
  public readonly database: rds.DatabaseInstance;
  public readonly certificate: acm.Certificate;
  public readonly hostedZone: route53.IHostedZone;
  public readonly jwtAccessSecret: secretsmanager.Secret;
  public readonly jwtRefreshSecret: secretsmanager.Secret;
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC Configuration
    this.vpc = new Vpc(this, "VPC", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/23"),
      maxAzs: 2, // I keep this as 2 to meet RDS's 2 AZ requirement for failovers and all that
      natGateways: 1, // But this will make only one nat gateway to save costs
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "Private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    // Import the hosted zone from the DNS stack using CloudFormation exports
    this.hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: cdk.Fn.importValue("ClinicHostedZoneId"),
        zoneName: cdk.Fn.importValue("ClinicHostedZoneName"),
      },
    );

    // Create ACM certificate for all clinic subdomains
    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: "clinic.lukecs.com",
      subjectAlternativeNames: [
        "*.clinic.lukecs.com", // Wildcard covers all subdomains
      ],
      validation: acm.CertificateValidation.fromDns(this.hostedZone),
    });

    // RDS Database
    this.database = new rds.DatabaseInstance(this, "DatabasePublic", {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      allocatedStorage: 20,
      maxAllocatedStorage: 25,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO,
      ),
      vpc: this.vpc,
      // TEMPORARY: Using public subnets for direct database access during development/assessment
      // TODO: Move back to private subnets
      vpcSubnets: this.vpc.selectSubnets({
        subnetType: ec2.SubnetType.PUBLIC,
      }),
      credentials: rds.Credentials.fromGeneratedSecret("chenshui_user"),
      databaseName: "chenshui_clinic_management",
      backupRetention: cdk.Duration.days(7),
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Might switch this to snapshot later on
      storageEncrypted: true,
      storageType: rds.StorageType.GP3,
      deletionProtection: false, // I should toggle this to true later on
      autoMinorVersionUpgrade: true,
      enablePerformanceInsights: true,
      performanceInsightRetention: rds.PerformanceInsightRetention.DEFAULT,
      publiclyAccessible: true, // True only because it needs to be accessible for assessment purposes. Will need to make further modifications due to private subnet later
    });


    // TODO: Remove this rule and restrict access to specific IPs
    this.database.connections.allowFrom(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(5432),
      'TEMPORARY: Allow database access from any IP for development - MUST RESTRICT LATER'
    );

    // Create SES email identity for sending emails
    // This verifies the domain for sending emails via AWS SES
    new ses.EmailIdentity(this, "SESEmailIdentity", {
      identity: ses.Identity.domain("clinic.lukecs.com"),
    });

    // Create JWT secrets for authentication
    this.jwtAccessSecret = new secretsmanager.Secret(this, "JWTAccessSecret", {
      description: "JWT Access Token Secret for API authentication",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "secret",
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    this.jwtRefreshSecret = new secretsmanager.Secret(this, "JWTRefreshSecret", {
      description: "JWT Refresh Token Secret for API authentication",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "secret",
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    // SNS Topic for alerts
    this.alertTopic = new sns.Topic(this, "CriticalAlerts");
    this.alertTopic.addSubscription(
      new sns_subscriptions.EmailSubscription("chenshuiluke@gmail.com"),
    );

    // Database connection alarm
    const alarmDBConnectionFailures = new cloudwatch.Alarm(
      this,
      "DBConnectionFailures",
      {
        metric: this.database.metricDatabaseConnections(),
        threshold: 15, // ~75% of max for t3.micro (20 connections)
        evaluationPeriods: 2,
        alarmDescription: "Database approaching connection limit",
      },
    );

    alarmDBConnectionFailures.addAlarmAction(
      new cloudwatch_actions.SnsAction(this.alertTopic),
    );

    // CloudFormation Outputs for cross-stack references
    new cdk.CfnOutput(this, "VpcId", {
      value: this.vpc.vpcId,
      exportName: "ClinicVpcId",
    });

    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: this.database.dbInstanceEndpointAddress,
      exportName: "ClinicDatabaseEndpoint",
    });

    new cdk.CfnOutput(this, "DatabasePort", {
      value: this.database.dbInstanceEndpointPort,
      exportName: "ClinicDatabasePort",
    });

    new cdk.CfnOutput(this, "CertificateArn", {
      value: this.certificate.certificateArn,
      exportName: "ClinicCertificateArn",
    });
  }
}
