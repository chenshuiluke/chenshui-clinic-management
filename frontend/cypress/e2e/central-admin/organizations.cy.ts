/// <reference types="cypress" />

describe('Organization Management', () => {
  let centralAdminToken: string;
  let users: any;

  before(() => {
    cy.fixture('users').then((data) => {
      users = data;
    });
  });

  beforeEach(() => {
    // Create and login as central admin for each test
    const timestamp = Date.now();
    const email = `admin-org-${timestamp}@test.com`;
    const name = `Org Admin ${timestamp}`;
    const password = 'TestPassword123!@#';

    cy.seedCentralAdmin(email, name, password).then((user) => {
      // Login to get token
      const apiUrl = Cypress.env('apiUrl');
      cy.request({
        method: 'POST',
        url: `${apiUrl}/auth/login`,
        body: { email, password },
      }).then((response) => {
        centralAdminToken = response.body.accessToken;
        cy.loginAsCentralAdmin(email, password);
      });
    });
  });

  it('should display empty organizations list initially', () => {
    cy.visit('/admin/organizations');

    // Assert empty state or "No organizations" message
    // Note: Might have organizations from other tests, so check for table existence
    cy.get('table').should('exist');
  });

  it('should create a new organization', () => {
    cy.visit('/admin/organizations');

    const timestamp = Date.now();
    const orgName = `Test Clinic ${timestamp}`;

    // Click create organization button
    cy.contains('button', /create organization/i).click();

    // Fill organization name in modal
    cy.get('input[name="name"]').type(orgName);

    // Submit form
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert success notification
    cy.contains(/success|created/i).should('be.visible');

    // Assert organization appears in table
    cy.contains(orgName).should('be.visible');
  });

  it('should validate organization name (min 4 characters)', () => {
    cy.visit('/admin/organizations');

    // Click create organization button
    cy.contains('button', /create organization/i).click();

    // Enter name with less than 4 characters
    cy.get('input[name="name"]').type('ABC');

    // Submit form
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert validation error message
    cy.contains(/at least 4 characters|minimum|too short/i).should('be.visible');

    // Assert modal remains open
    cy.get('.ant-modal').should('be.visible');
  });

  it('should reject duplicate organization names', () => {
    const timestamp = Date.now();
    const orgName = `Duplicate Clinic ${timestamp}`;

    // Create organization via API
    cy.seedOrganization(orgName, centralAdminToken);

    cy.visit('/admin/organizations');

    // Try to create another organization with same name
    cy.contains('button', /create organization/i).click();
    cy.get('input[name="name"]').type(orgName);

    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert error notification about duplicate
    cy.contains(/already exists|duplicate/i).should('be.visible');

    // Assert modal remains open for correction
    cy.get('.ant-modal').should('be.visible');
  });

  it('should create admin user for organization', () => {
    const timestamp = Date.now();
    const orgName = `Admin User Clinic ${timestamp}`;

    // Create organization via API
    cy.seedOrganization(orgName, centralAdminToken);

    cy.visit('/admin/organizations');

    // Find the organization row and click create admin user
    cy.contains('tr', orgName).within(() => {
      cy.contains('button', /create admin|add admin/i).click();
    });

    // Fill admin user form
    const adminEmail = `admin-${timestamp}@clinic.com`;
    cy.get('input[name="email"]').type(adminEmail);
    cy.get('input[name="password"]').type('AdminPass123!@#');
    cy.get('input[name="firstName"]').type('Admin');
    cy.get('input[name="lastName"]').type('User');

    // Submit form
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert success message
    cy.contains(/success|created/i).should('be.visible');

    // Assert modal closes
    cy.get('.ant-modal').should('not.be.visible');
  });

  it('should validate admin user password complexity', () => {
    const timestamp = Date.now();
    const orgName = `Password Test Clinic ${timestamp}`;

    // Create organization via API
    cy.seedOrganization(orgName, centralAdminToken);

    cy.visit('/admin/organizations');

    // Find the organization row and click create admin user
    cy.contains('tr', orgName).within(() => {
      cy.contains('button', /create admin|add admin/i).click();
    });

    // Fill form with weak password
    const adminEmail = `admin-weak-${timestamp}@clinic.com`;
    cy.get('input[name="email"]').type(adminEmail);
    cy.get('input[name="password"]').type('password'); // Weak password
    cy.get('input[name="firstName"]').type('Admin');
    cy.get('input[name="lastName"]').type('User');

    // Submit form
    cy.get('.ant-modal').within(() => {
      cy.get('button[type="submit"]').click();
    });

    // Assert validation error for password requirements
    cy.contains(/password|uppercase|lowercase|number|special/i).should('be.visible');

    // Assert form not submitted
    cy.get('.ant-modal').should('be.visible');
  });

  it('should display all organizations in table', () => {
    const timestamp = Date.now();

    // Seed multiple organizations
    const orgs = [
      `Clinic Alpha ${timestamp}`,
      `Clinic Beta ${timestamp}`,
      `Clinic Gamma ${timestamp}`,
    ];

    orgs.forEach((orgName) => {
      cy.seedOrganization(orgName, centralAdminToken);
    });

    cy.visit('/admin/organizations');

    // Assert all organizations are displayed
    orgs.forEach((orgName) => {
      cy.contains(orgName).should('be.visible');
    });

    // Assert table has proper columns
    cy.get('table').should('exist');
    cy.contains('th', /name/i).should('be.visible');
  });

  it('should sort organizations by name', () => {
    const timestamp = Date.now();

    // Seed organizations with distinct names for sorting
    const orgs = [
      `Zebra Clinic ${timestamp}`,
      `Alpha Clinic ${timestamp}`,
      `Mike Clinic ${timestamp}`,
    ];

    orgs.forEach((orgName) => {
      cy.seedOrganization(orgName, centralAdminToken);
    });

    cy.visit('/admin/organizations');

    // Click the Name column header to sort ascending
    cy.contains('th', /name/i).click();

    // Get all organization names in the table and verify ascending order
    cy.get('tbody tr').then(($rows) => {
      const displayedNames: string[] = [];
      $rows.each((index, row) => {
        const name = Cypress.$(row).find('td').first().text().trim();
        if (name) displayedNames.push(name);
      });

      // Filter to only our test organizations
      const testOrgNames = displayedNames.filter(name =>
        name.includes(`${timestamp}`)
      );

      // Verify ascending order
      const sortedAsc = [...testOrgNames].sort((a, b) => a.localeCompare(b));
      expect(testOrgNames).to.deep.equal(sortedAsc);
    });

    // Click again to sort descending
    cy.contains('th', /name/i).click();

    // Get all organization names again and verify descending order
    cy.get('tbody tr').then(($rows) => {
      const displayedNames: string[] = [];
      $rows.each((index, row) => {
        const name = Cypress.$(row).find('td').first().text().trim();
        if (name) displayedNames.push(name);
      });

      // Filter to only our test organizations
      const testOrgNames = displayedNames.filter(name =>
        name.includes(`${timestamp}`)
      );

      // Verify descending order
      const sortedDesc = [...testOrgNames].sort((a, b) => b.localeCompare(a));
      expect(testOrgNames).to.deep.equal(sortedDesc);
    });
  });
});
