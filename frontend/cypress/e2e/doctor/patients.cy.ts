/// <reference types="cypress" />

describe('Patient Viewing (Doctor)', () => {
  let orgName: string;
  let doctorToken: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `DoctorPatientOrg${timestamp}`;

    // Create central admin
    const centralEmail = `central-${timestamp}@test.com`;
    const centralPassword = 'TestPassword123!@#';

    cy.seedCentralAdmin(centralEmail, `Central Admin ${timestamp}`, centralPassword).then(() => {
      const apiUrl = Cypress.env('apiUrl');
      cy.request({
        method: 'POST',
        url: `${apiUrl}/auth/login`,
        body: { email: centralEmail, password: centralPassword },
      }).then((response) => {
        const centralToken = response.body.accessToken;

        // Create organization and org admin
        cy.seedOrganization(orgName, centralToken).then((org) => {
          const orgAdminEmail = `orgadmin-${timestamp}@test.com`;
          const orgAdminPassword = 'AdminPass123!@#';

          cy.seedOrgAdmin(
            org.id,
            {
              email: orgAdminEmail,
              password: orgAdminPassword,
              firstName: 'Org',
              lastName: 'Admin',
            },
            centralToken
          ).then(() => {
            // Login as org admin to get admin token
            cy.request({
              method: 'POST',
              url: `${apiUrl}/${orgName}/auth/login`,
              body: { email: orgAdminEmail, password: orgAdminPassword },
            }).then((adminLoginResponse) => {
              const adminToken = adminLoginResponse.body.accessToken;

              // Create a doctor user
              const doctorEmail = `doctor-${timestamp}@test.com`;
              cy.seedDoctor(
                orgName,
                {
                  email: doctorEmail,
                  password: 'password123',
                  firstName: 'Doctor',
                  lastName: 'User',
                  specialization: 'General',
                  licenseNumber: `MD${timestamp}`,
                },
                adminToken
              ).then(() => {
                // Login as doctor
                cy.request({
                  method: 'POST',
                  url: `${apiUrl}/${orgName}/auth/login`,
                  body: { email: doctorEmail, password: 'password123' },
                }).then((doctorLoginResponse) => {
                  doctorToken = doctorLoginResponse.body.accessToken;
                  cy.loginAsOrgUser(orgName, doctorEmail, 'password123', 'DOCTOR');
                });
              });
            });
          });
        });
      });
    });
  });

  it('should display all patients for doctor', () => {
    const timestamp = Date.now();

    // Seed 3 patients
    const patients = [
      {
        email: `patient1-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        phoneNumber: '5551111111',
      },
      {
        email: `patient2-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1985-05-20',
        phoneNumber: '5552222222',
      },
      {
        email: `patient3-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Bob',
        lastName: 'Johnson',
        dateOfBirth: '1992-03-10',
        phoneNumber: '5553333333',
      },
    ];

    patients.forEach((patient) => {
      cy.seedPatient(orgName, patient);
    });

    cy.visit(`/${orgName}/patients`);

    // Assert table displays all patients
    cy.contains('John Doe').should('be.visible');
    cy.contains('Jane Smith').should('be.visible');
    cy.contains('Bob Johnson').should('be.visible');

    // Assert doctor can view patient information
    cy.contains(`patient1-${timestamp}@test.com`).should('be.visible');
  });

  it('should not allow doctors to create or modify patients', () => {
    cy.visit(`/${orgName}/patients`);

    // Assert no 'Create Patient' button exists
    cy.contains('button', /create patient|add patient/i).should('not.exist');

    // Seed a patient
    const timestamp = Date.now();
    const patient = {
      email: `readonly-${timestamp}@test.com`,
      password: 'password123',
      firstName: 'ReadOnly',
      lastName: 'Patient',
      dateOfBirth: '1990-01-01',
      phoneNumber: '5551234567',
    };

    cy.seedPatient(orgName, patient);

    cy.visit(`/${orgName}/patients`);

    // Assert table has no edit/delete actions
    cy.contains('tr', 'ReadOnly Patient').within(() => {
      cy.contains('button', /edit|delete/i).should('not.exist');
    });

    // Verify doctors have read-only access
    cy.contains('tr', 'ReadOnly Patient').within(() => {
      cy.contains('button', 'View').should('be.visible');
    });
  });

});
