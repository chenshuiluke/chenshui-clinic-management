import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53_targets from "aws-cdk-lib/aws-route53-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatch_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";

import path from "path";

interface ApiStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  database: rds.DatabaseInstance;
  certificate: acm.ICertificate;
  hostedZone: route53.IHostedZone;
  jwtAccessSecret: secretsmanager.ISecret;
  jwtRefreshSecret: secretsmanager.ISecret;
  sendgridApiKey: secretsmanager.ISecret;
  alertTopic: sns.ITopic;
}

export class ApiStack extends cdk.Stack {
  public readonly fargateService: ecs_patterns.ApplicationLoadBalancedFargateService;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const {
      vpc,
      database,
      certificate,
      hostedZone,
      jwtAccessSecret,
      jwtRefreshSecret,
      sendgridApiKey,
      alertTopic,
    } = props;

    // Build Docker image
    const dockerImage = new ecr_assets.DockerImageAsset(
      this,
      "APIDockerImage",
      {
        directory: path.join(__dirname, "../../backend"),
        platform: ecr_assets.Platform.LINUX_AMD64, // I put this since I am developing on an M4 Macbook Pro but the AWS instances are running on x86_64 architecture
      },
    );

    // Create ECS Cluster
    const cluster = new ecs.Cluster(this, "API Cluster", {
      vpc: vpc,
    });

    // Create Fargate Service with ALB
    this.fargateService =
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
              DB_HOST: database.dbInstanceEndpointAddress,
              DB_PORT: database.dbInstanceEndpointPort,
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
              DB_USER: ecs.Secret.fromSecretsManager(database.secret!, "username"),
              DB_PASSWORD: ecs.Secret.fromSecretsManager(
                database.secret!,
                "password",
              ),
              JWT_ACCESS_SECRET: ecs.Secret.fromSecretsManager(jwtAccessSecret, "secret"),
              JWT_REFRESH_SECRET: ecs.Secret.fromSecretsManager(jwtRefreshSecret, "secret"),
              SENDGRID_API_KEY: ecs.Secret.fromSecretsManager(sendgridApiKey),
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
        new route53_targets.LoadBalancerTarget(this.fargateService.loadBalancer),
      ),
    });

    // Allow Fargate service to connect to RDS
    // Note: We use allowDefaultPortFrom instead of allowFrom to avoid circular dependency
    this.fargateService.service.connections.allowTo(
      database,
      ec2.Port.tcp(5432),
      "Allow Fargate tasks to connect to RDS",
    );

    // Grant SES permissions to ECS task role
    // This allows the ECS tasks to send emails via AWS SES
    this.fargateService.taskDefinition.taskRole.addToPrincipalPolicy(
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
    this.fargateService.taskDefinition.taskRole.addToPrincipalPolicy(
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

    // CloudWatch Alarms
    const alarm500Errors = new cloudwatch.Alarm(this, "ALB500Errors", {
      metric: new cloudwatch.Metric({
        namespace: "AWS/ApplicationELB",
        metricName: "HTTPCode_Target_5XX_Count",
        dimensionsMap: {
          LoadBalancer: this.fargateService.loadBalancer.loadBalancerFullName,
          TargetGroup: this.fargateService.targetGroup.targetGroupFullName,
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
          ServiceName: this.fargateService.service.serviceName,
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

    const alarmHighCPU = new cloudwatch.Alarm(this, "HighCPU", {
      metric: this.fargateService.service.metricCpuUtilization(),
      threshold: 90,
      evaluationPeriods: 2,
      alarmDescription: "API CPU above 90% for 2+ minutes",
    });

    const alarmHighMemory = new cloudwatch.Alarm(this, "HighMemory", {
      metric: this.fargateService.service.metricMemoryUtilization(),
      threshold: 90,
      evaluationPeriods: 2,
      alarmDescription: "API Memory above 90% for 2+ minutes",
    });

    // Add alarm actions
    [alarmHighCPU, alarmHighMemory, alarmNoRunningTasks, alarm500Errors].forEach(
      (alarm) => {
        alarm.addAlarmAction(new cloudwatch_actions.SnsAction(alertTopic));
      },
    );

    // CloudFormation Outputs
    new cdk.CfnOutput(this, "ApiUrl", {
      value: `https://api.clinic.lukecs.com`,
    });

    new cdk.CfnOutput(this, "LoadBalancerDNS", {
      value: this.fargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}
