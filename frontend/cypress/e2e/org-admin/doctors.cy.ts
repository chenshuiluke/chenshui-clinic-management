/// <reference types="cypress" />

describe('Doctor Management', () => {
  let orgName: string;
  let orgAdminToken: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `DoctorOrg${timestamp}`;

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

  it('should display empty doctors list initially', () => {
    cy.visit(`/${orgName}/doctors`);

    // Assert empty state or no doctors message
    cy.contains(/no doctors|empty/i).should('be.visible');
  });

  it('should create a new doctor', () => {
    cy.visit(`/${orgName}/doctors`);

    const timestamp = Date.now();
    const doctorEmail = `doctor-${timestamp}@test.com`;

    // Click create doctor button
    cy.contains('button', /create doctor|add doctor/i).click();

    // Fill form
    cy.get('input[name="email"]').type(doctorEmail);
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="firstName"]').type('John');
    cy.get('input[name="lastName"]').type('Smith');
    cy.get('input[name="specialization"]').type('Cardiology');
    cy.get('input[name="licenseNumber"]').type(`MD${timestamp}`);

    // Submit form
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert success message
    cy.contains(/success|created/i).should('be.visible');

    // Assert doctor appears in table
    cy.contains('John Smith').should('be.visible');
    cy.contains('Cardiology').should('be.visible');
  });

  it('should create doctor without optional phone number', () => {
    cy.visit(`/${orgName}/doctors`);

    const timestamp = Date.now();
    const doctorEmail = `doctor-nophone-${timestamp}@test.com`;

    // Click create doctor button
    cy.contains('button', /create doctor|add doctor/i).click();

    // Fill required fields only
    cy.get('input[name="email"]').type(doctorEmail);
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="firstName"]').type('Jane');
    cy.get('input[name="lastName"]').type('Doe');
    cy.get('input[name="specialization"]').type('Pediatrics');
    cy.get('input[name="licenseNumber"]').type(`MD${timestamp}`);

    // Submit form
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert success
    cy.contains(/success|created/i).should('be.visible');

    // Assert doctor created and displayed
    cy.contains('Jane Doe').should('be.visible');
  });

  it('should validate required fields', () => {
    cy.visit(`/${orgName}/doctors`);

    // Click create doctor button
    cy.contains('button', /create doctor|add doctor/i).click();

    // Submit form without filling fields
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert validation errors
    cy.contains(/required|field/i).should('be.visible');

    // Assert form not submitted
    cy.get('.ant-modal').should('be.visible');
  });

  it('should validate email format', () => {
    cy.visit(`/${orgName}/doctors`);

    // Click create doctor button
    cy.contains('button', /create doctor|add doctor/i).click();

    // Enter invalid email
    cy.get('input[name="email"]').type('not-an-email');
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="firstName"]').type('Test');
    cy.get('input[name="lastName"]').type('Doctor');
    cy.get('input[name="specialization"]').type('Surgery');
    cy.get('input[name="licenseNumber"]').type('MD999999');

    // Submit form
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert email validation error
    cy.contains(/email|invalid/i).should('be.visible');

    // Assert form not submitted
    cy.get('.ant-modal').should('be.visible');
  });

  it('should validate password length (min 6 characters)', () => {
    cy.visit(`/${orgName}/doctors`);

    const timestamp = Date.now();

    // Click create doctor button
    cy.contains('button', /create doctor|add doctor/i).click();

    // Enter short password
    cy.get('input[name="email"]').type(`doctor-${timestamp}@test.com`);
    cy.get('input[name="password"]').type('pass'); // Less than 6 characters
    cy.get('input[name="firstName"]').type('Test');
    cy.get('input[name="lastName"]').type('Doctor');
    cy.get('input[name="specialization"]').type('Surgery');
    cy.get('input[name="licenseNumber"]').type('MD999999');

    // Submit form
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert password validation error
    cy.contains(/password|6 characters|minimum/i).should('be.visible');

    // Assert form not submitted
    cy.get('.ant-modal').should('be.visible');
  });

  it('should reject duplicate email in same organization', () => {
    const timestamp = Date.now();
    const doctorEmail = `duplicate-${timestamp}@test.com`;

    // Create doctor via API
    cy.seedDoctor(
      orgName,
      {
        email: doctorEmail,
        password: 'password123',
        firstName: 'First',
        lastName: 'Doctor',
        specialization: 'Neurology',
        licenseNumber: `MD${timestamp}`,
      },
      orgAdminToken
    );

    cy.visit(`/${orgName}/doctors`);

    // Try to create another doctor with same email
    cy.contains('button', /create doctor|add doctor/i).click();

    cy.get('input[name="email"]').type(doctorEmail);
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="firstName"]').type('Second');
    cy.get('input[name="lastName"]').type('Doctor');
    cy.get('input[name="specialization"]').type('Surgery');
    cy.get('input[name="licenseNumber"]').type(`MD${timestamp + 1}`);

    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert error about duplicate email
    cy.contains(/already exists|duplicate|email/i).should('be.visible');

    // Assert modal remains open
    cy.get('.ant-modal').should('be.visible');
  });

  it('should display all doctors in table', () => {
    const timestamp = Date.now();

    // Seed multiple doctors
    const doctors = [
      {
        email: `cardio-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Alice',
        lastName: 'Cardio',
        specialization: 'Cardiology',
        licenseNumber: `MD${timestamp}1`,
      },
      {
        email: `neuro-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Bob',
        lastName: 'Neuro',
        specialization: 'Neurology',
        licenseNumber: `MD${timestamp}2`,
      },
      {
        email: `peds-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Carol',
        lastName: 'Peds',
        specialization: 'Pediatrics',
        licenseNumber: `MD${timestamp}3`,
      },
    ];

    doctors.forEach((doctor) => {
      cy.seedDoctor(orgName, doctor, orgAdminToken);
    });

    cy.visit(`/${orgName}/doctors`);

    // Assert all doctors displayed
    cy.contains('Alice Cardio').should('be.visible');
    cy.contains('Bob Neuro').should('be.visible');
    cy.contains('Carol Peds').should('be.visible');

    // Assert specializations displayed
    cy.contains('Cardiology').should('be.visible');
    cy.contains('Neurology').should('be.visible');
    cy.contains('Pediatrics').should('be.visible');
  });

  it('should filter doctors by specialization', () => {
    const timestamp = Date.now();

    // Seed doctors with varied specializations
    const doctors = [
      {
        email: `cardio1-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Heart',
        lastName: 'Doc1',
        specialization: 'Cardiology',
        licenseNumber: `MD${timestamp}1`,
      },
      {
        email: `cardio2-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Heart',
        lastName: 'Doc2',
        specialization: 'Cardiology',
        licenseNumber: `MD${timestamp}2`,
      },
      {
        email: `neuro-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Brain',
        lastName: 'Doc',
        specialization: 'Neurology',
        licenseNumber: `MD${timestamp}3`,
      },
      {
        email: `peds-${timestamp}@test.com`,
        password: 'password123',
        firstName: 'Child',
        lastName: 'Doc',
        specialization: 'Pediatrics',
        licenseNumber: `MD${timestamp}4`,
      },
    ];

    doctors.forEach((doctor) => {
      cy.seedDoctor(orgName, doctor, orgAdminToken);
    });

    cy.visit(`/${orgName}/doctors`);

    // Wait for all doctors to load
    cy.contains('Heart Doc1').should('be.visible');
    cy.contains('Brain Doc').should('be.visible');
    cy.contains('Child Doc').should('be.visible');

    // Filter by Cardiology using specialization filter
    cy.get('select[name="specialization"], input[placeholder*="specialization" i]').then($el => {
      if ($el.is('select')) {
        cy.wrap($el).select('Cardiology');
      } else {
        cy.wrap($el).type('Cardiology{enter}');
      }
    });

    // Assert only Cardiology doctors are shown
    cy.contains('Heart Doc1').should('be.visible');
    cy.contains('Heart Doc2').should('be.visible');
    cy.contains('Brain Doc').should('not.exist');
    cy.contains('Child Doc').should('not.exist');

    // Clear filter or select all
    cy.get('button').contains(/clear|all/i).click({ force: true }).catch(() => {
      // If no clear button, try selecting "All" option
      cy.get('select[name="specialization"], input[placeholder*="specialization" i]').then($el => {
        if ($el.is('select')) {
          cy.wrap($el).select('All');
        } else {
          cy.wrap($el).clear();
        }
      });
    });

    // Assert all doctors shown again
    cy.contains('Heart Doc1').should('be.visible');
    cy.contains('Brain Doc').should('be.visible');
    cy.contains('Child Doc').should('be.visible');
  });

  it('should deny access to non-admin users', () => {
    const timestamp = Date.now();

    // Create a doctor user
    const doctorEmail = `doctor-guard-${timestamp}@test.com`;
    cy.seedDoctor(
      orgName,
      {
        email: doctorEmail,
        password: 'password123',
        firstName: 'Guard',
        lastName: 'Test',
        specialization: 'General',
        licenseNumber: `MD${timestamp}`,
      },
      orgAdminToken
    );

    // Login as doctor
    cy.loginAsOrgUser(orgName, doctorEmail, 'password123', 'doctor');

    // Try to access doctors management page
    cy.visit(`/${orgName}/doctors`, { failOnStatusCode: false });

    // Assert access denied (redirect or error message)
    cy.url().should('not.include', '/doctors');
    // Or check for error message
    cy.contains(/unauthorized|access denied|not allowed/i).should('be.visible').catch(() => {
      // If no error message, check we were redirected away
      cy.url().should('not.equal', `${Cypress.config().baseUrl}/${orgName}/doctors`);
    });
  });

  it('should deny access to patients', () => {
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

    // Try to access doctors management page
    cy.visit(`/${orgName}/doctors`, { failOnStatusCode: false });

    // Assert access denied
    cy.url().should('not.include', '/doctors');
    cy.contains(/unauthorized|access denied|not allowed/i).should('be.visible').catch(() => {
      // If no error message, check we were redirected away
      cy.url().should('not.equal', `${Cypress.config().baseUrl}/${orgName}/doctors`);
    });
  });
});
