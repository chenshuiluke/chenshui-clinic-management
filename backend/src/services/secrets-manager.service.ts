import {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  CreateSecretCommandInput,
  DeleteSecretCommandInput,
  GetSecretValueCommandInput,
} from "@aws-sdk/client-secrets-manager";

class SecretsManagerService {
  private client: SecretsManagerClient;
  private isMockMode: boolean;
  private mockSecrets: Set<string> = new Set();

  constructor() {
    const env = process.env.NODE_ENV || "development";
    this.isMockMode = env === "test" || env === "development";

    if (this.isMockMode) {
      // In test/development mode, create a mock client that doesn't make real AWS calls
      console.log(
        `[SecretsManager] Running in ${env} mode - using mock client`,
      );
      this.client = this.createMockClient();
    } else {
      // In production, use the real AWS client
      this.client = new SecretsManagerClient({
        region: process.env.AWS_REGION || "us-east-1",
      });
    }
  }

  private createMockClient(): SecretsManagerClient {
    // Create a mock client that simulates AWS Secrets Manager
    const mockClient = new SecretsManagerClient({
      region: "us-east-1",
    });

    // Override the send method to simulate responses
    const originalSend = mockClient.send.bind(mockClient);
    mockClient.send = async (command: any) => {
      if (command instanceof CreateSecretCommand) {
        console.log(
          `[SecretsManager Mock] CreateSecret called with name: ${command.input.Name}`,
        );
        // Check if secret already exists
        if (command.input.Name && this.mockSecrets.has(command.input.Name)) {
          const error = new Error(`The operation failed because the secret ${command.input.Name ?? 'unknown'} already exists.`);
          error.name = 'ResourceExistsException';
          throw error;
        }
        // Add to mock secrets set
        if (command.input.Name) {
          this.mockSecrets.add(command.input.Name);
        }
        return {
          ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${command.input.Name}`,
          Name: command.input.Name ?? 'unknown',
          VersionId: "mock-version-id",
        };
      } else if (command instanceof DeleteSecretCommand) {
        console.log(
          `[SecretsManager Mock] DeleteSecret called with id: ${command.input.SecretId}`,
        );
        // Remove from mock secrets set
        if (command.input.SecretId) {
          this.mockSecrets.delete(command.input.SecretId);
        }
        return {
          ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${command.input.SecretId}`,
          Name: command.input.SecretId ?? 'unknown',
          DeletionDate: new Date(),
        };
      } else if (command instanceof GetSecretValueCommand) {
        console.log(
          `[SecretsManager Mock] GetSecretValue called with id: ${command.input.SecretId}`,
        );
        // Return a mock secret value with typical database credentials structure
        return {
          ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${command.input.SecretId}`,
          Name: command.input.SecretId ?? 'unknown',
          SecretString: JSON.stringify({
            username: "mock_user",
            password: "mock_password",
            engine: "postgres",
            host: process.env.DB_HOST || "localhost",
            port: parseInt(process.env.DB_PORT || "5432"),
            dbname: "mock_db",
          }),
          VersionId: "mock-version-id",
        };
      }
      return originalSend(command);
    };

    return mockClient;
  }

  async createSecret(params: CreateSecretCommandInput) {
    const command = new CreateSecretCommand(params);
    return this.client.send(command);
  }

  async deleteSecret(params: DeleteSecretCommandInput) {
    const command = new DeleteSecretCommand(params);
    return this.client.send(command);
  }

  async getSecretValue(params: GetSecretValueCommandInput) {
    const command = new GetSecretValueCommand(params);
    return this.client.send(command);
  }

  getClient(): SecretsManagerClient {
    return this.client;
  }

  isMock(): boolean {
    return this.isMockMode;
  }

  clearMockSecrets(): void {
    if (this.isMockMode) {
      console.log('[SecretsManager Mock] Clearing mock secrets set');
      this.mockSecrets.clear();
    }
  }
}

export const secretsManagerService = new SecretsManagerService();
