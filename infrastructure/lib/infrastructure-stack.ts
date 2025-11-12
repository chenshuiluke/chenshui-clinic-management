import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53_targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";

import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sns_subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as ses from "aws-cdk-lib/aws-ses";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

import path from "path";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "VPC", {
      ipAddresses: ec2.IpAddresses.cidr("10.0.0.0/23"),
      maxAzs: 2, // I keep this as 2 to meet RDS's 2 AZ requirement for failovers and all that
      natGateways: 1, // But this will make only one nat gateway to save costs
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC },
        { name: "Private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    // Import the hosted zone from the DNS stack using CloudFormation exports
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: cdk.Fn.importValue("ClinicHostedZoneId"),
        zoneName: cdk.Fn.importValue("ClinicHostedZoneName"),
      },
    );

    // Create ACM certificate for all clinic subdomains
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: "clinic.lukecs.com",
      subjectAlternativeNames: [
        "*.clinic.lukecs.com", // Wildcard covers all subdomains
      ],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const db = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      allocatedStorage: 20,
      maxAllocatedStorage: 25,
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO,
      ),
      vpc: vpc,
      vpcSubnets: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
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

    // Create SES email identity for sending emails
    // This verifies the domain for sending emails via AWS SES
    new ses.EmailIdentity(this, "SESEmailIdentity", {
      identity: ses.Identity.domain("clinic.lukecs.com"),
    });

    // Create JWT secrets for authentication
    const jwtAccessSecret = new secretsmanager.Secret(this, "JWTAccessSecret", {
      description: "JWT Access Token Secret for API authentication",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "secret",
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    const jwtRefreshSecret = new secretsmanager.Secret(this, "JWTRefreshSecret", {
      description: "JWT Refresh Token Secret for API authentication",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "secret",
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    const dockerImage = new ecr_assets.DockerImageAsset(
      this,
      "APIDockerImage",
      {
        directory: path.join(__dirname, "../../backend"),
        platform: ecr_assets.Platform.LINUX_AMD64, // I put this since I am developing on an M4 Macbook Pro but the AWS instances are running on x86_64 architecture
      },
    );

    const cluster = new ecs.Cluster(this, "API Cluster", {
      vpc: vpc,
    });

    const fargateService =
      new ecs_patterns.ApplicationLoadBalancedFargateService(
        this,
        "API Service",
        {
          cluster: cluster,
          cpu: 256,
          desiredCount: 1,
          certificate: certificate,
          listenerPort: 443,
          taskImageOptions: {
            image: ecs.ContainerImage.fromDockerImageAsset(dockerImage),
            containerPort: 3000, // The load balancer will handle ssl termination and then forward traffic to this port.

            environment: {
              NODE_ENV: "production",
              PORT: "3000",
              // Database connection info
              DB_HOST: db.dbInstanceEndpointAddress,
              DB_PORT: db.dbInstanceEndpointPort,
              DB_NAME: "chenshui_clinic_management",
              // Email configuration
              AWS_REGION: this.region,
              AWS_SES_FROM_EMAIL: "noreply@clinic.lukecs.com",
              AWS_SES_FROM_NAME: "Clinic Management System",
              // CORS configuration
              CORS_ALLOWED_ORIGINS: "https://clinic.lukecs.com",
            },

            // Add secrets (database credentials and JWT secrets)
            secrets: {
              DB_USER: ecs.Secret.fromSecretsManager(db.secret!, "username"),
              DB_PASSWORD: ecs.Secret.fromSecretsManager(
                db.secret!,
                "password",
              ),
              JWT_ACCESS_SECRET: ecs.Secret.fromSecretsManager(jwtAccessSecret, "secret"),
              JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(jwtRefreshSecret, "secret"),
            },

            logDriver: ecs.LogDrivers.awsLogs({
              streamPrefix: "api",
              logRetention: logs.RetentionDays.ONE_WEEK,
            }),
          },
          taskSubnets: vpc.selectSubnets({
            subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          }),
          memoryLimitMiB: 512,
          publicLoadBalancer: true,
        },
      );

    // Add api.clinic.lukecs.com A record for the loadbalancer
    new route53.ARecord(this, "ApiARecord", {
      zone: hostedZone,
      recordName: "api", // Just the subdomain part
      target: route53.RecordTarget.fromAlias(
        new route53_targets.LoadBalancerTarget(fargateService.loadBalancer),
      ),
    });
    // Allow Fargate service to connect to RDS
    db.connections.allowFrom(
      fargateService.service,
      ec2.Port.tcp(5432),
      "Allow Fargate tasks to connect to RDS",
    );

    // Grant SES permissions to ECS task role
    // This allows the ECS tasks to send emails via AWS SES
    fargateService.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );

    // Grant Secrets Manager permissions to ECS task role
    // This allows the ECS tasks to manage organization database secrets
    // Permissions follow principle of least privilege:
    // - CreateSecret: Required for creating new organization database credentials
    // - DeleteSecret: Required for cleanup when deleting organizations
    // - GetSecretValue: Required to retrieve credentials when connecting to org databases
    // - TagResource: Required for adding organization metadata tags during creation
    // - Resources limited to secrets with "clinic-db-" prefix only
    // Note: PutSecretValue is NOT granted - secrets are immutable after creation
    fargateService.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "secretsmanager:CreateSecret",
          "secretsmanager:DeleteSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:TagResource",
        ],
        resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:clinic-db-*`],
      }),
    );

    // Add alarms for outages or signs of upcoming issues like resource exhaustion
    const alertTopic = new sns.Topic(this, "CriticalAlerts");
    alertTopic.addSubscription(
      new sns_subscriptions.EmailSubscription("chenshuiluke@gmail.com"),
    );

    const alarm500Errors = new cloudwatch.Alarm(this, "ALB500Errors", {
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HTTPCode_Target_5XX_Count",
        dimensionsMap: {
          LoadBalancer: fargateService.loadBalancer.loadBalancerFullName,
          TargetGroup: fargateService.targetGroup.targetGroupFullName,
        },
        statistic: "Sum",
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Any 500 error from the API",
    });

    const alarmNoRunningTasks = new cloudwatch.Alarm(this, "NoRunningTasks", {
      metric: new cloudwatch.Metric({
        namespace: "AWS/ECS",
        metricName: "RunningTaskCount",
        dimensionsMap: {
          ClusterName: cluster.clusterName,
          ServiceName: fargateService.service.serviceName,
        },
        statistic: "Average",
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      alarmDescription: "No API tasks running for 3+ minutes",
    });

    const alarmDBConnectionFailures = new cloudwatch.Alarm(
      this,
      "DBConnectionFailures",
      {
        metric: db.metricDatabaseConnections(),
        threshold: 15, // ~75% of max for t3.micro (20 connections)
        evaluationPeriods: 2,
        alarmDescription: "Database approaching connection limit",
      },
    );

    const alarmHighCPU = new cloudwatch.Alarm(this, "HighCPU", {
      metric: fargateService.service.metricCpuUtilization(),
      threshold: 90,
      evaluationPeriods: 2,
      alarmDescription: "API CPU above 90% for 2+ minutes",
    });

    const alarmHighMemory = new cloudwatch.Alarm(this, "HighMemory", {
      metric: fargateService.service.metricMemoryUtilization(),
      threshold: 90,
      evaluationPeriods: 2,
      alarmDescription: "API Memory above 90% for 2+ minutes",
    });

    [
      alarmDBConnectionFailures,
      alarmHighCPU,
      alarmHighMemory,
      alarmNoRunningTasks,
      alarm500Errors,
    ].forEach((alarm) => {
      alarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
    });

    // --- Frontend Deployment ---

    // 1. S3 Bucket for Frontend Assets
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 2. CloudFront Distribution with Origin Access Control
    const frontendDistribution = new cloudfront.Distribution(
      this,
      "FrontendDistribution",
      {
        defaultRootObject: "index.html",
        domainNames: ["clinic.lukecs.com"],
        certificate: certificate,
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket),
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
      destinationBucket: frontendBucket,
      distribution: frontendDistribution,
      distributionPaths: ["/*"],
      prune: true,
    });

    // 4. Create Route53 A Record for Frontend
    new route53.ARecord(this, "FrontendARecord", {
      zone: hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53_targets.CloudFrontTarget(frontendDistribution),
      ),
    });

    // 5. CloudFormation Outputs
    new cdk.CfnOutput(this, "FrontendUrl", {
      value: "https://clinic.lukecs.com",
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: frontendDistribution.distributionId,
    });
    new cdk.CfnOutput(this, "FrontendBucketName", {
      value: frontendBucket.bucketName,
    });
  }
}
