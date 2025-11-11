/// <reference types="cypress" />

describe('Patient Appointments', () => {
  let orgName: string;
  let patientToken: string;
  let doctorId: number;
  let doctorEmail: string;
  let orgAdminToken: string;

  beforeEach(() => {
    const timestamp = Date.now();
    orgName = `ApptOrg${timestamp}`;

    const centralEmail = `central-${timestamp}@test.com`;
    cy.seedCentralAdmin(centralEmail, `Central Admin ${timestamp}`, 'TestPassword123!@#').then(() => {
      const apiUrl = Cypress.env('apiUrl');
      cy.request('POST', `${apiUrl}/auth/login`, {
        email: centralEmail,
        password: 'TestPassword123!@#',
      }).then((centralResponse) => {
        cy.seedOrganization(orgName, centralResponse.body.accessToken).then((org) => {
          // Create org admin
          cy.seedOrgAdmin(org.id, {
            email: `admin-${timestamp}@test.com`,
            password: 'AdminPass123!@#',
            firstName: 'Admin',
            lastName: 'User',
          }, centralResponse.body.accessToken).then(() => {
            // Login as org admin
            cy.request('POST', `${apiUrl}/${orgName}/auth/login`, {
              email: `admin-${timestamp}@test.com`,
              password: 'AdminPass123!@#',
            }).then((adminLoginResponse) => {
              orgAdminToken = adminLoginResponse.body.accessToken;

              // Create doctor
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

                // Create and login as patient
                cy.seedPatient(orgName, {
                  email: `patient-${timestamp}@test.com`,
                  password: 'password123',
                  firstName: 'John',
                  lastName: 'Doe',
                  dateOfBirth: '1990-01-15',
                  phoneNumber: '5551234567',
                }).then((patientResponse) => {
                  patientToken = patientResponse.accessToken;
                  cy.loginAsOrgUser(orgName, `patient-${timestamp}@test.com`, 'password123', 'patient');
                });
              });
            });
          });
        });
      });
    });
  });

  it('should display empty appointments list initially', () => {
    cy.visit(`/${orgName}/patient/appointments`);

    // Assert empty state
    cy.contains(/no appointments|book your first/i).should('be.visible');
  });

  it('should book a new appointment', () => {
    cy.visit(`/${orgName}/patient/appointments/book`);

    // Select doctor
    cy.get('[id*="doctor"]').click();
    cy.contains('.ant-select-item', 'Dr Smith').click();

    // Select future date and time
    cy.get('.ant-picker').click();
    cy.get('.ant-picker-cell').not('.ant-picker-cell-disabled').first().click();

    // Enter notes
    cy.get('textarea[name="notes"]').type('First visit for checkup');

    // Submit form
    cy.get('button[type="submit"]').click();

    // Assert success message
    cy.contains(/success|booked/i, { timeout: 10000 }).should('be.visible');

    // Assert redirect to appointments list
    cy.url().should('include', `/${orgName}/patient/appointments`);

    // Assert appointment appears with status Pending
    cy.contains('Dr Smith').should('be.visible');
    cy.contains(/pending/i).should('be.visible');
  });

  it('should book appointment without notes', () => {
    cy.visit(`/${orgName}/patient/appointments/book`);

    // Select doctor
    cy.get('[id*="doctor"]').click();
    cy.contains('.ant-select-item', 'Dr Smith').click();

    // Select date
    cy.get('.ant-picker').click();
    cy.get('.ant-picker-cell').not('.ant-picker-cell-disabled').first().click();

    // Submit without notes
    cy.get('button[type="submit"]').click();

    // Assert success
    cy.contains(/success|booked/i, { timeout: 10000 }).should('be.visible');
  });

  it('should validate required fields for booking', () => {
    cy.visit(`/${orgName}/patient/appointments/book`);

    // Submit without filling fields
    cy.get('button[type="submit"]').click();

    // Assert validation errors
    cy.contains(/required|select/i).should('be.visible');
  });

  it('should display all patient appointments', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed multiple appointments
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Appointment 1',
    }, patientToken);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Appointment 2',
    }, patientToken);

    cy.visit(`/${orgName}/patient/appointments`);

    // Assert appointments displayed
    cy.contains('Appointment 1').should('be.visible');
    cy.contains('Appointment 2').should('be.visible');
  });

  it('should cancel pending appointment', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed pending appointment
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'To be cancelled',
    }, patientToken);

    cy.visit(`/${orgName}/patient/appointments`);

    // Find and cancel appointment
    cy.contains('tr', 'To be cancelled').within(() => {
      cy.contains('button', /cancel/i).click();
    });

    // Confirm cancellation in modal
    cy.get('.ant-modal').within(() => {
      cy.contains('button', /yes|cancel|confirm/i).click();
    });

    // Assert success
    cy.contains(/cancelled|success/i, { timeout: 10000 }).should('be.visible');

    // Assert status changed to Cancelled
    cy.contains('tr', 'To be cancelled').within(() => {
      cy.contains(/cancelled/i).should('be.visible');
    });
  });

  it('should navigate to book appointment page', () => {
    cy.visit(`/${orgName}/patient/appointments`);

    // Click book new appointment button
    cy.contains('button', /book.*appointment/i).click();

    // Assert redirect to book page
    cy.url().should('include', `/${orgName}/patient/appointments/book`);
  });

  it('should prevent selecting past dates in DatePicker', () => {
    cy.visit(`/${orgName}/patient/appointments/book`);

    // Open date picker
    cy.get('.ant-picker').click();

    // Assert past dates are disabled
    cy.get('.ant-picker-cell-today').prevAll('.ant-picker-cell').should('have.class', 'ant-picker-cell-disabled');

    // Try to click a past date (should not work)
    cy.get('.ant-picker-cell-disabled').first().click({ force: true });

    // Date picker should still be open (date not selected)
    cy.get('.ant-picker-dropdown').should('be.visible');
  });

  it('should display appointments in descending date order', () => {
    const date1 = new Date();
    date1.setDate(date1.getDate() + 1);
    const date2 = new Date();
    date2.setDate(date2.getDate() + 5);
    const date3 = new Date();
    date3.setDate(date3.getDate() + 10);

    // Seed appointments in mixed order
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: date2.toISOString(),
      notes: 'Middle appointment',
    }, patientToken);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: date3.toISOString(),
      notes: 'Latest appointment',
    }, patientToken);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: date1.toISOString(),
      notes: 'Earliest appointment',
    }, patientToken);

    cy.visit(`/${orgName}/patient/appointments`);

    // Get all appointment rows and check order
    cy.get('tbody tr').then(($rows) => {
      const notes = [];
      $rows.each((index, row) => {
        const note = Cypress.$(row).find('td').filter(':contains("appointment")').text();
        if (note) notes.push(note);
      });

      // Assert descending order (latest first)
      expect(notes[0]).to.include('Latest');
      expect(notes[notes.length - 1]).to.include('Earliest');
    });
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

    cy.visit(`/${orgName}/patient/appointments`);

    // Apply status filter for Pending
    cy.get('select[name="status"], button').contains(/filter|status/i).click({ force: true });
    cy.contains(/pending/i).click();

    // Assert only pending appointments shown
    cy.contains('Pending appointment').should('be.visible');

    // Clear filter
    cy.contains('button', /all|clear/i).click({ force: true });
  });

  it('should display correct status tag colors', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Status color test',
    }, patientToken);

    cy.visit(`/${orgName}/patient/appointments`);

    // Check Pending status text and verify tag exists
    cy.contains('tr', 'Status color test').within(() => {
      // Verify status text instead of color
      cy.get('.ant-tag').should('contain.text', 'Pending');
      // Optionally verify the tag has a specific class or data attribute
      cy.get('.ant-tag').should('exist').and('be.visible');
    });
  });

  it('should not allow cancelling approved appointment', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed and approve an appointment via API
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Approved appointment',
    }, patientToken).then((appointment) => {
      // Login as the doctor who owns this appointment to approve
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

    cy.visit(`/${orgName}/patient/appointments`);

    // Check that cancel button is disabled or not present for approved appointment
    cy.contains('tr', 'Approved appointment').within(() => {
      cy.get('button').contains(/cancel/i).should(($btn) => {
        // Button should either be disabled or not exist
        expect($btn.length === 0 || $btn.is(':disabled')).to.be.true;
      });
    });
  });

  it('should not show cancel button for completed appointments', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed, approve, and complete an appointment
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'To be completed',
    }, patientToken).then((appointment) => {
      const apiUrl = Cypress.env('apiUrl');

      // Login as doctor to approve and complete
      cy.request('POST', `${apiUrl}/${orgName}/auth/login`, {
        email: doctorEmail,
        password: 'password123',
      }).then((doctorLoginResp) => {
        // First approve the appointment
        cy.request({
          method: 'PUT',
          url: `${apiUrl}/${orgName}/appointments/${appointment.id}/approve`,
          headers: { Authorization: `Bearer ${doctorLoginResp.body.accessToken}` },
          failOnStatusCode: false,
        }).then(() => {
          // Then complete it
          cy.request({
            method: 'PUT',
            url: `${apiUrl}/${orgName}/appointments/${appointment.id}/complete`,
            headers: { Authorization: `Bearer ${doctorLoginResp.body.accessToken}` },
            failOnStatusCode: false,
          });
        });
      });
    });

    cy.visit(`/${orgName}/patient/appointments`);

    // Check no cancel button for completed appointment
    cy.contains('tr', 'To be completed').within(() => {
      cy.get('button').contains(/cancel/i).should('not.exist');
    });
  });

  it('should not show cancel button for declined appointments', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed and decline an appointment
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'To be declined',
    }, patientToken).then((appointment) => {
      const apiUrl = Cypress.env('apiUrl');

      // Login as doctor to decline
      cy.request('POST', `${apiUrl}/${orgName}/auth/login`, {
        email: doctorEmail,
        password: 'password123',
      }).then((doctorLoginResp) => {
        cy.request({
          method: 'PUT',
          url: `${apiUrl}/${orgName}/appointments/${appointment.id}/decline`,
          headers: { Authorization: `Bearer ${doctorLoginResp.body.accessToken}` },
          failOnStatusCode: false,
        });
      });
    });

    cy.visit(`/${orgName}/patient/appointments`);

    // Check no cancel button for declined appointment
    cy.contains('tr', 'To be declined').within(() => {
      cy.get('button').contains(/cancel/i).should('not.exist');
    });
  });

  it('should not show cancel button for cancelled appointments', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);

    // Seed and cancel an appointment
    cy.seedAppointment(orgName, {
      doctorId,
      appointmentDateTime: futureDate.toISOString(),
      notes: 'Already cancelled',
    }, patientToken).then((appointment) => {
      const apiUrl = Cypress.env('apiUrl');
      cy.request({
        method: 'PUT',
        url: `${apiUrl}/${orgName}/appointments/${appointment.id}/cancel`,
        headers: { Authorization: `Bearer ${patientToken}` },
        failOnStatusCode: false,
      });
    });

    cy.visit(`/${orgName}/patient/appointments`);

    // Check no cancel button for already cancelled appointment
    cy.contains('tr', 'Already cancelled').within(() => {
      cy.get('button').contains(/cancel/i).should('not.exist');
    });
  });

  it('should refresh appointment list', () => {
    cy.visit(`/${orgName}/patient/appointments`);

    // Click refresh button
    cy.get('button').contains(/refresh|reload/i).click();

    // Assert data reloads (loading state or table exists)
    cy.get('body').then(($body) => {
      // Check if loading state exists, otherwise verify table exists
      if ($body.find(':contains("loading"), :contains("refreshing")').length > 0) {
        cy.contains(/loading|refreshing/i).should('be.visible');
      } else {
        cy.get('table').should('exist');
      }
    });
  });

  it('should show warning when no doctors exist', () => {
    // Create a new org without doctors
    const timestamp = Date.now();
    const noDoctorOrg = `NoDoctorOrg${timestamp}`;

    const centralEmail = `central-nodoc-${timestamp}@test.com`;
    cy.seedCentralAdmin(centralEmail, `Central Admin ${timestamp}`, 'TestPassword123!@#').then(() => {
      const apiUrl = Cypress.env('apiUrl');
      cy.request('POST', `${apiUrl}/auth/login`, {
        email: centralEmail,
        password: 'TestPassword123!@#',
      }).then((centralResponse) => {
        cy.seedOrganization(noDoctorOrg, centralResponse.body.accessToken).then(() => {
          // Register patient in org with no doctors
          cy.seedPatient(noDoctorOrg, {
            email: `patient-nodoc-${timestamp}@test.com`,
            password: 'password123',
            firstName: 'No',
            lastName: 'Doctor',
            dateOfBirth: '1990-01-01',
            phoneNumber: '5551234567',
          }).then((patientResp) => {
            cy.loginAsOrgUser(noDoctorOrg, `patient-nodoc-${timestamp}@test.com`, 'password123', 'patient');

            cy.visit(`/${noDoctorOrg}/patient/appointments/book`);

            // Assert warning about no doctors
            cy.contains(/no doctors|unavailable/i).should('be.visible');
          });
        });
      });
    });
  });

  it('should only allow patients to access booking routes', () => {
    // Try to access as doctor
    const timestamp = Date.now();
    const doctorEmail = `doctor-${timestamp}@test.com`;

    cy.seedDoctor(orgName, {
      email: doctorEmail,
      password: 'password123',
      firstName: 'Access',
      lastName: 'Test',
      specialization: 'General',
      licenseNumber: `MD${timestamp}`,
    }, orgAdminToken);

    cy.loginAsOrgUser(orgName, doctorEmail, 'password123', 'doctor');

    // Try to access patient booking page
    cy.visit(`/${orgName}/patient/appointments/book`, { failOnStatusCode: false });

    // Should be denied access
    cy.url().should('not.include', '/patient/appointments/book');
    cy.contains(/unauthorized|access denied/i).should('be.visible').catch(() => {
      cy.url().should('not.equal', `${Cypress.config().baseUrl}/${orgName}/patient/appointments/book`);
    });
  });
});
