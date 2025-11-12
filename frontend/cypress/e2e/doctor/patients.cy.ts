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
                  cy.loginAsOrgUser(orgName, doctorEmail, 'password123', 'doctor');
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

  it('should view patient medical information', () => {
    const timestamp = Date.now();

    // Seed a patient with medical information
    const patient = {
      email: `medical-${timestamp}@test.com`,
      password: 'password123',
      firstName: 'Medical',
      lastName: 'Patient',
      dateOfBirth: '1990-01-15',
      phoneNumber: '5551234567',
      allergies: 'Penicillin',
      chronicConditions: 'Diabetes',
      bloodType: 'A+',
    };

    cy.seedPatient(orgName, patient);

    cy.visit(`/${orgName}/patients`);

    // Click 'View' button
    cy.contains('tr', 'Medical Patient').within(() => {
      cy.contains('button', 'View').click();
    });

    // Assert drawer shows allergies and chronic conditions
    cy.get('.ant-drawer').should('be.visible');
    cy.get('.ant-drawer').within(() => {
      cy.contains('Allergies').should('be.visible');
      cy.contains('Penicillin').should('be.visible');
      cy.contains('Chronic Conditions').should('be.visible');
      cy.contains('Diabetes').should('be.visible');
      cy.contains('Blood Type').should('be.visible');
      cy.contains('A+').should('be.visible');
    });

    // Verify doctors can see patient medical info for informed decisions
    cy.get('.ant-drawer').within(() => {
      cy.contains('Medical Information').should('be.visible');
    });
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

  it('should only show patients from doctor\\'s organization', () => {
    const timestamp = Date.now();

    // Seed patient in current organization
    const org1Patient = {
      email: `org1-patient-${timestamp}@test.com`,
      password: 'password123',
      firstName: 'Org1',
      lastName: 'Patient',
      dateOfBirth: '1990-01-01',
      phoneNumber: '5551111111',
    };

    cy.seedPatient(orgName, org1Patient);

    cy.visit(`/${orgName}/patients`);

    // Assert org1 patient shown
    cy.contains('Org1 Patient').should('be.visible');

    // Create second organization with doctor
    const org2Name = `DoctorPatientOrg2${timestamp}`;
    const centralEmail = `central-${timestamp}@test.com`;
    const centralPassword = 'TestPassword123!@#';

    const apiUrl = Cypress.env('apiUrl');

    // Login as central admin
    cy.request({
      method: 'POST',
      url: `${apiUrl}/auth/login`,
      body: { email: centralEmail, password: centralPassword },
    }).then((response) => {
      const centralToken = response.body.accessToken;

      // Create second organization
      cy.seedOrganization(org2Name, centralToken).then((org2) => {
        const org2AdminEmail = `org2admin-${timestamp}@test.com`;
        const org2AdminPassword = 'AdminPass123!@#';

        cy.seedOrgAdmin(
          org2.id,
          {
            email: org2AdminEmail,
            password: org2AdminPassword,
            firstName: 'Org2',
            lastName: 'Admin',
          },
          centralToken
        ).then(() => {
          cy.request({
            method: 'POST',
            url: `${apiUrl}/${org2Name}/auth/login`,
            body: { email: org2AdminEmail, password: org2AdminPassword },
          }).then((org2AdminLoginResponse) => {
            const org2AdminToken = org2AdminLoginResponse.body.accessToken;

            // Create doctor in org2
            const org2DoctorEmail = `doctor-org2-${timestamp}@test.com`;
            cy.seedDoctor(
              org2Name,
              {
                email: org2DoctorEmail,
                password: 'password123',
                firstName: 'Org2',
                lastName: 'Doctor',
                specialization: 'General',
                licenseNumber: `MD${timestamp}2`,
              },
              org2AdminToken
            ).then(() => {
              // Seed patient in org2
              const org2Patient = {
                email: `org2-patient-${timestamp}@test.com`,
                password: 'password123',
                firstName: 'Org2',
                lastName: 'Patient',
                dateOfBirth: '1990-01-01',
                phoneNumber: '5552222222',
              };

              cy.seedPatient(org2Name, org2Patient);

              // Login as org2 doctor
              cy.loginAsOrgUser(org2Name, org2DoctorEmail, 'password123', 'doctor');

              // Visit org2 patients page
              cy.visit(`/${org2Name}/patients`);

              // Assert only org2 patients shown
              cy.contains('Org2 Patient').should('be.visible');
              cy.contains('Org1 Patient').should('not.exist');

              // Verify cross-organization isolation
              cy.visit(`/${orgName}/patients`);
              cy.contains('Org1 Patient').should('be.visible');
              cy.contains('Org2 Patient').should('not.exist');
            });
          });
        });
      });
    });
  });
});
