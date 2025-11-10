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
      });

      await emailService.sendEmail({
        to: "user2@example.com",
        subject: "Email 2",
        htmlBody: "<p>Email 2</p>",
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
        expect(sentEmails[0]!.htmlBody).to.include("approved");
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
        expect(sentEmails[0]!.htmlBody).to.include("declined");
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
        expect(sentEmails[0]!.htmlBody).to.include("cancelled");
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
        expect(sentEmails[0]!.htmlBody).to.include("completed");
      });
    });
  });

  describe("Email Formatting", () => {
    it("should provide HTML body format", async () => {
      await emailService.sendEmail({
        to: "test@example.com",
        subject: "Test",
        htmlBody: "<html><body><p>HTML content</p></body></html>",
      });

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails[0]!.htmlBody).to.include("<html>");
      expect(sentEmails[0]!.htmlBody).to.include("<body>");
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

    it("should include user data in rendered templates", async () => {
      await emailService.sendPatientRegistrationEmail({
        to: "test@example.com",
        patientName: "Test User",
        organizationName: "Test Org",
      });

      const sentEmails = emailService.getSentEmails();
      const htmlBody = sentEmails[0]!.htmlBody;
      expect(htmlBody).to.be.a("string");
      expect(htmlBody.length).to.be.greaterThan(0);
      expect(htmlBody).to.include("Test User");
      expect(htmlBody).to.include("Test Org");
    });
  });

  describe("Error Handling", () => {
    it("should handle emails gracefully in mock mode", async () => {
      // Should not throw even with potentially invalid email
      await emailService.sendEmail({
        to: "invalid-email",
        subject: "Test",
        htmlBody: "<p>Test</p>",
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
          })
        );
      }

      await Promise.all(promises);

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).to.have.lengthOf(10);
    });
  });

  describe("Template System", () => {
    it("should render patient registration template with user data", async () => {
      await emailService.sendPatientRegistrationEmail({
        to: "test@example.com",
        patientName: "John Smith",
        organizationName: "Happy Clinic",
      });

      const sentEmails = emailService.getSentEmails();
      const htmlBody = sentEmails[0]!.htmlBody;

      // Should include template content with substituted values
      expect(htmlBody).to.include("John Smith");
      expect(htmlBody).to.include("Happy Clinic");
      expect(htmlBody).to.include("Book appointments with your healthcare providers");
      expect(htmlBody).to.include("View your appointment history");
      expect(htmlBody).to.include("Manage your profile information");
    });

    it("should render appointment booked template with appointment details", async () => {
      const appointmentDate = new Date("2025-12-01T10:00:00Z");

      await emailService.sendAppointmentBookedEmail({
        doctorEmail: "doctor@example.com",
        doctorName: "Dr. Johnson",
        patientName: "Sarah Connor",
        appointmentDateTime: appointmentDate,
        notes: "First visit - please arrive 15 minutes early",
      });

      const sentEmails = emailService.getSentEmails();
      const htmlBody = sentEmails[0]!.htmlBody;

      expect(htmlBody).to.include("Dr. Johnson");
      expect(htmlBody).to.include("Sarah Connor");
      expect(htmlBody).to.include("First visit - please arrive 15 minutes early");
      expect(htmlBody).to.include("Please review and approve or decline this appointment");
    });

    it("should conditionally include notes in appointment booked email", async () => {
      const appointmentDate = new Date("2025-12-01T10:00:00Z");

      // Test with notes
      await emailService.sendAppointmentBookedEmail({
        doctorEmail: "doctor@example.com",
        doctorName: "Dr. Smith",
        patientName: "Jane Doe",
        appointmentDateTime: appointmentDate,
        notes: "Important notes here",
      });

      let sentEmails = emailService.getSentEmails();
      expect(sentEmails[0]!.htmlBody).to.include("Important notes here");

      emailService.clearSentEmails();

      // Test without notes
      await emailService.sendAppointmentBookedEmail({
        doctorEmail: "doctor@example.com",
        doctorName: "Dr. Smith",
        patientName: "Jane Doe",
        appointmentDateTime: appointmentDate,
        notes: "",
      });

      sentEmails = emailService.getSentEmails();
      // Should not show the notes line when empty
      expect(sentEmails[0]!.htmlBody).to.not.include("Important notes here");
    });

    it("should render appointment approved template correctly", async () => {
      const appointmentDate = new Date("2025-12-01T10:00:00Z");

      await emailService.sendAppointmentApprovedEmail({
        patientEmail: "patient@example.com",
        patientName: "Alice Johnson",
        doctorName: "Dr. Williams",
        appointmentDateTime: appointmentDate,
      });

      const sentEmails = emailService.getSentEmails();
      const htmlBody = sentEmails[0]!.htmlBody;

      expect(htmlBody).to.include("Alice Johnson");
      expect(htmlBody).to.include("Dr. Williams");
      expect(htmlBody).to.include("Great news! Your appointment has been approved");
      expect(htmlBody).to.include("Please make sure to arrive on time");
    });

    it("should render appointment declined template correctly", async () => {
      const appointmentDate = new Date("2025-12-01T10:00:00Z");

      await emailService.sendAppointmentDeclinedEmail({
        patientEmail: "patient@example.com",
        patientName: "Bob Miller",
        doctorName: "Dr. Chen",
        appointmentDateTime: appointmentDate,
      });

      const sentEmails = emailService.getSentEmails();
      const htmlBody = sentEmails[0]!.htmlBody;

      expect(htmlBody).to.include("Bob Miller");
      expect(htmlBody).to.include("Dr. Chen");
      expect(htmlBody).to.include("Unfortunately, your appointment request has been declined");
      expect(htmlBody).to.include("contact us to schedule an alternative appointment");
    });

    it("should render appointment cancelled template correctly", async () => {
      const appointmentDate = new Date("2025-12-01T10:00:00Z");

      await emailService.sendAppointmentCancelledEmail({
        doctorEmail: "doctor@example.com",
        doctorName: "Dr. Martinez",
        patientName: "Charlie Brown",
        appointmentDateTime: appointmentDate,
      });

      const sentEmails = emailService.getSentEmails();
      const htmlBody = sentEmails[0]!.htmlBody;

      expect(htmlBody).to.include("Dr. Martinez");
      expect(htmlBody).to.include("Charlie Brown");
      expect(htmlBody).to.include("An appointment has been cancelled by the patient");
      expect(htmlBody).to.include("This appointment slot is now available");
    });

    it("should render appointment completed template correctly", async () => {
      const appointmentDate = new Date("2025-12-01T10:00:00Z");

      await emailService.sendAppointmentCompletedEmail({
        patientEmail: "patient@example.com",
        patientName: "Diana Prince",
        doctorName: "Dr. Anderson",
        appointmentDateTime: appointmentDate,
      });

      const sentEmails = emailService.getSentEmails();
      const htmlBody = sentEmails[0]!.htmlBody;

      expect(htmlBody).to.include("Diana Prince");
      expect(htmlBody).to.include("Dr. Anderson");
      expect(htmlBody).to.include("Your appointment has been completed");
      expect(htmlBody).to.include("Thank you for visiting us");
    });

    it("should render patient deletion template correctly", async () => {
      await emailService.sendPatientDeletionEmail({
        to: "patient@example.com",
        patientName: "Emma Watson",
        organizationName: "Wellness Center",
      });

      const sentEmails = emailService.getSentEmails();
      const htmlBody = sentEmails[0]!.htmlBody;

      expect(htmlBody).to.include("Emma Watson");
      expect(htmlBody).to.include("Wellness Center");
      expect(htmlBody).to.include("Your patient account with Wellness Center has been successfully deleted");
      expect(htmlBody).to.include("All your personal information has been removed");
    });
  });
});
