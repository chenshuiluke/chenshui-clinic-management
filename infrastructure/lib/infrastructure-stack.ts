import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Vpc } from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as logs from "aws-cdk-lib/aws-logs";
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

    new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      "API Service",
      {
        cluster: cluster,
        cpu: 256,
        desiredCount: 1,
        taskImageOptions: {
          image: ecs.ContainerImage.fromDockerImageAsset(dockerImage),
          containerPort: 3000, // Explicitly set the port

          environment: {
            NODE_ENV: "production",
            PORT: "3000",
            // Database connection info
            DB_HOST: db.dbInstanceEndpointAddress,
            DB_PORT: db.dbInstanceEndpointPort,
            DB_NAME: "chenshui_clinic_management",
          },

          // Add secrets (database credentials)
          secrets: {
            DB_USER: ecs.Secret.fromSecretsManager(db.secret!, "username"),
            DB_PASSWORD: ecs.Secret.fromSecretsManager(db.secret!, "password"),
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
  }
}
