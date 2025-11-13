/// <reference types="cypress" />

describe('Patient Authentication', () => {
  let orgName: string;
  let patientEmail: string;
  let patientPassword: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `PatientAuthOrg${timestamp}`;
    patientEmail = `patient-auth-${timestamp}@test.com`;
    patientPassword = 'TestPassword123!';

    // Create organization and patient
    const centralEmail = `central-${timestamp}@test.com`;
    cy.seedCentralAdmin(centralEmail, `Central Admin ${timestamp}`, 'TestPassword123!@#').then(() => {
      const apiUrl = Cypress.env('apiUrl');
      cy.request('POST', `${apiUrl}/auth/login`, {
        email: centralEmail,
        password: 'TestPassword123!@#',
      }).then((centralResponse) => {
        cy.seedOrganization(orgName, centralResponse.body.accessToken).then(() => {
          // Register a patient for login tests
          cy.seedPatient(orgName, {
            email: patientEmail,
            password: patientPassword,
            firstName: 'Test',
            lastName: 'Patient',
            dateOfBirth: '1990-01-01',
            phoneNumber: '5551234567',
          });
        });
      });
    });
  });

  it('should show error with invalid email', () => {
    cy.visit(`/${orgName}/login`);

    // Fill login form with wrong email
    cy.get('input[name="email"], input[type="email"]').type('wrong@email.com');
    cy.get('input[name="password"], input[type="password"]').type(patientPassword);

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert error message
    cy.contains(/invalid|incorrect|wrong|not found/i).should('be.visible');

    // Assert still on login page
    cy.url().should('include', '/login');
  });

  it('should show error with invalid password', () => {
    cy.visit(`/${orgName}/login`);

    // Fill login form with wrong password
    cy.get('input[name="email"], input[type="email"]').type(patientEmail);
    cy.get('input[name="password"], input[type="password"]').type('WrongPassword123');

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert error message
    cy.contains(/invalid|incorrect|wrong|unauthorized/i).should('be.visible');

    // Assert still on login page
    cy.url().should('include', '/login');
  });

  it('should validate required fields', () => {
    cy.visit(`/${orgName}/login`);

    // Submit form without filling fields
    cy.get('button[type="submit"]').click();

    // Assert validation errors
    cy.contains(/required|email|password/i).should('be.visible');

    // Assert still on login page
    cy.url().should('include', '/login');
  });

  it('should successfully logout', () => {
    // First login
    cy.loginAsOrgUser(orgName, patientEmail, patientPassword, 'PATIENT');
    cy.visit(`/${orgName}/appointments`);

    // Find and click logout button
    cy.get('button').contains(/logout|sign out/i).click();

    // Assert redirected to login page
    cy.url().should('include', '/login');

    // Assert tokens are cleared
    cy.window().then((win) => {
      const accessToken = win.localStorage.getItem('org_access_token');
      const refreshToken = win.localStorage.getItem('org_refresh_token');

      expect(accessToken).to.be.null;
      expect(refreshToken).to.be.null;
    });
  });

  it('should redirect to login when accessing protected routes without auth', () => {
    // Clear any existing tokens
    cy.clearLocalStorage();

    // Try to access appointments page without login
    cy.visit(`/${orgName}/appointments`);

    // Assert redirected to login
    cy.url().should('include', '/login');

    // May show a message about needing to login
    cy.contains(/login|authenticate|sign in/i).should('be.visible');
  });

  it('should persist login across page refreshes', () => {
    // Login first
    cy.loginAsOrgUser(orgName, patientEmail, patientPassword, 'PATIENT');
    cy.visit(`/${orgName}/appointments`);

    // Assert on appointments page
    cy.url().should('include', '/appointments');

    // Refresh the page
    cy.reload();

    // Assert still on appointments page (not redirected to login)
    cy.url().should('include', '/appointments');
    cy.url().should('not.include', '/login');
  });

  it('should handle session expiry gracefully', () => {
    // Login first
    cy.loginAsOrgUser(orgName, patientEmail, patientPassword, 'PATIENT');
    cy.visit(`/${orgName}/appointments`);

    // Clear the access token to simulate expiry
    cy.window().then((win) => {
      win.localStorage.removeItem('org_access_token');
    });

    // Try to perform an action that requires auth
    cy.reload();

    // Should redirect to login or show auth error
    cy.url().should('include', '/login').catch(() => {
      cy.contains(/session|expired|login again/i).should('be.visible');
    });
  });
});