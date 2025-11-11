// ***********************************************************
// This support file runs before every test file.
// ***********************************************************

import './commands';
import '@cypress/grep';


// Clear localStorage and sessionStorage before each test
beforeEach(() => {
  cy.clearLocalStorage();
  cy.window().then((win) => win.sessionStorage.clear());

  // Intercept all requests to backend API
  cy.intercept('**', (req) => {
    // Only log backend API requests
    if (req.url.includes('backend-api:3000') || req.url.includes('/auth/') || req.url.includes('/organizations')) {
      console.log('=== API REQUEST ===');
      console.log('Method:', req.method);
      console.log('URL:', req.url);
      console.log('Body:', JSON.stringify(req.body, null, 2));
      console.log('===================');

      req.continue((res) => {
        const statusEmoji = res.statusCode >= 200 && res.statusCode < 300 ? '✓' :
                           res.statusCode >= 400 && res.statusCode < 500 ? '⚠' : '✗';
        console.log('=== API RESPONSE ===');
        console.log(`${statusEmoji} Status:`, res.statusCode, res.statusMessage);
        console.log('URL:', req.url);
        console.log('Body:', JSON.stringify(res.body, null, 2));
        console.log('====================');
      });
    }
  });
});

// Clear cookies after each test
afterEach(() => {
  cy.clearCookies();
});
