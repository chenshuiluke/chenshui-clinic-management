/// <reference types="cypress" />

// ***********************************************
// Custom Cypress commands for reusable test operations
// ***********************************************

import { TOKEN_STORAGE_KEYS } from './constants';

/**
 * Login as central admin user programmatically via API
 */
Cypress.Commands.add('loginAsCentralAdmin', (email: string, password: string) => {
  cy.log(`Logging in as central admin: ${email}`);

  const apiUrl = Cypress.env('apiUrl');

  // Visit root to establish origin first
  cy.visit('/');

  cy.request({
    method: 'POST',
    url: `${apiUrl}/auth/login`,
    body: { email, password },
    failOnStatusCode: false,
  }).then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body).to.have.property('accessToken');
    expect(response.body).to.have.property('refreshToken');

    // Store tokens in localStorage via window
    cy.window().then((win) => {
      win.localStorage.setItem(TOKEN_STORAGE_KEYS.CENTRAL_ACCESS_TOKEN, response.body.accessToken);
      win.localStorage.setItem(TOKEN_STORAGE_KEYS.CENTRAL_REFRESH_TOKEN, response.body.refreshToken);
    });

    cy.log('Central admin login successful');
  });
});

/**
 * Login as organization user (admin/doctor/patient) programmatically via API
 */
Cypress.Commands.add('loginAsOrgUser', (orgName: string, email: string, password: string, role: 'ADMIN' | 'DOCTOR' | 'PATIENT') => {
  cy.log(`Logging in as ${role} in ${orgName}: ${email}`);

  const apiUrl = Cypress.env('apiUrl');

  // Visit root to establish origin first
  cy.visit('/');

  cy.request({
    method: 'POST',
    url: `${apiUrl}/${orgName}/auth/login`,
    body: { email, password },
    failOnStatusCode: false,
  }).then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body).to.have.property('accessToken');
    expect(response.body).to.have.property('refreshToken');
    expect(response.body).to.have.property('user');
    expect(response.body.user.role).to.eq(role);

    // Store tokens in localStorage via window
    cy.window().then((win) => {
      win.localStorage.setItem(TOKEN_STORAGE_KEYS.ORG_ACCESS_TOKEN, response.body.accessToken);
      win.localStorage.setItem(TOKEN_STORAGE_KEYS.ORG_REFRESH_TOKEN, response.body.refreshToken);
      win.localStorage.setItem(TOKEN_STORAGE_KEYS.ORG_NAME, orgName);
    });

    cy.log(`${role} login successful`);
  });
});

/**
 * Create a central admin user via API
 */
Cypress.Commands.add('seedCentralAdmin', (email: string, name: string, password: string) => {
  const apiUrl = Cypress.env('apiUrl');
  const requestBody = { email, name, password };

  console.log('=== API REQUEST ===');
  console.log('Method: POST');
  console.log(`URL: ${apiUrl}/auth/register`);
  console.log('Body:', JSON.stringify(requestBody, null, 2));
  console.log('===================');

  return cy.request({
    method: 'POST',
    url: `${apiUrl}/auth/register`,
    body: requestBody,
    failOnStatusCode: false,
  }).then((response) => {
    const statusEmoji = response.status >= 200 && response.status < 300 ? '✓' :
                       response.status >= 400 && response.status < 500 ? '⚠' : '✗';
    console.log('=== API RESPONSE ===');
    console.log(`${statusEmoji} Status:`, response.status, response.statusText);
    console.log(`URL: ${apiUrl}/auth/register`);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    console.log('====================');

    // Handle known cases
    if ((response.status === 400 || response.status === 409) && response.body.error?.includes('already')) {
      Cypress.log({ message: `Central admin with this email or name already exists, skipping creation` });
      return null;
    }

    // Success case
    if (response.status === 201) {
      expect(response.body).to.have.property('user');
      Cypress.log({ message: `Central admin created: ${email}` });
      // Add delay to allow backend to fully process
      return cy.wait(1000).then(() => response.body.user);
    }

    // Log error and fail
    Cypress.log({ message: `Failed to create central admin. Status: ${response.status}, Body: ${JSON.stringify(response.body)}` });
    throw new Error(`Unexpected response status ${response.status}: ${JSON.stringify(response.body)}`);
  });
});

/**
 * Create an organization via API
 */
