/// <reference types="cypress" />

describe('Central Admin Authentication', () => {
  let users: any;

  before(() => {
    cy.fixture('users').then((data) => {
      users = data;
    });
  });

  it('should login with valid credentials', { tags: '@focus' }, () => {
    // Create a unique central admin user for this test
    const timestamp = Date.now();
    const email = `admin-${timestamp}@test.com`;
    const name = `Test Admin ${timestamp}`;
    const password = 'TestPassword123!@#';

    // Seed the central admin user
    cy.seedCentralAdmin(email, name, password);

    // Visit login page
    cy.visit('/admin/login');

    // Fill in the login form
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);

    // Submit the form
    cy.get('button[type="submit"]').click();

    // Assert redirect to dashboard
    cy.url().should('include', '/admin/dashboard');

    // Assert localStorage contains tokens
    cy.window().then((win) => {
      expect(win.localStorage.getItem('central_access_token')).to.exist;
      expect(win.localStorage.getItem('central_refresh_token')).to.exist;
    });

    // Assert dashboard shows user name
    cy.contains(name).should('be.visible');
  });

  it('should show error for invalid credentials', () => {
    cy.visit('/admin/login');

    // Enter invalid credentials
    cy.get('input[name="email"]').type('invalid@test.com');
    cy.get('input[name="password"]').type('wrongpassword');

    // Submit the form
    cy.get('button[type="submit"]').click();

    // Assert error message is displayed
    cy.contains(/invalid|incorrect|failed/i).should('be.visible');

    // Assert no redirect occurs
    cy.url().should('include', '/admin/login');

    // Assert localStorage does not contain tokens
    cy.window().then((win) => {
      expect(win.localStorage.getItem('central_access_token')).to.be.null;
      expect(win.localStorage.getItem('central_refresh_token')).to.be.null;
    });
  });

  it('should logout successfully', () => {
    // Create and login as central admin
    const timestamp = Date.now();
    const email = `admin-logout-${timestamp}@test.com`;
    const name = `Logout Admin ${timestamp}`;
    const password = 'TestPassword123!@#';

    cy.seedCentralAdmin(email, name, password);
    cy.visit('/admin/login');
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);
    cy.get('button[type="submit"]').click();

    // Wait for dashboard to load
    cy.url().should('include', '/admin/dashboard');

    // Click logout button (could be in header or dropdown)
    cy.contains('Logout').click(); // Clicks logout dropdown
    cy.contains(/^Logout$/).click(); // Clicks exact logout button

    // Assert redirect to login
    cy.url().should('include', '/admin/login');

    // Assert localStorage tokens are cleared
    cy.window().then((win) => {
      expect(win.localStorage.getItem('central_access_token')).to.be.null;
      expect(win.localStorage.getItem('central_refresh_token')).to.be.null;
    });
  });

  it('should persist authentication across page reloads', () => {
    // Create and login as central admin
    const timestamp = Date.now();
    const email = `admin-persist-${timestamp}@test.com`;
    const name = `Persist Admin ${timestamp}`;
    const password = 'TestPassword123!@#';

    cy.seedCentralAdmin(email, name, password);
    cy.visit('/admin/login');
    cy.get('input[name="email"]').type(email);
    cy.get('input[name="password"]').type(password);
    cy.get('button[type="submit"]').click();

    // Wait for dashboard to load
    cy.url().should('include', '/admin/dashboard');

    // Reload the page
    cy.reload();

    // Assert still on dashboard (not redirected to login)
    cy.url().should('include', '/admin/dashboard');

    // Assert user info still displayed
    cy.contains(name).should('be.visible');
  });

  it('should redirect to login when accessing protected route without auth', () => {
    // Clear localStorage to ensure no auth
    cy.clearLocalStorage();

    // Try to access dashboard directly
    cy.visit('/admin/dashboard');

    // Assert redirect to login
    cy.url().should('include', '/admin/login');
  });
});
