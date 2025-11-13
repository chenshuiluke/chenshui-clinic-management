/// <reference types="cypress" />

describe('Organization Admin Authentication', () => {
  let centralAdminToken: string;
  let orgName: string;
  let orgAdminEmail: string;
  let orgAdminPassword: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `TestOrg${timestamp}`;
    orgAdminEmail = `orgadmin-${timestamp}@test.com`;
    orgAdminPassword = 'AdminPass123!@#';

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
        centralAdminToken = response.body.accessToken;

        // Create organization
        cy.seedOrganization(orgName, centralAdminToken).then((org) => {
          // Create org admin user
          cy.seedOrgAdmin(
            org.id,
            {
              email: orgAdminEmail,
              password: orgAdminPassword,
              firstName: 'Org',
              lastName: 'ADMIN',
            },
            centralAdminToken
          );
        });
      });
    });
  });

  it('should login as organization admin', () => {
    cy.visit(`/${orgName}/login`);

    // Fill login form
    cy.get('input[name="email"]').type(orgAdminEmail);
    cy.get('input[name="password"]').type(orgAdminPassword);

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert redirect to org dashboard
    cy.url().should('include', `/${orgName}/dashboard`);

    // Assert localStorage contains org tokens
    cy.window().then((win) => {
      expect(win.localStorage.getItem('org_access_token')).to.exist;
      expect(win.localStorage.getItem('org_refresh_token')).to.exist;
      expect(win.localStorage.getItem('org_name')).to.eq(orgName);
    });

    // Assert dashboard shows admin-specific content
    cy.contains(/dashboard|manage/i).should('be.visible');
  });

  it('should show error for invalid credentials', () => {
    cy.visit(`/${orgName}/login`);

    // Enter invalid credentials
    cy.get('input[name="email"]').type('invalid@test.com');
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

  it('should not access central admin routes', () => {
    cy.loginAsOrgUser(orgName, orgAdminEmail, orgAdminPassword, 'ADMIN');

    // Attempt to visit central admin dashboard
    cy.visit('/admin/dashboard', { failOnStatusCode: false });

    // Assert redirect or error (org admin should not access central admin routes)
    cy.url().should('not.include', '/admin/dashboard');
  });

  it('should not access other organization\'s data', () => {
    const timestamp = Date.now();
    const org2Name = `TestOrg2${timestamp}`;
    const org2AdminEmail = `org2admin-${timestamp}@test.com`;
    const org2AdminPassword = 'AdminPass123!@#';

    // Create second organization
    cy.seedOrganization(org2Name, centralAdminToken).then((org2) => {
      cy.seedOrgAdmin(
        org2.id,
        {
          email: org2AdminEmail,
          password: org2AdminPassword,
          firstName: 'Org2',
          lastName: 'ADMIN',
        },
        centralAdminToken
      );

      // Login as org1 admin
      cy.loginAsOrgUser(orgName, orgAdminEmail, orgAdminPassword, 'ADMIN');

      // Attempt to visit org2 dashboard
      cy.visit(`/${org2Name}/dashboard`, { failOnStatusCode: false });

      // Assert redirect or error
      cy.url().should('not.include', `/${org2Name}/dashboard`);
    });
  });

});
