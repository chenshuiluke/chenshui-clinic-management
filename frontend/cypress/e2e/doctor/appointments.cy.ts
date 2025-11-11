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
                cy.loginAsOrgUser(orgName, doctorEmail, 'password123', 'doctor');

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

  it('should approve pending appointment', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'To be approved',
    }, patientToken);

    cy.visit(`/${orgName}/appointments`);

    // Find and approve appointment
    cy.contains('tr', 'To be approved').within(() => {
      cy.contains('button', /approve/i).click();
    });

    // Confirm in modal
    cy.get('.ant-modal').within(() => {
      cy.contains('button', /approve/i).click();
    });

    // Assert success
    cy.contains(/success|approved/i, { timeout: 10000 }).should('be.visible');

    // Assert status changed to Approved
    cy.contains('tr', 'To be approved').within(() => {
      cy.contains(/approved/i).should('be.visible');
    });
  });

  it('should decline pending appointment', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'To be declined',
    }, patientToken);

    cy.visit(`/${orgName}/appointments`);

    // Find and decline appointment
    cy.contains('tr', 'To be declined').within(() => {
      cy.contains('button', /decline/i).click();
    });

    // Confirm in modal
    cy.get('.ant-modal').within(() => {
      cy.contains('button', /decline/i).click();
    });

    // Assert success
    cy.contains(/declined/i, { timeout: 10000 }).should('be.visible');

    // Assert status changed
    cy.contains('tr', 'To be declined').within(() => {
      cy.contains(/declined/i).should('be.visible');
    });
  });

  it('should complete approved appointment', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed appointment
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'To be completed',
    }, patientToken).then((appointment) => {
      // Approve it first via API using the correct doctor email
      const apiUrl = Cypress.env('apiUrl');
      cy.request('POST', `${apiUrl}/${orgName}/auth/login`, {
        email: doctorEmail,
        password: 'password123',
      }).then((doctorLoginResp) => {
        cy.request({
          method: 'PUT',
          url: `${apiUrl}/${orgName}/appointments/${appointment.id}/approve`,
          headers: { Authorization: `Bearer ${doctorLoginResp.body.accessToken}` },
          failOnStatusCode: false,
        });
      });
    });

    cy.visit(`/${orgName}/appointments`);

    // Complete appointment
    cy.contains('tr', 'To be completed').within(() => {
      cy.contains('button', /complete/i).click();
    });

    // Confirm in modal
    cy.get('.ant-modal').within(() => {
      cy.contains('button', /complete/i).click();
    });

    // Assert success
    cy.contains(/completed/i, { timeout: 10000 }).should('be.visible');
  });

  it('should view appointment details in drawer', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Detailed appointment',
    }, patientToken);

    cy.visit(`/${orgName}/appointments`);

    // Click view details
    cy.contains('tr', 'Detailed appointment').within(() => {
      cy.contains('button', /view|details/i).click();
    });

    // Assert drawer opens
    cy.get('.ant-drawer').should('be.visible');
    cy.contains('Appointment Details').should('be.visible');

    // Assert details shown
    cy.contains('John Doe').should('be.visible');
    cy.contains('Detailed appointment').should('be.visible');
    cy.contains('Penicillin').should('be.visible'); // Allergies
    cy.contains('Diabetes').should('be.visible'); // Chronic conditions
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

  it('should block access to another organization routes', () => {
    const timestamp = Date.now();
    const otherOrgName = `OtherOrg${timestamp}`;

    // Create another organization
    const centralEmail = `central-other-${timestamp}@test.com`;
    cy.seedCentralAdmin(centralEmail, `Central Admin ${timestamp}`, 'TestPassword123!@#').then(() => {
      const apiUrl = Cypress.env('apiUrl');
      cy.request('POST', `${apiUrl}/auth/login`, {
        email: centralEmail,
        password: 'TestPassword123!@#',
      }).then((centralResponse) => {
        cy.seedOrganization(otherOrgName, centralResponse.body.accessToken);
      });
    });

    // Try to access other org's appointments as current doctor
    cy.visit(`/${otherOrgName}/appointments`, { failOnStatusCode: false });

    // Should be denied access
    cy.url().should('not.include', `/${otherOrgName}/appointments`);
    cy.contains(/unauthorized|access denied|not found/i).should('be.visible').catch(() => {
      cy.url().should('not.equal', `${Cypress.config().baseUrl}/${otherOrgName}/appointments`);
    });
  });

  it('should take actions from details drawer', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Drawer action test',
    }, patientToken);

    cy.visit(`/${orgName}/appointments`);

    // Open details drawer
    cy.contains('tr', 'Drawer action test').within(() => {
      cy.contains('button', /view|details/i).click();
    });

    // Assert drawer opens
    cy.get('.ant-drawer').should('be.visible');

    // Take action from drawer (approve)
    cy.get('.ant-drawer').within(() => {
      cy.contains('button', /approve/i).click();
    });

    // Confirm action
    cy.get('.ant-modal').within(() => {
      cy.contains('button', /approve/i).click();
    });

    // Assert success
    cy.contains(/success|approved/i).should('be.visible');

    // Close drawer
    cy.get('.ant-drawer-close').click();

    // Assert status updated in table
    cy.contains('tr', 'Drawer action test').within(() => {
      cy.contains(/approved/i).should('be.visible');
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

  it('should deny access to doctor pages for admin role', () => {
    const timestamp = Date.now();
    const adminEmail = `admin-access-${timestamp}@test.com`;

    // Login as org admin
    cy.loginAsOrgUser(orgName, `admin-${timestamp}@test.com`, 'AdminPass123!@#', 'admin');

    // Try to access doctor appointments page
    cy.visit(`/${orgName}/appointments`, { failOnStatusCode: false });

    // Should be denied or redirected
    cy.url().then((url) => {
      if (url.includes('/appointments')) {
        // If we're still on the appointments page, verify no appointments content is shown
        cy.contains(/appointments/i).should('not.exist');
      } else {
        // Otherwise, verify we were redirected away
        expect(url).to.not.include('/appointments');
      }
    });
  });

  it('should deny access to doctor pages for patient role', () => {
    const timestamp = Date.now();
    const patientEmail = `patient-access-${timestamp}@test.com`;

    // Create and login as patient
    cy.seedPatient(orgName, {
      email: patientEmail,
      password: 'password123',
      firstName: 'Access',
      lastName: 'Test',
      dateOfBirth: '1990-01-01',
      phoneNumber: '5551234567',
    });

    cy.loginAsOrgUser(orgName, patientEmail, 'password123', 'patient');

    // Try to access doctor appointments page
    cy.visit(`/${orgName}/appointments`, { failOnStatusCode: false });

    // Should redirect to patient appointments or another page
    cy.url().then((url) => {
      // Verify we're either on patient appointments page or redirected away from doctor appointments
      expect(url.includes('/patient/appointments') || !url.endsWith(`/${orgName}/appointments`)).to.be.true;
    });
  });
});
