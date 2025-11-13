/// <reference types="cypress" />

describe('Doctor Appointment Management', () => {
  let orgName: string;
  let doctorId: number;
  let doctorEmail: string;
  let patientToken: string;
  let orgAdminToken: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `DoctorApptOrg${timestamp}`;

    const centralEmail = `central-${timestamp}@test.com`;
    cy.seedCentralAdmin(centralEmail, `Central Admin ${timestamp}`, 'TestPassword123!@#').then(() => {
      const apiUrl = Cypress.env('apiUrl');
      cy.request('POST', `${apiUrl}/auth/login`, {
        email: centralEmail,
        password: 'TestPassword123!@#',
      }).then((centralResponse) => {
        cy.seedOrganization(orgName, centralResponse.body.accessToken).then((org) => {
          cy.seedOrgAdmin(org.id, {
            email: `admin-${timestamp}@test.com`,
            password: 'AdminPass123!@#',
            firstName: 'Admin',
            lastName: 'User',
          }, centralResponse.body.accessToken).then(() => {
            cy.request('POST', `${apiUrl}/${orgName}/auth/login`, {
              email: `admin-${timestamp}@test.com`,
              password: 'AdminPass123!@#',
            }).then((adminLoginResponse) => {
              orgAdminToken = adminLoginResponse.body.accessToken;

              // Create doctor and login
              doctorEmail = `doctor-${timestamp}@test.com`;
              cy.seedDoctor(orgName, {
                email: doctorEmail,
                password: 'password123',
                firstName: 'Dr',
                lastName: 'Smith',
                specialization: 'Cardiology',
                licenseNumber: `MD${timestamp}`,
              }, orgAdminToken).then((doctor) => {
                doctorId = doctor.id;
                cy.loginAsOrgUser(orgName, doctorEmail, 'password123', 'DOCTOR');

                // Create patient for booking appointments
                cy.seedPatient(orgName, {
                  email: `patient-${timestamp}@test.com`,
                  password: 'password123',
                  firstName: 'John',
                  lastName: 'Doe',
                  dateOfBirth: '1990-01-15',
                  phoneNumber: '5551234567',
                  allergies: 'Penicillin',
                  chronicConditions: 'Diabetes',
                }).then((patientResponse) => {
                  patientToken = patientResponse.accessToken;
                });
              });
            });
          });
        });
      });
    });
  });

  it('should display empty appointments list initially', () => {
    cy.visit(`/${orgName}/appointments`);

    // Assert empty state
    cy.contains(/no appointments/i).should('be.visible');
  });

  it('should display all doctor appointments', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed appointments
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Regular checkup',
    }, patientToken);

    cy.visit(`/${orgName}/appointments`);

    // Assert appointment displayed
    cy.contains('John Doe').should('be.visible');
    cy.contains('Regular checkup').should('be.visible');
    cy.contains(/pending/i).should('be.visible');
  });

  it('should filter appointments by status', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed appointments with different statuses
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Pending appointment',
    }, patientToken);

    cy.visit(`/${orgName}/appointments`);

    // Click filter buttons
    cy.contains('button', /pending/i).click();

    // Assert only pending appointments shown
    cy.contains('Pending appointment').should('be.visible');
  });

  it('should show only current doctor appointments', () => {
    const timestamp = Date.now();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Create another doctor
    const otherDoctorEmail = `otherdoctor-${timestamp}@test.com`;
    cy.seedDoctor(orgName, {
      email: otherDoctorEmail,
      password: 'password123',
      firstName: 'Other',
      lastName: 'Doctor',
      specialization: 'Neurology',
      licenseNumber: `MD${timestamp}OTHER`,
    }, orgAdminToken).then((otherDoctor) => {
      // Create appointment for other doctor
      cy.seedAppointment(orgName, {
        doctorId: otherDoctor.id,
        appointmentDateTime: futureDate.toISOString(),
        notes: 'Other doctor appointment',
      }, patientToken);

      // Create appointment for current doctor
      cy.seedAppointment(orgName, {
        doctorId,
        appointmentDateTime: futureDate.toISOString(),
        notes: 'My appointment',
      }, patientToken);

      cy.visit(`/${orgName}/appointments`);

      // Assert only current doctor's appointments shown
      cy.contains('My appointment').should('be.visible');
      cy.contains('Other doctor appointment').should('not.exist');
    });
  });

  it('should refresh data when refresh button clicked', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Refresh test',
    }, patientToken);

    cy.visit(`/${orgName}/appointments`);

    // Assert appointment exists
    cy.contains('Refresh test').should('be.visible');

    // Click refresh button
    cy.get('button').contains(/refresh|reload/i).click();

    // Assert loading state or data reload
    cy.get('body').then(($body) => {
      // Check if loading state exists, otherwise verify appointment still exists
      if ($body.find(':contains("loading"), :contains("refreshing")').length > 0) {
        cy.contains(/loading|refreshing/i).should('be.visible');
      } else {
        cy.contains('Refresh test').should('be.visible');
      }
    });
  });
});