Cypress.Commands.add('seedOrganization', (name: string, adminToken: string) => {
  const apiUrl = Cypress.env('apiUrl');
  const requestBody = { name };

  console.log('=== API REQUEST ===');
  console.log('Method: POST');
  console.log(`URL: ${apiUrl}/organizations`);
  console.log('Body:', JSON.stringify(requestBody, null, 2));
  console.log('===================');

  return cy.request({
    method: 'POST',
    url: `${apiUrl}/organizations`,
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    body: requestBody,
    failOnStatusCode: false,
  }).then((response) => {
    const statusEmoji = response.status >= 200 && response.status < 300 ? '✓' :
                       response.status >= 400 && response.status < 500 ? '⚠' : '✗';
    console.log('=== API RESPONSE ===');
    console.log(`${statusEmoji} Status:`, response.status, response.statusText);
    console.log(`URL: ${apiUrl}/organizations`);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    console.log('====================');

    if (response.status === 409) {
      Cypress.log({ message: `Organization ${name} already exists, skipping creation` });
      return null;
    }

    if (response.status === 201) {
      expect(response.body).to.have.property('id');
      expect(response.body).to.have.property('name');
      Cypress.log({ message: `Organization created: ${name} (ID: ${response.body.id})` });
      // Add delay to allow backend to fully process
      return cy.wait(500).then(() => response.body);
    }

    Cypress.log({ message: `Failed to create organization. Status: ${response.status}, Body: ${JSON.stringify(response.body)}` });
    throw new Error(`Unexpected response status ${response.status}: ${JSON.stringify(response.body)}`);
  });
});

/**
 * Create an organization admin user via API
 * Using the correct endpoint /organizations/:orgId/users
 */
Cypress.Commands.add('seedOrgAdmin', (orgId: number, adminData: { email: string; password: string; firstName: string; lastName: string }, centralToken: string) => {
  const apiUrl = Cypress.env('apiUrl');

  console.log('=== API REQUEST ===');
  console.log('Method: POST');
  console.log(`URL: ${apiUrl}/organizations/${orgId}/users`);
  console.log('Body:', JSON.stringify(adminData, null, 2));
  console.log('===================');

  return cy.request({
    method: 'POST',
    url: `${apiUrl}/organizations/${orgId}/users`,
    headers: {
      Authorization: `Bearer ${centralToken}`,
    },
    body: adminData,
    failOnStatusCode: false,
  }).then((response) => {
    const statusEmoji = response.status >= 200 && response.status < 300 ? '✓' :
                       response.status >= 400 && response.status < 500 ? '⚠' : '✗';
    console.log('=== API RESPONSE ===');
    console.log(`${statusEmoji} Status:`, response.status, response.statusText);
    console.log(`URL: ${apiUrl}/organizations/${orgId}/users`);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    console.log('====================');

    // Handle the case where admin already exists
    if (response.status === 409) {
      Cypress.log({ message: `Org admin ${adminData.email} already exists, skipping creation` });
      return null;
    }

    if (response.status === 201) {
      expect(response.body).to.have.property('id');
      Cypress.log({ message: `Org admin created: ${adminData.email}` });
      // Add delay to allow database to settle
      return cy.wait(500).then(() => response.body);
    }

    Cypress.log({ message: `Failed to create org admin. Status: ${response.status}, Body: ${JSON.stringify(response.body)}` });
    throw new Error(`Unexpected response status ${response.status}: ${JSON.stringify(response.body)}`);
  });
});

/**
 * Create a doctor via API
 */
Cypress.Commands.add('seedDoctor', (orgName: string, doctorData: { email: string; password: string; firstName: string; lastName: string; specialization: string; licenseNumber: string; phoneNumber?: string }, adminToken: string) => {
  const apiUrl = Cypress.env('apiUrl');

  console.log('=== API REQUEST ===');
  console.log('Method: POST');
  console.log(`URL: ${apiUrl}/${orgName}/doctors`);
  console.log('Body:', JSON.stringify(doctorData, null, 2));
  console.log('===================');

  return cy.request({
    method: 'POST',
    url: `${apiUrl}/${orgName}/doctors`,
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
    body: doctorData,
    failOnStatusCode: false,
  }).then((response) => {
    const statusEmoji = response.status >= 200 && response.status < 300 ? '✓' :
                       response.status >= 400 && response.status < 500 ? '⚠' : '✗';
    console.log('=== API RESPONSE ===');
    console.log(`${statusEmoji} Status:`, response.status, response.statusText);
    console.log(`URL: ${apiUrl}/${orgName}/doctors`);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    console.log('====================');

    if (response.status === 409) {
      Cypress.log({ message: `Doctor ${doctorData.email} already exists, skipping creation` });
      return null;
    }

    if (response.status === 201) {
      expect(response.body).to.have.property('id');
      Cypress.log({ message: `Doctor created: ${doctorData.email}` });
      // Add delay after creation
      return cy.wait(500).then(() => response.body);
    }

    Cypress.log({ message: `Failed to create doctor. Status: ${response.status}, Body: ${JSON.stringify(response.body)}` });
    throw new Error(`Unexpected response status ${response.status}: ${JSON.stringify(response.body)}`);
  });
});

