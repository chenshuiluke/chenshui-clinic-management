/// <reference types="cypress" />

describe('Cross-Organization Isolation and Authentication Guards', () => {
  let org1Name: string;
  let org2Name: string;
  let org1: any;
  let org2: any;
  let centralAdminToken: string;

  beforeEach(() => {
    const timestamp = Date.now();
    org1Name = `IsolationOrg1${timestamp}`;
    org2Name = `IsolationOrg2${timestamp}`;

    // Create central admin and two organizations
    const centralEmail = `central-${timestamp}@test.com`;
    cy.seedCentralAdmin(centralEmail, `Central Admin ${timestamp}`, 'TestPassword123!@#').then(() => {
      const apiUrl = Cypress.env('apiUrl');
      return cy.request('POST', `${apiUrl}/auth/login`, {
        email: centralEmail,
        password: 'TestPassword123!@#',
      });
    }).then((response) => {
      centralAdminToken = response.body.accessToken;
      return cy.seedOrganization(org1Name, centralAdminToken);
    }).then((createdOrg1) => {
      org1 = createdOrg1;
      return cy.seedOrganization(org2Name, centralAdminToken);
    }).then((createdOrg2) => {
      org2 = createdOrg2;
    });
  });

  it('should prevent org users from accessing central admin routes', () => {
    const timestamp = Date.now();

    cy.seedOrganization(`TestOrg${timestamp}`, centralAdminToken).then((org) => {
      const orgAdminEmail = `orgadmin-${timestamp}@test.com`;
      cy.seedOrgAdmin(org.id, {
        email: orgAdminEmail,
        password: 'AdminPass123!@#',
        firstName: 'Org',
        lastName: 'Admin',
      }, centralAdminToken).then(() => {
        cy.loginAsOrgUser(`TestOrg${timestamp}`, orgAdminEmail, 'AdminPass123!@#', 'ADMIN');

        // Attempt to visit central admin dashboard
        cy.visit('/admin/dashboard', { failOnStatusCode: false });

        // Assert redirect or error (org tokens shouldn't work on central admin routes)
        cy.url().should('not.include', '/admin/dashboard');
      });
    });
  });

  it('should prevent central admin from accessing org routes', () => {
    const timestamp = Date.now();
    const centralEmail = `centralonly-${timestamp}@test.com`;

    cy.seedCentralAdmin(centralEmail, `Central Only ${timestamp}`, 'TestPassword123!@#').then(() => {
      cy.loginAsCentralAdmin(centralEmail, 'TestPassword123!@#');

      // Attempt to visit org dashboard
      cy.visit(`/${org1Name}/dashboard`, { failOnStatusCode: false });

      // Assert redirect or error
      cy.url().should('not.include', `/${org1Name}/dashboard`);
    });
  });

  it('should prevent access to other organization\'s data', () => {
    const timestamp = Date.now();

    const org1AdminEmail = `org1admin-${timestamp}@test.com`;
    cy.seedOrgAdmin(org1.id, {
      email: org1AdminEmail,
      password: 'AdminPass123!@#',
      firstName: 'Org1',
      lastName: 'Admin',
    }, centralAdminToken).then(() => {
      // Login as org1 admin
      cy.loginAsOrgUser(org1Name, org1AdminEmail, 'AdminPass123!@#', 'ADMIN');

      // Attempt to visit org2 dashboard
      cy.visit(`/${org2Name}/dashboard`, { failOnStatusCode: false });

      // Assert redirect or error
      cy.url().should('not.include', `/${org2Name}/dashboard`);
    });
  });

  it('should isolate patient data between organizations', () => {
    const timestamp = Date.now();
    const sameEmail = `patient-${timestamp}@test.com`;

    // Seed patient in org1
    cy.seedPatient(org1Name, {
      email: sameEmail,
      password: 'password123',
      firstName: 'Patient',
      lastName: 'Org1',
      dateOfBirth: '1990-01-15',
      phoneNumber: '5551111111',
    });

    // Seed patient with same email in org2
    cy.seedPatient(org2Name, {
      email: sameEmail,
      password: 'password123',
      firstName: 'Patient',
      lastName: 'Org2',
      dateOfBirth: '1995-05-20',
      phoneNumber: '5552222222',
    });

    // Login as patient in org1
    cy.loginAsOrgUser(org1Name, sameEmail, 'password123', 'PATIENT');
    cy.visit(`/${org1Name}/profile`);

    // Assert org1 patient data
    cy.contains('Org1').should('be.visible');
    cy.contains('5551111111').should('be.visible');

    // Logout
    cy.clearLocalStorage();

    // Login as patient in org2
    cy.loginAsOrgUser(org2Name, sameEmail, 'password123', 'PATIENT');
    cy.visit(`/${org2Name}/profile`);

    // Assert org2 patient data (different from org1)
    cy.contains('Org2').should('be.visible');
    cy.contains('5552222222').should('be.visible');
  });

  it('should prevent role escalation within organization', () => {
    const timestamp = Date.now();

    cy.seedOrganization(`RoleOrg${timestamp}`, centralAdminToken).then((org) => {
      const patientEmail = `patient-${timestamp}@test.com`;

      cy.seedPatient(`RoleOrg${timestamp}`, {
        email: patientEmail,
        password: 'password123',
        firstName: 'Patient',
        lastName: 'User',
        dateOfBirth: '1990-01-15',
        phoneNumber: '5551234567',
      }).then(() => {
        cy.loginAsOrgUser(`RoleOrg${timestamp}`, patientEmail, 'password123', 'PATIENT');

        // Attempt to visit admin-only route (doctors management)
        cy.visit(`/RoleOrg${timestamp}/doctors`, { failOnStatusCode: false });

        // Assert blocked (RoleGuard should prevent access)
        cy.contains("You do not have permission to access this page.").should('be.visible');
      });
    });
  });

});
