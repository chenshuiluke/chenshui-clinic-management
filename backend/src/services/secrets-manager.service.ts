import {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  CreateSecretCommandInput,
  DeleteSecretCommandInput,
  GetSecretValueCommandInput,
} from "@aws-sdk/client-secrets-manager";
import { env } from "../config/env";

class SecretsManagerService {
  private client: SecretsManagerClient;
  private isMockMode: boolean;
  private mockSecrets: Map<string, Record<string, any>> = new Map();

  constructor() {
    this.isMockMode = env.isMockMode;

    if (this.isMockMode) {
      // In test/development mode, create a mock client that doesn't make real AWS calls
      console.log(
        `[SecretsManagerService] Running in ${env.nodeEnv} mode - using mock client`,
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
        // Parse and store the secret value
        if (command.input.Name && command.input.SecretString) {
          try {
            const secretValue = JSON.parse(command.input.SecretString);
            this.mockSecrets.set(command.input.Name, secretValue);
          } catch (e) {
            // If not valid JSON, store as-is
            this.mockSecrets.set(command.input.Name, { value: command.input.SecretString });
          }
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
        // Remove from mock secrets map
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
        // Check if we have a stored secret value
        if (command.input.SecretId && this.mockSecrets.has(command.input.SecretId)) {
          const secretValue = this.mockSecrets.get(command.input.SecretId);
          return {
            ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${command.input.SecretId}`,
            Name: command.input.SecretId ?? 'unknown',
            SecretString: JSON.stringify(secretValue),
            VersionId: "mock-version-id",
          };
        }
        // Return null if secret not found (will trigger error in getOrgConfig)
        return {
          ARN: `arn:aws:secretsmanager:us-east-1:123456789012:secret:${command.input.SecretId}`,
          Name: command.input.SecretId ?? 'unknown',
          SecretString: null,
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

  public setMockSecret(secretId: string, value: Record<string, any>): void {
    if (!this.isMockMode) {
      throw new Error('setMockSecret can only be called in mock mode');
    }
    this.mockSecrets.set(secretId, value);
    console.log(`[SecretsManager Mock] Set mock secret for ${secretId}`);
  }
}

export const secretsManagerService = new SecretsManagerService();
