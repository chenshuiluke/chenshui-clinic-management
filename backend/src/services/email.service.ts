import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import { templateLoader } from "../utils/template-loader";

export interface EmailParams {
  to: string;
  subject: string;
  htmlBody: string;
}

export enum EmailTemplate {
  PATIENT_REGISTRATION = "PATIENT_REGISTRATION",
  APPOINTMENT_BOOKED = "APPOINTMENT_BOOKED",
  APPOINTMENT_APPROVED = "APPOINTMENT_APPROVED",
  APPOINTMENT_DECLINED = "APPOINTMENT_DECLINED",
  APPOINTMENT_CANCELLED = "APPOINTMENT_CANCELLED",
  APPOINTMENT_COMPLETED = "APPOINTMENT_COMPLETED",
}

class EmailService {
  private client: SESClient;
  private isMockMode: boolean;
  private sentEmails: EmailParams[] = [];

  constructor() {
    const env = process.env.NODE_ENV || "development";
    this.isMockMode = env === "test" || env === "development";

    if (this.isMockMode) {
      // In test/development mode, create a mock client that doesn't make real AWS calls
      console.log(`[EmailService] Running in ${env} mode - using mock client`);
      this.client = this.createMockClient();
    } else {
      // In production, use the real AWS client
      this.client = new SESClient({
        region: process.env.AWS_REGION || "us-east-1",
      });
    }
  }

  private createMockClient(): SESClient {
    // Create a mock client that simulates AWS SES
    const mockClient = new SESClient({
      region: "us-east-1",
    });

    // Override the send method to simulate responses
    const originalSend = mockClient.send.bind(mockClient);
    mockClient.send = async (command: any) => {
      if (command instanceof SendEmailCommand) {
        console.log(
          `[EmailService Mock] SendEmail called to: ${command.input.Destination?.ToAddresses?.[0]}, subject: ${command.input.Message?.Subject?.Data}`,
        );
        // Store the email for test assertions
        const emailParams: EmailParams = {
          to: command.input.Destination?.ToAddresses?.[0] || "",
          subject: command.input.Message?.Subject?.Data || "",
          htmlBody: command.input.Message?.Body?.Html?.Data || "",
        };
        this.sentEmails.push(emailParams);
        return {
          MessageId: `mock-message-id-${Date.now()}`,
        };
      }
      return originalSend(command);
    };

    return mockClient;
  }

  async sendEmail(params: EmailParams): Promise<void> {
    const fromEmail =
      process.env.AWS_SES_FROM_EMAIL || "noreply@clinic.lukecs.com";
    const fromName =
      process.env.AWS_SES_FROM_NAME || "Clinic Management System";

    const sendEmailParams: SendEmailCommandInput = {
      Source: `${fromName} <${fromEmail}>`,
      Destination: {
        ToAddresses: [params.to],
      },
      Message: {
        Subject: {
          Data: params.subject,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: params.htmlBody,
            Charset: "UTF-8",
          },
        },
      },
    };

