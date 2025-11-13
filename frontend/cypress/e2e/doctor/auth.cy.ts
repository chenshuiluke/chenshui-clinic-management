/// <reference types="cypress" />

describe('Doctor Authentication', () => {
  let orgName: string;
  let orgAdminToken: string;
  let doctorEmail: string;
  let doctorPassword: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `DoctorAuthOrg${timestamp}`;
    doctorEmail = `doctor-auth-${timestamp}@test.com`;
    doctorPassword = 'DoctorPass123!';

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
        const centralAdminToken = response.body.accessToken;

        // Create organization
        cy.seedOrganization(orgName, centralAdminToken).then((org) => {
          // Create org admin user
          cy.seedOrgAdmin(
            org.id,
            {
              email: `orgadmin-${timestamp}@test.com`,
              password: 'AdminPass123!@#',
              firstName: 'Org',
              lastName: 'Admin',
            },
            centralAdminToken
          ).then(() => {
            // Login as org admin to get token
            cy.request({
              method: 'POST',
              url: `${apiUrl}/${orgName}/auth/login`,
              body: {
                email: `orgadmin-${timestamp}@test.com`,
                password: 'AdminPass123!@#'
              },
            }).then((loginResponse) => {
              orgAdminToken = loginResponse.body.accessToken;

              // Create a doctor
              cy.seedDoctor(orgName, {
                email: doctorEmail,
                password: doctorPassword,
                firstName: 'John',
                lastName: 'DOCTOR',
                specialization: 'Cardiology',
                licenseNumber: `MD${timestamp}`,
                phoneNumber: '5551234567',
              }, orgAdminToken);
            });
          });
        });
      });
    });
  });

  it('should login as doctor successfully', () => {
    cy.visit(`/${orgName}/login`);

    // Fill login form
    cy.get('input[name="email"]').type(doctorEmail);
    cy.get('input[name="password"]').type(doctorPassword);

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert redirect to doctor dashboard or appointments page
    cy.url().should('satisfy', (url: string) => {
      return url.includes(`/${orgName}/dashboard`) ||
             url.includes(`/${orgName}/appointments`);
    });

    // Assert localStorage contains org tokens
    cy.window().then((win) => {
      expect(win.localStorage.getItem('org_access_token')).to.exist;
      expect(win.localStorage.getItem('org_refresh_token')).to.exist;
      expect(win.localStorage.getItem('org_name')).to.eq(orgName);
    });

    // Assert doctor-specific content is visible
    cy.contains(/appointments|patients|schedule/i).should('be.visible');
  });

  it('should show error for invalid doctor credentials', () => {
    cy.visit(`/${orgName}/login`);

    // Enter invalid credentials
    cy.get('input[name="email"]').type('wrongdoctor@test.com');
    cy.get('input[name="password"]').type('wrongpassword');

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert error message displayed
    cy.contains(/invalid|incorrect|failed/i).should('be.visible');

    // Assert no redirect
    cy.url().should('include', `/${orgName}/login`);

    // Assert localStorage empty
    cy.window().then((win) => {
      expect(win.localStorage.getItem('org_access_token')).to.be.null;
    });
  });

  it('should validate email format for doctor login', () => {
    cy.visit(`/${orgName}/login`);

    // Try with invalid email format
    cy.get('input[name="email"]').type('not-an-email');
    cy.get('input[name="password"]').type(doctorPassword);

    // Submit form
    cy.get('button[type="submit"]').click();

    // Should show error (email validation or invalid credentials)
    cy.contains(/email|invalid/i).should('be.visible');
  });

});