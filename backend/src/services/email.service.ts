import { templateLoader } from "../utils/template-loader";
import { env } from "../config/env";
import sendgrid from "@sendgrid/mail";

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
  private client: typeof sendgrid;
  private isMockMode: boolean;
  private sentEmails: EmailParams[] = [];

  constructor() {
    this.isMockMode = env.isMockMode;

    if (this.isMockMode) {
      // In test/development mode, create a mock client
      console.log(`[EmailService] Running in ${env.nodeEnv} mode - using mock client`);
      this.client = this.createMockClient();
    } else {
      // In production, use the real SendGrid client
      sendgrid.setApiKey(env.sendgridApiKey);
      this.client = sendgrid;
    }
  }

  private createMockClient(): typeof sendgrid {
    // Create a mock client that simulates SendGrid
    const mockClient = {
      setApiKey: (apiKey: string) => {
        console.log(`[EmailService Mock] setApiKey called`);
      },
      send: async (msg: sendgrid.MailDataRequired) => {
        console.log(
          `[EmailService Mock] SendEmail called to: ${msg.to}, subject: ${msg.subject}`,
        );
        // Store the email for test assertions
        const emailParams: EmailParams = {
          to: Array.isArray(msg.to) ? msg.to[0]!.toString() : msg.to!.toString(),
          subject: msg.subject || "",
          htmlBody: typeof msg.html === 'string' ? msg.html : "",
        };
        this.sentEmails.push(emailParams);
        return [
          {
            statusCode: 202,
            body: {},
            headers: {},
          },
          {},
        ];
      },
    } as typeof sendgrid;

    return mockClient;
  }

  async sendEmail(params: EmailParams): Promise<void> {
    const fromEmail =
      process.env.AWS_SES_FROM_EMAIL || "noreply@clinic.lukecs.com";
    const fromName =
      process.env.AWS_SES_FROM_NAME || "Clinic Management System";

    const msg: sendgrid.MailDataRequired = {
      to: params.to,
      from: {
        email: fromEmail,
        name: fromName,
      },
      subject: params.subject,
      html: params.htmlBody,
    };

    await this.client.send(msg);
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