    const command = new SendEmailCommand(sendEmailParams);
    await this.client.send(command);
  }

  getSentEmails(): EmailParams[] {
    return this.sentEmails;
  }

  clearSentEmails(): void {
    if (this.isMockMode) {
      console.log("[EmailService Mock] Clearing sent emails array");
      this.sentEmails = [];
    }
  }

  isMock(): boolean {
    return this.isMockMode;
  }

  // Template methods

  async sendPatientRegistrationEmail(params: {
    to: string;
    patientName: string;
    organizationName: string;
  }): Promise<void> {
    const subject = "Welcome to Clinic Management System";
    const htmlBody = templateLoader.render(
      "patient-registration",
      {
        patientName: params.patientName,
        organizationName: params.organizationName,
      },
      {
        title: "Welcome to Clinic Management System",
        headerColor: "#4CAF50",
      },
    );

    await this.sendEmail({
      to: params.to,
      subject,
      htmlBody,
    });
  }

  async sendAppointmentBookedEmail(params: {
    doctorEmail: string;
    doctorName: string;
    patientName: string;
    appointmentDateTime: Date;
    notes: string;
  }): Promise<void> {
    const subject = "New Appointment Request";
    const formattedDate = params.appointmentDateTime.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const htmlBody = templateLoader.render(
      "appointment-booked",
      {
        doctorName: params.doctorName,
        patientName: params.patientName,
        appointmentDateTime: formattedDate,
        notes: params.notes,
      },
      {
        title: "New Appointment Request",
        headerColor: "#2196F3",
      },
    );

    await this.sendEmail({
      to: params.doctorEmail,
      subject,
      htmlBody,
    });
  }

  async sendAppointmentApprovedEmail(params: {
    patientEmail: string;
    patientName: string;
    doctorName: string;
    appointmentDateTime: Date;
  }): Promise<void> {
    const subject = "Appointment Approved";
    const formattedDate = params.appointmentDateTime.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const htmlBody = templateLoader.render(
      "appointment-approved",
      {
        patientName: params.patientName,
        doctorName: params.doctorName,
        appointmentDateTime: formattedDate,
      },
      {
        title: "Appointment Approved",
        headerColor: "#4CAF50",
      },
    );

    await this.sendEmail({
      to: params.patientEmail,
      subject,
      htmlBody,
    });
  }

  async sendAppointmentDeclinedEmail(params: {
    patientEmail: string;
    patientName: string;
    doctorName: string;
    appointmentDateTime: Date;
  }): Promise<void> {
    const subject = "Appointment Declined";
    const formattedDate = params.appointmentDateTime.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const htmlBody = templateLoader.render(
      "appointment-declined",
      {
        patientName: params.patientName,
        doctorName: params.doctorName,
        appointmentDateTime: formattedDate,
      },
      {
        title: "Appointment Declined",
        headerColor: "#f44336",
      },
    );

    await this.sendEmail({
      to: params.patientEmail,
      subject,
      htmlBody,
    });
  }

  async sendAppointmentCancelledEmail(params: {
    doctorEmail: string;
    doctorName: string;
    patientName: string;
    appointmentDateTime: Date;
  }): Promise<void> {
    const subject = "Appointment Cancelled";
    const formattedDate = params.appointmentDateTime.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const htmlBody = templateLoader.render(
      "appointment-cancelled",
      {
        doctorName: params.doctorName,
        patientName: params.patientName,
        appointmentDateTime: formattedDate,
      },
      {
        title: "Appointment Cancelled",
        headerColor: "#FF9800",
      },
    );

    await this.sendEmail({
      to: params.doctorEmail,
      subject,
      htmlBody,
    });
  }

  async sendAppointmentCompletedEmail(params: {
    patientEmail: string;
    patientName: string;
    doctorName: string;
    appointmentDateTime: Date;
  }): Promise<void> {
    const subject = "Appointment Completed";
    const formattedDate = params.appointmentDateTime.toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "short",
    });

    const htmlBody = templateLoader.render(
      "appointment-completed",
      {
        patientName: params.patientName,
        doctorName: params.doctorName,
        appointmentDateTime: formattedDate,
      },
      {
        title: "Appointment Completed",
        headerColor: "#4CAF50",
      },
    );

    await this.sendEmail({
      to: params.patientEmail,
      subject,
      htmlBody,
    });
  }

  async sendPatientDeletionEmail(params: {
    to: string;
    patientName: string;
    organizationName: string;
  }): Promise<void> {
    const subject = "Account Deletion Confirmation";
    const htmlBody = templateLoader.render(
      "patient-deletion",
      {
        patientName: params.patientName,
        organizationName: params.organizationName,
      },
      {
        title: "Account Deletion Confirmation",
        headerColor: "#f44336",
      },
    );

    await this.sendEmail({
      to: params.to,
      subject,
      htmlBody,
    });
  }
}

export const emailService = new EmailService();
