import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

export interface EmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody: string;
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
          textBody: command.input.Message?.Body?.Text?.Data || "",
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
          Text: {
            Data: params.textBody,
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
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Clinic Management System</h1>
          </div>
          <div class="content">
            <p>Dear ${params.patientName},</p>
            <p>Welcome to ${params.organizationName}! Your patient account has been successfully created.</p>
            <p>You can now:</p>
            <ul>
              <li>Book appointments with your healthcare providers</li>
              <li>View your appointment history</li>
              <li>Manage your profile information</li>
            </ul>
            <p>If you have any questions, please don't hesitate to contact us.</p>
            <p>Best regards,<br>${params.organizationName}</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Clinic Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const textBody = `Welcome to Clinic Management System\n\nDear ${params.patientName},\n\nWelcome to ${params.organizationName}! Your patient account has been successfully created.\n\nYou can now:\n- Book appointments with your healthcare providers\n- View your appointment history\n- Manage your profile information\n\nIf you have any questions, please don't hesitate to contact us.\n\nBest regards,\n${params.organizationName}`;

    await this.sendEmail({
      to: params.to,
      subject,
      htmlBody,
      textBody,
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

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #2196F3; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .appointment-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #2196F3; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>New Appointment Request</h1>
          </div>
          <div class="content">
            <p>Dear Dr. ${params.doctorName},</p>
            <p>You have received a new appointment request.</p>
            <div class="appointment-details">
              <strong>Patient:</strong> ${params.patientName}<br>
              <strong>Date & Time:</strong> ${formattedDate}<br>
              ${params.notes ? `<strong>Notes:</strong> ${params.notes}<br>` : ""}
            </div>
            <p>Please review and approve or decline this appointment at your earliest convenience.</p>
            <p>Best regards,<br>Clinic Management System</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Clinic Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const textBody = `New Appointment Request\n\nDear Dr. ${params.doctorName},\n\nYou have received a new appointment request.\n\nPatient: ${params.patientName}\nDate & Time: ${formattedDate}\n${params.notes ? `Notes: ${params.notes}\n` : ""}\nPlease review and approve or decline this appointment at your earliest convenience.\n\nBest regards,\nClinic Management System`;

    await this.sendEmail({
      to: params.doctorEmail,
      subject,
      htmlBody,
      textBody,
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

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .appointment-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Appointment Approved</h1>
          </div>
          <div class="content">
            <p>Dear ${params.patientName},</p>
            <p>Great news! Your appointment has been approved.</p>
            <div class="appointment-details">
              <strong>Doctor:</strong> Dr. ${params.doctorName}<br>
              <strong>Date & Time:</strong> ${formattedDate}<br>
            </div>
            <p>Please make sure to arrive on time for your appointment.</p>
            <p>Best regards,<br>Clinic Management System</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Clinic Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const textBody = `Appointment Approved\n\nDear ${params.patientName},\n\nGreat news! Your appointment has been approved.\n\nDoctor: Dr. ${params.doctorName}\nDate & Time: ${formattedDate}\n\nPlease make sure to arrive on time for your appointment.\n\nBest regards,\nClinic Management System`;

    await this.sendEmail({
      to: params.patientEmail,
      subject,
      htmlBody,
      textBody,
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

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .appointment-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #f44336; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Appointment Declined</h1>
          </div>
          <div class="content">
            <p>Dear ${params.patientName},</p>
            <p>Unfortunately, your appointment request has been declined.</p>
            <div class="appointment-details">
              <strong>Doctor:</strong> Dr. ${params.doctorName}<br>
              <strong>Date & Time:</strong> ${formattedDate}<br>
            </div>
            <p>Please contact us to schedule an alternative appointment or if you have any questions.</p>
            <p>Best regards,<br>Clinic Management System</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Clinic Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const textBody = `Appointment Declined\n\nDear ${params.patientName},\n\nUnfortunately, your appointment request has been declined.\n\nDoctor: Dr. ${params.doctorName}\nDate & Time: ${formattedDate}\n\nPlease contact us to schedule an alternative appointment or if you have any questions.\n\nBest regards,\nClinic Management System`;

    await this.sendEmail({
      to: params.patientEmail,
      subject,
      htmlBody,
      textBody,
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

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #FF9800; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .appointment-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #FF9800; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Appointment Cancelled</h1>
          </div>
          <div class="content">
            <p>Dear Dr. ${params.doctorName},</p>
            <p>An appointment has been cancelled by the patient.</p>
            <div class="appointment-details">
              <strong>Patient:</strong> ${params.patientName}<br>
              <strong>Date & Time:</strong> ${formattedDate}<br>
            </div>
            <p>This appointment slot is now available for other patients.</p>
            <p>Best regards,<br>Clinic Management System</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Clinic Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const textBody = `Appointment Cancelled\n\nDear Dr. ${params.doctorName},\n\nAn appointment has been cancelled by the patient.\n\nPatient: ${params.patientName}\nDate & Time: ${formattedDate}\n\nThis appointment slot is now available for other patients.\n\nBest regards,\nClinic Management System`;

    await this.sendEmail({
      to: params.doctorEmail,
      subject,
      htmlBody,
      textBody,
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

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .appointment-details { background-color: white; padding: 15px; margin: 15px 0; border-left: 4px solid #4CAF50; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Appointment Completed</h1>
          </div>
          <div class="content">
            <p>Dear ${params.patientName},</p>
            <p>Your appointment has been completed.</p>
            <div class="appointment-details">
              <strong>Doctor:</strong> Dr. ${params.doctorName}<br>
              <strong>Date & Time:</strong> ${formattedDate}<br>
            </div>
            <p>Thank you for visiting us. If you have any follow-up questions, please don't hesitate to contact us.</p>
            <p>Best regards,<br>Clinic Management System</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Clinic Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const textBody = `Appointment Completed\n\nDear ${params.patientName},\n\nYour appointment has been completed.\n\nDoctor: Dr. ${params.doctorName}\nDate & Time: ${formattedDate}\n\nThank you for visiting us. If you have any follow-up questions, please don't hesitate to contact us.\n\nBest regards,\nClinic Management System`;

    await this.sendEmail({
      to: params.patientEmail,
      subject,
      htmlBody,
      textBody,
    });
  }

  async sendPatientDeletionEmail(params: {
    to: string;
    patientName: string;
    organizationName: string;
  }): Promise<void> {
    const subject = "Account Deletion Confirmation";
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Account Deletion Confirmation</h1>
          </div>
          <div class="content">
            <p>Dear ${params.patientName},</p>
            <p>Your patient account with ${params.organizationName} has been successfully deleted.</p>
            <p>All your personal information has been removed from our system.</p>
            <p>If you did not request this deletion, please contact us immediately.</p>
            <p>Thank you for using our services.</p>
            <p>Best regards,<br>${params.organizationName}</p>
          </div>
          <div class="footer">
            <p>This is an automated message from Clinic Management System.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    const textBody = `Account Deletion Confirmation\n\nDear ${params.patientName},\n\nYour patient account with ${params.organizationName} has been successfully deleted.\n\nAll your personal information has been removed from our system.\n\nIf you did not request this deletion, please contact us immediately.\n\nThank you for using our services.\n\nBest regards,\n${params.organizationName}`;

    await this.sendEmail({
      to: params.to,
      subject,
      htmlBody,
      textBody,
    });
  }
}

export const emailService = new EmailService();
