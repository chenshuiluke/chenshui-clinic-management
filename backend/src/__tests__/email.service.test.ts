import { expect } from "chai";
import { describe, it, beforeEach } from "mocha";
import { emailService } from "../services/email.service";

describe("Email Service", () => {
  beforeEach(() => {
    // Clear sent emails before each test
    emailService.clearSentEmails();
  });

  describe("Mock Mode", () => {
    it("should be in mock mode during tests", () => {
      expect(emailService.isMock()).to.be.true;
    });

    it("should capture emails in sentEmails array", async () => {
      await emailService.sendEmail({
        to: "test@example.com",
        subject: "Test Email",
        htmlBody: "<p>Test HTML body</p>",
        textBody: "Test text body",
      });

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).to.have.lengthOf(1);
      expect(sentEmails[0]!.to).to.equal("test@example.com");
      expect(sentEmails[0]!.subject).to.equal("Test Email");
    });

    it("should return captured emails with getSentEmails", async () => {
      await emailService.sendEmail({
        to: "user1@example.com",
        subject: "Email 1",
        htmlBody: "<p>Email 1</p>",
        textBody: "Email 1",
      });

      await emailService.sendEmail({
        to: "user2@example.com",
        subject: "Email 2",
        htmlBody: "<p>Email 2</p>",
        textBody: "Email 2",
      });

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).to.have.lengthOf(2);
      expect(sentEmails[0]!.to).to.equal("user1@example.com");
      expect(sentEmails[1]!.to).to.equal("user2@example.com");
    });

    it("should reset array with clearSentEmails", async () => {
      await emailService.sendEmail({
        to: "test@example.com",
        subject: "Test",
        htmlBody: "<p>Test</p>",
        textBody: "Test",
      });

      expect(emailService.getSentEmails()).to.have.lengthOf(1);

      emailService.clearSentEmails();
      expect(emailService.getSentEmails()).to.have.lengthOf(0);
    });
  });

  describe("Template Methods", () => {
    describe("sendPatientRegistrationEmail", () => {
      it("should send patient registration email with correct subject and content", async () => {
        await emailService.sendPatientRegistrationEmail({
          to: "patient@example.com",
          patientName: "John Doe",
          organizationName: "Test Clinic",
        });

        const sentEmails = emailService.getSentEmails();
        expect(sentEmails).to.have.lengthOf(1);
        expect(sentEmails[0]!.to).to.equal("patient@example.com");
        expect(sentEmails[0]!.subject).to.include("Welcome");
        expect(sentEmails[0]!.htmlBody).to.include("John Doe");
        expect(sentEmails[0]!.htmlBody).to.include("Test Clinic");
        expect(sentEmails[0]!.textBody).to.include("John Doe");
        expect(sentEmails[0]!.textBody).to.include("Test Clinic");
      });
    });

    describe("sendAppointmentBookedEmail", () => {
      it("should send appointment booked email with correct subject and content", async () => {
        const appointmentDate = new Date("2025-12-01T10:00:00Z");

        await emailService.sendAppointmentBookedEmail({
          doctorEmail: "doctor@example.com",
          doctorName: "Dr. Smith",
          patientName: "Jane Doe",
          appointmentDateTime: appointmentDate,
          notes: "First visit",
        });

        const sentEmails = emailService.getSentEmails();
        expect(sentEmails).to.have.lengthOf(1);
        expect(sentEmails[0]!.to).to.equal("doctor@example.com");
        expect(sentEmails[0]!.subject).to.include("New Appointment");
        expect(sentEmails[0]!.htmlBody).to.include("Dr. Smith");
        expect(sentEmails[0]!.htmlBody).to.include("Jane Doe");
        expect(sentEmails[0]!.htmlBody).to.include("First visit");
        expect(sentEmails[0]!.textBody).to.include("Jane Doe");
      });
    });

    describe("sendAppointmentApprovedEmail", () => {
      it("should send appointment approved email with correct subject and content", async () => {
        const appointmentDate = new Date("2025-12-01T10:00:00Z");

        await emailService.sendAppointmentApprovedEmail({
          patientEmail: "patient@example.com",
          patientName: "Jane Doe",
          doctorName: "Dr. Smith",
          appointmentDateTime: appointmentDate,
        });

        const sentEmails = emailService.getSentEmails();
        expect(sentEmails).to.have.lengthOf(1);
        expect(sentEmails[0]!.to).to.equal("patient@example.com");
        expect(sentEmails[0]!.subject).to.include("Approved");
        expect(sentEmails[0]!.htmlBody).to.include("Jane Doe");
        expect(sentEmails[0]!.htmlBody).to.include("Dr. Smith");
        expect(sentEmails[0]!.textBody).to.include("approved");
      });
    });

    describe("sendAppointmentDeclinedEmail", () => {
      it("should send appointment declined email with correct subject and content", async () => {
        const appointmentDate = new Date("2025-12-01T10:00:00Z");

        await emailService.sendAppointmentDeclinedEmail({
          patientEmail: "patient@example.com",
          patientName: "Jane Doe",
          doctorName: "Dr. Smith",
          appointmentDateTime: appointmentDate,
        });

        const sentEmails = emailService.getSentEmails();
        expect(sentEmails).to.have.lengthOf(1);
        expect(sentEmails[0]!.to).to.equal("patient@example.com");
        expect(sentEmails[0]!.subject).to.include("Declined");
        expect(sentEmails[0]!.htmlBody).to.include("Jane Doe");
        expect(sentEmails[0]!.htmlBody).to.include("Dr. Smith");
        expect(sentEmails[0]!.textBody).to.include("declined");
      });
    });

    describe("sendAppointmentCancelledEmail", () => {
      it("should send appointment cancelled email with correct subject and content", async () => {
        const appointmentDate = new Date("2025-12-01T10:00:00Z");

        await emailService.sendAppointmentCancelledEmail({
          doctorEmail: "doctor@example.com",
          doctorName: "Dr. Smith",
          patientName: "Jane Doe",
          appointmentDateTime: appointmentDate,
        });

        const sentEmails = emailService.getSentEmails();
        expect(sentEmails).to.have.lengthOf(1);
        expect(sentEmails[0]!.to).to.equal("doctor@example.com");
        expect(sentEmails[0]!.subject).to.include("Cancelled");
        expect(sentEmails[0]!.htmlBody).to.include("Dr. Smith");
        expect(sentEmails[0]!.htmlBody).to.include("Jane Doe");
        expect(sentEmails[0]!.textBody).to.include("cancelled");
      });
    });

    describe("sendAppointmentCompletedEmail", () => {
      it("should send appointment completed email with correct subject and content", async () => {
        const appointmentDate = new Date("2025-12-01T10:00:00Z");

        await emailService.sendAppointmentCompletedEmail({
          patientEmail: "patient@example.com",
          patientName: "Jane Doe",
          doctorName: "Dr. Smith",
          appointmentDateTime: appointmentDate,
        });

        const sentEmails = emailService.getSentEmails();
        expect(sentEmails).to.have.lengthOf(1);
        expect(sentEmails[0]!.to).to.equal("patient@example.com");
        expect(sentEmails[0]!.subject).to.include("Completed");
        expect(sentEmails[0]!.htmlBody).to.include("Jane Doe");
        expect(sentEmails[0]!.htmlBody).to.include("Dr. Smith");
        expect(sentEmails[0]!.textBody).to.include("completed");
      });
    });
  });

  describe("Email Formatting", () => {
    it("should provide both HTML and text body formats", async () => {
      await emailService.sendEmail({
        to: "test@example.com",
        subject: "Test",
        htmlBody: "<html><body><p>HTML content</p></body></html>",
        textBody: "Text content",
      });

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails[0]!.htmlBody).to.include("<html>");
      expect(sentEmails[0]!.htmlBody).to.include("<body>");
      expect(sentEmails[0]!.textBody).to.be.a("string");
      expect(sentEmails[0]!.textBody).to.not.include("<html>");
    });

    it("should include basic HTML structure in templates", async () => {
      await emailService.sendPatientRegistrationEmail({
        to: "test@example.com",
        patientName: "Test User",
        organizationName: "Test Org",
      });

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails[0]!.htmlBody).to.include("<html>");
      expect(sentEmails[0]!.htmlBody).to.include("</html>");
      expect(sentEmails[0]!.htmlBody).to.include("<body>");
      expect(sentEmails[0]!.htmlBody).to.include("</body>");
    });

    it("should provide readable text fallback", async () => {
      await emailService.sendPatientRegistrationEmail({
        to: "test@example.com",
        patientName: "Test User",
        organizationName: "Test Org",
      });

      const sentEmails = emailService.getSentEmails();
      const textBody = sentEmails[0]!.textBody;
      expect(textBody).to.be.a("string");
      expect(textBody.length).to.be.greaterThan(0);
      expect(textBody).to.include("Test User");
      expect(textBody).to.include("Test Org");
      // Text body should not contain HTML tags
      expect(textBody).to.not.include("<");
      expect(textBody).to.not.include(">");
    });
  });

  describe("Error Handling", () => {
    it("should handle emails gracefully in mock mode", async () => {
      // Should not throw even with potentially invalid email
      await emailService.sendEmail({
        to: "invalid-email",
        subject: "Test",
        htmlBody: "<p>Test</p>",
        textBody: "Test",
      });

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).to.have.lengthOf(1);
    });

    it("should not throw errors when sending multiple emails", async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          emailService.sendEmail({
            to: `user${i}@example.com`,
            subject: `Test ${i}`,
            htmlBody: `<p>Test ${i}</p>`,
            textBody: `Test ${i}`,
          })
        );
      }

      await Promise.all(promises);

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).to.have.lengthOf(10);
    });
  });
});
