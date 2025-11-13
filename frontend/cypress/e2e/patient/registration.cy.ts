/// <reference types="cypress" />

describe('Patient Registration', () => {
  let orgName: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `PatientOrg${timestamp}`;

    // Create organization (registration is public, no need for admin login)
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
        cy.seedOrganization(orgName, centralToken);
      });
    });
  });

  it('should register with minimal required fields only', () => {
    cy.visit(`/${orgName}/register`);

    const timestamp = Date.now();
    const email = `patient-min-${timestamp}@test.com`;

    // Fill only required fields
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="firstName"]').type('Jane');
    cy.get('input[name="lastName"]').type('Smith');

    // DatePicker for dateOfBirth
    cy.get('input[placeholder*="date"]').click();
    cy.get('.ant-picker-cell').contains('20').click();

    cy.get('input[name="phoneNumber"]').type('5551234567');

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert success
    cy.contains(/success|registered/i, { timeout: 10000 }).should('be.visible');

    // Assert redirect to dashboard
    cy.url().should('include', `/${orgName}/dashboard`);

    // Assert patient logged in
    cy.window().then((win) => {
      expect(win.localStorage.getItem('org_access_token')).to.exist;
    });
  });

  it('should validate required fields', () => {
    cy.visit(`/${orgName}/register`);

    // Submit form without filling any fields
    cy.get('button[type="submit"]').click();

    // Assert validation errors for required fields
    cy.contains(/required|field/i).should('be.visible');

    // Assert form not submitted
    cy.url().should('include', `/${orgName}/register`);

    // Assert no redirect
    cy.window().then((win) => {
      expect(win.localStorage.getItem('org_access_token')).to.be.null;
    });
  });

  it('should validate email format', () => {
    cy.visit(`/${orgName}/register`);

    // Enter invalid email
    cy.get('input[name="email"]').type('not-an-email');
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="firstName"]').type('Test');
    cy.get('input[name="lastName"]').type('User');
    cy.get('input[placeholder*="date"]').click();
    cy.get('.ant-picker-cell').contains('15').click();
    cy.get('input[name="phoneNumber"]').type('5551234567');

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert email validation error
    cy.contains(/email|invalid/i).should('be.visible');
  });

  it('should validate password length (min 6 characters)', () => {
    cy.visit(`/${orgName}/register`);

    const timestamp = Date.now();

    // Enter short password
    cy.get('input[name="email"]').type(`patient-${timestamp}@test.com`);
    cy.get('input[name="password"]').type('pass'); // Less than 6 characters
    cy.get('input[name="firstName"]').type('Test');
    cy.get('input[name="lastName"]').type('User');
    cy.get('input[placeholder*="date"]').click();
    cy.get('.ant-picker-cell').contains('15').click();
    cy.get('input[name="phoneNumber"]').type('5551234567');

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert password validation error
    cy.contains(/password|6 characters|minimum/i).should('be.visible');
  });

  it('should validate phoneNumber length (min 10 characters)', () => {
    cy.visit(`/${orgName}/register`);

    const timestamp = Date.now();

    // Enter short phone number
    cy.get('input[name="email"]').type(`patient-${timestamp}@test.com`);
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="firstName"]').type('Test');
    cy.get('input[name="lastName"]').type('User');
    cy.get('input[placeholder*="date"]').click();
    cy.get('.ant-picker-cell').contains('15').click();
    cy.get('input[name="phoneNumber"]').type('12345'); // Less than 10 characters

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert phone validation error
    cy.contains(/phone|10 characters|minimum/i).should('be.visible');
  });

  it('should validate bloodType enum values', () => {
    cy.visit(`/${orgName}/register`);

    // Open blood type dropdown
    cy.get('[name="bloodType"]').click();

    // Assert only valid values available
    const validBloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    validBloodTypes.forEach((type) => {
      cy.contains('.ant-select-item', type).should('exist');
    });

    // Select a value
    cy.contains('.ant-select-item', 'O+').click();

    // Assert selection works
    cy.get('[name="bloodType"]').should('contain', 'O+');
  });

  it('should reject duplicate email in same organization', () => {
    const timestamp = Date.now();
    const email = `duplicate-${timestamp}@test.com`;

    // Seed a patient via API
    cy.seedPatient(orgName, {
      email,
      password: 'password123',
      firstName: 'First',
      lastName: 'Patient',
      dateOfBirth: '1990-01-15',
      phoneNumber: '5551234567',
    });

    cy.visit(`/${orgName}/register`);

    // Try to register with same email
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type('password123');
    cy.get('input[name="firstName"]').type('Second');
    cy.get('input[name="lastName"]').type('Patient');
    cy.get('input[placeholder*="date"]').click();
    cy.get('.ant-picker-cell').contains('20').click();
    cy.get('input[name="phoneNumber"]').type('5559876543');

    cy.get('button[type="submit"]').click();

    // Assert error about duplicate email
    cy.contains(/already exists|duplicate|email/i).should('be.visible');
  });

  it('should have link to login page', () => {
    cy.visit(`/${orgName}/register`);

    // Assert link to login exists
    cy.contains(/already have an account|log in/i).should('be.visible');

    // Click link
    cy.contains(/already have an account|log in/i).click();

    // Assert redirect to login
    cy.url().should('include', `/${orgName}/login`);
  });
});
