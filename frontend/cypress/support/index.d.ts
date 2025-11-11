/// <reference types="cypress" />

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Programmatically login as central admin via API
       * @param email - Admin email address
       * @param password - Admin password
       * @example cy.loginAsCentralAdmin('admin@test.com', 'Password123!@#')
       */
      loginAsCentralAdmin(email: string, password: string): Chainable<void>;

      /**
       * Programmatically login as organization user via API
       * @param orgName - Organization name
       * @param email - User email address
       * @param password - User password
       * @param role - User role (admin, doctor, or patient)
       * @example cy.loginAsOrgUser('hospital', 'doctor@test.com', 'password123', 'doctor')
       */
      loginAsOrgUser(
        orgName: string,
        email: string,
        password: string,
        role: 'admin' | 'doctor' | 'patient'
      ): Chainable<void>;

      /**
       * Create a central admin user via API
       * @param email - Admin email address
       * @param name - Admin name
       * @param password - Admin password (min 12 chars with complexity)
       * @returns Created user data or null if already exists
       * @example cy.seedCentralAdmin('admin@test.com', 'Test Admin', 'AdminPass123!@#')
       */
      seedCentralAdmin(email: string, name: string, password: string): Chainable<any>;

      /**
       * Create an organization via API
       * @param name - Organization name (min 4 chars)
       * @param adminToken - Central admin access token
       * @returns Created organization data or null if already exists (409)
       * @example cy.seedOrganization('Test Hospital', adminToken)
       */
      seedOrganization(name: string, adminToken: string): Chainable<any>;

      /**
       * Create an organization admin user via API
       * @param orgId - Organization ID
       * @param adminData - Admin user data
       * @param centralToken - Central admin access token
       * @returns Created admin user data
       * @example cy.seedOrgAdmin(1, { email: 'admin@hospital.com', password: 'AdminPass123!@#', firstName: 'John', lastName: 'Doe' }, token)
       */
      seedOrgAdmin(
        orgId: number,
        adminData: {
          email: string;
          password: string;
          firstName: string;
          lastName: string;
        },
        centralToken: string
      ): Chainable<any>;

      /**
       * Create a doctor via API
       * @param orgName - Organization name
       * @param doctorData - Doctor data
       * @param adminToken - Organization admin access token
       * @returns Created doctor data or null if already exists (409)
       * @example cy.seedDoctor('hospital', { email: 'doctor@test.com', password: 'password123', firstName: 'Jane', lastName: 'Smith', specialization: 'Cardiology', licenseNumber: 'MD123456' }, token)
       */
      seedDoctor(
        orgName: string,
        doctorData: {
          email: string;
          password: string;
          firstName: string;
          lastName: string;
          specialization: string;
          licenseNumber: string;
          phoneNumber?: string;
        },
        adminToken: string
      ): Chainable<any | null>;

      /**
       * Register a patient via API (public endpoint)
       * @param orgName - Organization name
       * @param patientData - Patient data
       * @returns Registration response with tokens and user data, or null if already exists (409)
       * @example cy.seedPatient('hospital', { email: 'patient@test.com', password: 'password123', firstName: 'John', lastName: 'Doe', dateOfBirth: '1990-01-15', phoneNumber: '5551234567' })
       */
      seedPatient(
        orgName: string,
        patientData: {
          email: string;
          password: string;
          firstName: string;
          lastName: string;
          dateOfBirth: string;
          phoneNumber: string;
          address?: string;
          emergencyContactName?: string;
          emergencyContactPhone?: string;
          bloodType?: string;
          allergies?: string;
          chronicConditions?: string;
        }
      ): Chainable<any>;

      /**
       * Book an appointment via API
       * @param orgName - Organization name
       * @param appointmentData - Appointment data
       * @param patientToken - Patient access token
       * @returns Created appointment data or null if already exists (409)
       * @example cy.seedAppointment('hospital', { doctorId: 1, appointmentDateTime: '2025-12-01T10:00:00Z', notes: 'First visit' }, token)
       */
      seedAppointment(
        orgName: string,
        appointmentData: {
          doctorId: number;
          appointmentDateTime: string;
          notes?: string;
        },
        patientToken: string
      ): Chainable<any | null>;

      /**
       * Set a specific localStorage item
       * @param key - Storage key
       * @param value - Storage value
       * @example cy.setLocalStorageItem('token', 'abc123')
       */
      setLocalStorageItem(key: string, value: string): Chainable<void>;

      /**
       * Get a specific localStorage item
       * @param key - Storage key
       * @returns Storage value or null
       * @example cy.getLocalStorageItem('token').should('exist')
       */
      getLocalStorageItem(key: string): Chainable<string | null>;
    }
  }
}

export {};
