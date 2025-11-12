/// <reference types="cypress" />

describe('Patient Viewing (Admin)', () => {
  let orgName: string;
  let orgAdminToken: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `PatientOrg${timestamp}`;

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
            // Login as org admin to get token
            cy.request({
              method: 'POST',
              url: `${apiUrl}/${orgName}/auth/login`,
              body: { email: orgAdminEmail, password: orgAdminPassword },
            }).then((loginResponse) => {
              orgAdminToken = loginResponse.body.accessToken;
              cy.loginAsOrgUser(orgName, orgAdminEmail, orgAdminPassword, 'admin');
            });
          });
        });
      });
    });
  });

  it('should display empty patients list initially', () => {
    cy.visit(`/${orgName}/patients`);

    // Assert empty state message
    cy.contains(/no patients|empty/i).should('be.visible');
  });

  it('should display all patients in table', () => {
    const timestamp = Date.now();

    // Seed 3 patients with different data
    const patients = [
      {
        email: `patient1-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        phoneNumber: '5551111111',
        bloodType: 'A+',
        allergies: 'Peanuts',
      },
      {
        email: `patient2-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Smith',
        dateOfBirth: '1985-05-20',
        phoneNumber: '5552222222',
        address: '456 Oak Ave',
      },
      {
        email: `patient3-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Bob',
        lastName: 'Johnson',
        dateOfBirth: '1992-03-10',
        phoneNumber: '5553333333',
        bloodType: 'O+',
        chronicConditions: 'Diabetes',
      },
    ];

    patients.forEach((patient) => {
      cy.seedPatient(orgName, patient);
    });

    cy.visit(`/${orgName}/patients`);

    // Assert all patients displayed in table
    cy.contains('John Doe').should('be.visible');
    cy.contains('Jane Smith').should('be.visible');
    cy.contains('Bob Johnson').should('be.visible');

    // Assert emails displayed
    cy.contains(`patient1-${timestamp}@test.com`).should('be.visible');
    cy.contains(`patient2-${timestamp}@test.com`).should('be.visible');
    cy.contains(`patient3-${timestamp}@test.com`).should('be.visible');

    // Assert phone numbers displayed
    cy.contains('5551111111').should('be.visible');
    cy.contains('5552222222').should('be.visible');
    cy.contains('5553333333').should('be.visible');

    // Assert date of birth displayed
    cy.contains('1990-01-15').should('be.visible');
    cy.contains('1985-05-20').should('be.visible');
    cy.contains('1992-03-10').should('be.visible');

    // Assert blood types displayed
    cy.contains('A+').should('be.visible');
    cy.contains('O+').should('be.visible');
  });

  it('should view patient details in drawer', () => {
    const timestamp = Date.now();

    // Seed a patient with all fields
    const patient = {
      email: `complete-${timestamp}@test.com`,
      password: 'password123',
      firstName: 'Complete',
      lastName: 'Patient',
      dateOfBirth: '1990-01-15',
      phoneNumber: '5551234567',
      address: '123 Main St, City, State 12345',
      emergencyContactName: 'Emergency Contact',
      emergencyContactPhone: '5559876543',
      bloodType: 'AB+',
      allergies: 'Penicillin, Latex',
      chronicConditions: 'Hypertension, Diabetes',
    };

    cy.seedPatient(orgName, patient);

    cy.visit(`/${orgName}/patients`);

    // Click 'View' button on patient row
    cy.contains('tr', 'Complete Patient').within(() => {
      cy.contains('button', 'View').click();
    });

    // Assert Drawer opens with title 'Patient Details'
    cy.get('.ant-drawer').should('be.visible');
    cy.get('.ant-drawer-title').should('contain', 'Patient Details');

    // Assert drawer shows comprehensive info
    cy.get('.ant-drawer').within(() => {
      cy.contains('Patient ID').should('be.visible');
      cy.contains('Full Name').should('be.visible');
      cy.contains('Complete Patient').should('be.visible');
      cy.contains('Email').should('be.visible');
      cy.contains(`complete-${timestamp}@test.com`).should('be.visible');
      cy.contains('Phone Number').should('be.visible');
      cy.contains('5551234567').should('be.visible');
      cy.contains('Date of Birth').should('be.visible');
      cy.contains('1990-01-15').should('be.visible');
      cy.contains('Address').should('be.visible');
      cy.contains('123 Main St, City, State 12345').should('be.visible');
      cy.contains('Emergency Contact Name').should('be.visible');
      cy.contains('Emergency Contact').should('be.visible');
      cy.contains('Emergency Contact Phone').should('be.visible');
      cy.contains('5559876543').should('be.visible');
      cy.contains('Medical Information').should('be.visible');
      cy.contains('Blood Type').should('be.visible');
      cy.contains('AB+').should('be.visible');
      cy.contains('Allergies').should('be.visible');
      cy.contains('Penicillin, Latex').should('be.visible');
      cy.contains('Chronic Conditions').should('be.visible');
      cy.contains('Hypertension, Diabetes').should('be.visible');
    });

    // Close drawer
    cy.get('.ant-drawer-close').click();

    // Assert drawer closes
    cy.get('.ant-drawer').should('not.be.visible');
  });

  it('should refresh patients list', () => {
    cy.visit(`/${orgName}/patients`);

    // Click refresh button
    cy.contains('button', 'Refresh').click();

    // Assert table reloads (check for loading state or success)
    cy.get('.ant-table').should('be.visible');
  });

  it('should sort patients by name', () => {
    const timestamp = Date.now();

    // Seed patients with different names
    const patients = [
      {
        email: `z-patient-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Zoe',
        lastName: 'Last',
        dateOfBirth: '1990-01-01',
        phoneNumber: '5551111111',
      },
      {
        email: `a-patient-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Alice',
        lastName: 'First',
        dateOfBirth: '1990-01-01',
        phoneNumber: '5552222222',
      },
      {
        email: `m-patient-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Mike',
        lastName: 'Middle',
        dateOfBirth: '1990-01-01',
        phoneNumber: '5553333333',
      },
    ];

    patients.forEach((patient) => {
      cy.seedPatient(orgName, patient);
    });

    cy.visit(`/${orgName}/patients`);

    // Click name column header to sort
    cy.get('.ant-table-thead').contains('Name').click();

    // Assert patients are sorted alphabetically
    cy.get('.ant-table-tbody tr').first().should('contain', 'Alice First');

    // Click again to reverse sort
    cy.get('.ant-table-thead').contains('Name').click();

    // Assert reverse sort
    cy.get('.ant-table-tbody tr').first().should('contain', 'Zoe Last');
  });

  it('should display blood type with colored tag', () => {
    const timestamp = Date.now();

    // Seed patients with different blood types
    const patients = [
      {
        email: `aplus-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Patient',
        lastName: 'APlus',
        dateOfBirth: '1990-01-01',
        phoneNumber: '5551111111',
        bloodType: 'A+',
      },
      {
        email: `bminus-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Patient',
        lastName: 'BMinus',
        dateOfBirth: '1990-01-01',
        phoneNumber: '5552222222',
        bloodType: 'B-',
      },
      {
        email: `nobt-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Patient',
        lastName: 'NoBloodType',
        dateOfBirth: '1990-01-01',
        phoneNumber: '5553333333',
      },
    ];

    patients.forEach((patient) => {
      cy.seedPatient(orgName, patient);
    });

    cy.visit(`/${orgName}/patients`);

    // Assert blood type column shows colored tags
    cy.contains('tr', 'Patient APlus').within(() => {
      cy.get('.ant-tag').should('contain', 'A+');
    });

    cy.contains('tr', 'Patient BMinus').within(() => {
      cy.get('.ant-tag').should('contain', 'B-');
    });

    // Assert patients without blood type show 'N/A'
    cy.contains('tr', 'Patient NoBloodType').within(() => {
      cy.contains('N/A').should('be.visible');
    });
  });

  it('should isolate patients between organizations', () => {
    const timestamp = Date.now();

    // Seed patient in first organization
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

    // Create second organization
    const org2Name = `PatientOrg2${timestamp}`;
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
          // Seed patient in second organization
          const org2Patient = {
            email: `org2-patient-${timestamp}@test.com`,
            password: 'password123',
            firstName: 'Org2',
            lastName: 'Patient',
            dateOfBirth: '1990-01-01',
            phoneNumber: '5552222222',
          };

          cy.seedPatient(org2Name, org2Patient);

          // Login as org2 admin
          cy.loginAsOrgUser(org2Name, org2AdminEmail, org2AdminPassword, 'admin');

          // Visit org2 patients page
          cy.visit(`/${org2Name}/patients`);

          // Assert only org2 patient shown
          cy.contains('Org2 Patient').should('be.visible');
          cy.contains('Org1 Patient').should('not.exist');

          // Go back to org1 and verify isolation
          cy.visit(`/${orgName}/patients`);
          cy.contains('Org1 Patient').should('be.visible');
          cy.contains('Org2 Patient').should('not.exist');
        });
      });
    });
  });

  it('should allow doctors to view patients', () => {
    const timestamp = Date.now();

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
      orgAdminToken
    );

    // Seed a patient
    const patient = {
      email: `patient-${timestamp}@test.com`,
      password: 'password123',
      firstName: 'Test',
      lastName: 'Patient',
      dateOfBirth: '1990-01-01',
      phoneNumber: '5551234567',
    };

    cy.seedPatient(orgName, patient);

    // Login as doctor
    cy.loginAsOrgUser(orgName, doctorEmail, 'password123', 'doctor');

    // Visit patients page
    cy.visit(`/${orgName}/patients`);

    // Assert page loads successfully
    cy.url().should('include', '/patients');

    // Assert patients are displayed
    cy.contains('Test Patient').should('be.visible');
  });

  it('should not allow patients to view patient list', () => {
    const timestamp = Date.now();

    // Create a patient user
    const patientEmail = `patient-guard-${timestamp}@test.com`;
    cy.seedPatient(orgName, {
      email: patientEmail,
      password: 'password123',
      firstName: 'Patient',
      lastName: 'Test',
      dateOfBirth: '1990-01-01',
      phoneNumber: '5551234567',
    });

    // Login as patient
    cy.loginAsOrgUser(orgName, patientEmail, 'password123', 'patient');

    // Try to access patients page
    cy.visit(`/${orgName}/patients`, { failOnStatusCode: false });

    // Assert RoleGuard blocks access
    cy.url().should('not.include', '/patients');
    cy.contains(/unauthorized|access denied|not allowed|permission/i).should('be.visible').catch(() => {
      // If no error message, check we were redirected away
      cy.url().should('not.equal', `${Cypress.config().baseUrl}/${orgName}/patients`);
    });
  });
});