/**
 * Register a patient via API (public endpoint)
 */
Cypress.Commands.add('seedPatient', (orgName: string, patientData: { email: string; password: string; firstName: string; lastName: string; dateOfBirth: string; phoneNumber: string; address?: string; emergencyContactName?: string; emergencyContactPhone?: string; bloodType?: string; allergies?: string; chronicConditions?: string }) => {
  const apiUrl = Cypress.env('apiUrl');

  console.log('=== API REQUEST ===');
  console.log('Method: POST');
  console.log(`URL: ${apiUrl}/${orgName}/patients/register`);
  console.log('Body:', JSON.stringify(patientData, null, 2));
  console.log('===================');

  return cy.request({
    method: 'POST',
    url: `${apiUrl}/${orgName}/patients/register`,
    body: patientData,
    failOnStatusCode: false,
  }).then((response) => {
    const statusEmoji = response.status >= 200 && response.status < 300 ? '✓' :
                       response.status >= 400 && response.status < 500 ? '⚠' : '✗';
    console.log('=== API RESPONSE ===');
    console.log(`${statusEmoji} Status:`, response.status, response.statusText);
    console.log(`URL: ${apiUrl}/${orgName}/patients/register`);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    console.log('====================');

    if (response.status === 409) {
      Cypress.log({ message: `Patient ${patientData.email} already exists, skipping creation` });
      return null;
    }

    if (response.status === 201) {
      expect(response.body).to.have.property('accessToken');
      expect(response.body).to.have.property('user');
      Cypress.log({ message: `Patient registered: ${patientData.email}` });
      return response.body;
    }

    Cypress.log({ message: `Failed to register patient. Status: ${response.status}, Body: ${JSON.stringify(response.body)}` });
    throw new Error(`Unexpected response status ${response.status}: ${JSON.stringify(response.body)}`);
  });
});

/**
 * Book an appointment via API
 */
Cypress.Commands.add('seedAppointment', (orgName: string, appointmentData: { doctorId: number; appointmentDateTime: string; notes?: string }, patientToken: string) => {
  const apiUrl = Cypress.env('apiUrl');

  console.log('=== API REQUEST ===');
  console.log('Method: POST');
  console.log(`URL: ${apiUrl}/${orgName}/appointments`);
  console.log('Body:', JSON.stringify(appointmentData, null, 2));
  console.log('===================');

  return cy.request({
    method: 'POST',
    url: `${apiUrl}/${orgName}/appointments`,
    headers: {
      Authorization: `Bearer ${patientToken}`,
    },
    body: appointmentData,
    failOnStatusCode: false,
  }).then((response) => {
    const statusEmoji = response.status >= 200 && response.status < 300 ? '✓' :
                       response.status >= 400 && response.status < 500 ? '⚠' : '✗';
    console.log('=== API RESPONSE ===');
    console.log(`${statusEmoji} Status:`, response.status, response.statusText);
    console.log(`URL: ${apiUrl}/${orgName}/appointments`);
    console.log('Body:', JSON.stringify(response.body, null, 2));
    console.log('====================');

    if (response.status === 409) {
      Cypress.log({ message: `Appointment already exists, skipping creation` });
      return null;
    }

    if (response.status === 201) {
      expect(response.body).to.have.property('id');
      Cypress.log({ message: `Appointment created: ID ${response.body.id}` });
      return response.body;
    }

    Cypress.log({ message: `Failed to create appointment. Status: ${response.status}, Body: ${JSON.stringify(response.body)}` });
    throw new Error(`Unexpected response status ${response.status}: ${JSON.stringify(response.body)}`);
  });
});

// Export for TypeScript
export {};
