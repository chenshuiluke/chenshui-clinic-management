/// <reference types="cypress" />

describe('Patient Profile Management', () => {
  let orgName: string;
  let patientEmail: string;
  let patientPassword: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `ProfileOrg${timestamp}`;
    patientEmail = `patient-${timestamp}@test.com`;
    patientPassword = 'password123';

    // Create organization and patient
    const centralEmail = `central-${timestamp}@test.com`;
    cy.seedCentralAdmin(centralEmail, `Central Admin ${timestamp}`, 'TestPassword123!@#').then(() => {
      const apiUrl = Cypress.env('apiUrl');
      cy.request({
        method: 'POST',
        url: `${apiUrl}/auth/login`,
        body: { email: centralEmail, password: 'TestPassword123!@#' },
      }).then((response) => {
        cy.seedOrganization(orgName, response.body.accessToken).then(() => {
          cy.seedPatient(orgName, {
            email: patientEmail,
            password: patientPassword,
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-01-15',
            phoneNumber: '5551234567',
            address: '123 Main St',
            bloodType: 'A+',
            allergies: 'Penicillin',
            chronicConditions: 'None',
          }).then(() => {
            cy.loginAsOrgUser(orgName, patientEmail, patientPassword, 'patient');
          });
        });
      });
    });
  });

  it('should display patient profile in view mode', () => {
    cy.visit(`/${orgName}/profile`);

    // Assert profile data displayed
    cy.contains('John').should('be.visible');
    cy.contains('Doe').should('be.visible');
    cy.contains('5551234567').should('be.visible');
    cy.contains('123 Main St').should('be.visible');
    cy.contains('A+').should('be.visible');
    cy.contains('Penicillin').should('be.visible');

    // Assert action buttons visible
    cy.contains('button', /edit profile/i).should('be.visible');
    cy.contains('button', /delete account/i).should('be.visible');
  });

  it('should switch to edit mode', () => {
    cy.visit(`/${orgName}/profile`);

    // Click edit profile button
    cy.contains('button', /edit profile/i).click();

    // Assert form appears with pre-filled values
    cy.get('input[name="firstName"]').should('have.value', 'John');
    cy.get('input[name="lastName"]').should('have.value', 'Doe');

    // Assert email field is not present (cannot be changed)
    cy.get('input[name="email"]').should('not.exist');

    // Assert save and cancel buttons appear
    cy.contains('button', /save changes/i).should('be.visible');
    cy.contains('button', /cancel/i).should('be.visible');
  });

  it('should update profile with all fields', () => {
    cy.visit(`/${orgName}/profile`);
    cy.contains('button', /edit profile/i).click();

    // Modify fields
    cy.get('input[name="firstName"]').clear().type('Jane');
    cy.get('input[name="phoneNumber"]').clear().type('5559876543');
    cy.get('textarea[name="allergies"]').clear().type('Peanuts');

    // Click save
    cy.contains('button', /save changes/i).click();

    // Assert success message
    cy.contains(/success|updated/i).should('be.visible');

    // Assert profile refreshed with updated data
    cy.contains('Jane').should('be.visible');
    cy.contains('5559876543').should('be.visible');
    cy.contains('Peanuts').should('be.visible');
  });

  it('should cancel edit without saving', () => {
    cy.visit(`/${orgName}/profile`);
    cy.contains('button', /edit profile/i).click();

    // Modify a field
    cy.get('input[name="firstName"]').clear().type('Modified');

    // Click cancel
    cy.contains('button', /cancel/i).click();

    // Assert changes not saved
    cy.contains('John').should('be.visible');
    cy.contains('Modified').should('not.exist');
  });

  it('should delete account with confirmation', () => {
    cy.visit(`/${orgName}/profile`);

    // Click delete account button
    cy.contains('button', /delete account/i).click();

    // Assert confirmation modal appears
    cy.get('.ant-modal').should('be.visible');
    cy.contains(/permanent|cannot be undone/i).should('be.visible');

    // Check confirmation checkbox
    cy.get('input[type="checkbox"]').check();

    // Click delete in modal
    cy.get('.ant-modal').within(() => {
      cy.contains('button', /delete/i).click();
    });

    // Assert success message
    cy.contains(/success|deleted/i).should('be.visible');

    // Assert redirect to login
    cy.url().should('include', `/${orgName}/login`);

    // Assert localStorage cleared
    cy.window().then((win) => {
      expect(win.localStorage.getItem('org_access_token')).to.be.null;
    });
  });

  it('should cancel account deletion', () => {
    cy.visit(`/${orgName}/profile`);

    // Click delete account
    cy.contains('button', /delete account/i).click();

    // Modal appears
    cy.get('.ant-modal').should('be.visible');

    // Click cancel
    cy.get('.ant-modal').within(() => {
      cy.contains('button', /cancel/i).click();
    });

    // Assert modal closes
    cy.get('.ant-modal').should('not.exist');

    // Assert still on profile page
    cy.url().should('include', `/${orgName}/profile`);
  });
});
