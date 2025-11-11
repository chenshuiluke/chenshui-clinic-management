# Clinic Management System - Frontend

React + TypeScript + Vite application for the clinic management system.

## Security Best Practices

### Token Storage & Management

**CRITICAL**: Proper token storage is essential for application security.

#### Access Tokens
- **Store in memory only** (JavaScript variable, NOT localStorage/sessionStorage)
- Never persist to any storage mechanism
- Tokens expire after 5 minutes
- Implement automatic silent refresh at 4 minutes (T-60s)

#### Refresh Tokens
Choose one secure storage approach:

**Option 1: HttpOnly Cookies (Recommended)**
- Backend sets as HttpOnly cookie (cannot be accessed via JavaScript)
- Automatically sent with requests
- Protected from XSS attacks
- Requires CSRF protection

**Option 2: Memory Only (Most Secure, Less Convenient)**
- Store only in memory
- Cleared on page reload
- Requires user to log in again after page refresh

**Option 3: IndexedDB with Encryption**
- Encrypt token using Web Crypto API before storage
- Clear on logout
- More complex implementation

#### Implementation Example

```typescript
// auth.service.ts
class AuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  async login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password });
    this.setTokens(response.data.accessToken, response.data.refreshToken);
    return response.data.user;
  }

  private setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    // Schedule automatic refresh at 4 minutes (token expires at 5 min)
    this.scheduleTokenRefresh(4 * 60 * 1000);
  }

  private scheduleTokenRefresh(delay: number) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(async () => {
      try {
        await this.refreshAccessToken();
      } catch (error) {
        // Refresh failed, redirect to login
        this.logout();
        window.location.href = '/login';
      }
    }, delay);
  }

  private async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await api.post('/auth/refresh', {
      refreshToken: this.refreshToken
    });

    this.setTokens(response.data.accessToken, response.data.refreshToken);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      this.accessToken = null;
      this.refreshToken = null;
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
    }
  }

  // Add to API requests
  getAuthHeaders(): Record<string, string> {
    return this.accessToken
      ? { Authorization: `Bearer ${this.accessToken}` }
      : {};
  }
}

export default new AuthService();
```

#### HTTP Interceptor for Automatic Token Refresh

```typescript
// api.ts
import axios from 'axios';
import authService from './auth.service';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = authService.getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and haven't retried yet, try to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        await authService.refreshAccessToken();
        // Retry original request with new token
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        authService.logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

### Content Security Policy (CSP)

Add CSP meta tag to `index.html`:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               img-src 'self' data: https:;
               connect-src 'self' https://your-api-domain.com;
               font-src 'self';
               object-src 'none';
               base-uri 'self';
               form-action 'self';
               frame-ancestors 'none';
               upgrade-insecure-requests;">
```

### XSS Protection

**Input Sanitization:**
```typescript
import DOMPurify from 'dompurify';

// Sanitize user-generated HTML before rendering
const SafeHtml: React.FC<{ html: string }> = ({ html }) => {
  const clean = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
};
```

**Output Encoding:**
React automatically escapes content, but be careful with:
- `dangerouslySetInnerHTML`
- Direct DOM manipulation
- Third-party libraries

### HTTPS Enforcement

**In production:**
```typescript
// Check protocol and redirect if needed
if (
  import.meta.env.PROD &&
  window.location.protocol !== 'https:'
) {
  window.location.href = window.location.href.replace('http:', 'https:');
}
```

### Environment Variables

Create `.env.production`:
```bash
VITE_API_URL=https://api.your-domain.com
VITE_ENABLE_CSP=true
```

**NEVER commit:**
- `.env.local`
- API keys
- Secrets

### Password Requirements

When implementing password inputs, enforce the backend requirements:

**Admin Passwords:**
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

```typescript
const validatePassword = (password: string): string | null => {
  if (password.length < 12) {
    return 'Password must be at least 12 characters';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
};
```

### Rate Limiting - User Feedback

Display rate limit information to users:

```typescript
const RateLimitInfo: React.FC = () => {
  const [limit, setLimit] = useState<number | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [reset, setReset] = useState<number | null>(null);

  useEffect(() => {
    // Parse from response headers
    api.interceptors.response.use((response) => {
      setLimit(parseInt(response.headers['ratelimit-limit'] || '0'));
      setRemaining(parseInt(response.headers['ratelimit-remaining'] || '0'));
      setReset(parseInt(response.headers['ratelimit-reset'] || '0'));
      return response;
    });
  }, []);

  if (remaining !== null && remaining < 5) {
    return (
      <Alert severity="warning">
        Rate limit warning: {remaining} requests remaining
      </Alert>
    );
  }

  return null;
};
```

### Security Checklist

**Development:**
- [ ] Never commit secrets or API keys
- [ ] Use environment variables for configuration
- [ ] Test with React DevTools to ensure no sensitive data in state

**Pre-Production:**
- [ ] Implement secure token storage (memory + silent refresh)
- [ ] Add CSP meta tag
- [ ] Configure HTTPS enforcement
- [ ] Test XSS protection
- [ ] Validate all user inputs
- [ ] Add error boundaries
- [ ] Remove console.logs with sensitive data

**Production:**
- [ ] Enable strict CSP
- [ ] Use HTTPS only
- [ ] Configure CORS properly
- [ ] Minify and obfuscate code
- [ ] Set up monitoring and error tracking
- [ ] Regular dependency updates
- [ ] Security headers configured on hosting platform

## E2E Testing with Cypress

### Prerequisites

- Backend must be running at http://localhost:3000 (or set CYPRESS_API_URL environment variable)
- Frontend dev server must be running at http://localhost:5173

### Running Tests

**Interactive mode (recommended for development):**
```bash
npm run cypress:open
```
Opens Cypress Test Runner for debugging and development.

**Headless mode (for CI):**
```bash
npm run cypress:run
```
Runs all tests in headless mode.

**Browser-specific:**
```bash
npm run cypress:run:chrome   # Run tests in Chrome
npm run cypress:run:firefox  # Run tests in Firefox
```

### Test Structure

```
cypress/
├── e2e/
│   ├── central-admin/      # Central admin functionality
│   │   ├── auth.cy.ts      # Authentication tests
│   │   └── organizations.cy.ts  # Organization management
│   ├── org-admin/          # Organization admin functionality
│   │   ├── auth.cy.ts      # Org admin authentication
│   │   └── doctors.cy.ts   # Doctor management
│   ├── patient/            # Patient functionality
│   │   ├── registration.cy.ts   # Patient registration
│   │   ├── profile.cy.ts        # Profile management
│   │   └── appointments.cy.ts   # Appointment booking
│   ├── doctor/             # Doctor functionality
│   │   └── appointments.cy.ts   # Appointment management
│   └── cross-cutting/      # Cross-cutting concerns
│       └── isolation.cy.ts      # Org isolation, auth guards
├── fixtures/               # Test data
│   ├── users.json
│   └── organizations.json
└── support/                # Custom commands
    ├── commands.ts
    ├── e2e.ts
    └── index.d.ts
```

### Custom Commands

Cypress custom commands are available for common operations:

**Authentication:**
- `cy.loginAsCentralAdmin(email, password)` - Login as central admin
- `cy.loginAsOrgUser(orgName, email, password, role)` - Login as org user

**Data Seeding:**
- `cy.seedCentralAdmin(email, name, password)` - Create central admin
- `cy.seedOrganization(name, token)` - Create organization
- `cy.seedOrgAdmin(orgId, data, token)` - Create org admin
- `cy.seedDoctor(orgName, data, token)` - Create doctor
- `cy.seedPatient(orgName, data)` - Register patient
- `cy.seedAppointment(orgName, data, token)` - Book appointment

**Storage:**
- `cy.clearLocalStorage()` - Clear localStorage
- `cy.setLocalStorageItem(key, value)` - Set localStorage item
- `cy.getLocalStorageItem(key)` - Get localStorage item

See `cypress/support/commands.ts` for full list.

### Environment Variables

Set custom API URL:
```bash
export CYPRESS_API_URL=http://localhost:3000
npm run cypress:run
```

Or create `cypress.env.json`:
```json
{
  "apiUrl": "http://localhost:3000"
}
```

**Note:** `cypress.env.json` is gitignored to prevent committing sensitive data.

### Writing Tests

**Example test structure:**
```typescript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup: seed data, login
    cy.seedCentralAdmin('admin@test.com', 'Admin', 'Password123!@#');
    cy.loginAsCentralAdmin('admin@test.com', 'Password123!@#');
  });

  it('should perform action', () => {
    cy.visit('/some/page');
    cy.get('button').click();
    cy.contains('Success').should('be.visible');
  });
});
```

### Tips

- Tests use unique timestamps in data to avoid conflicts
- Each test cleans up localStorage before running
- Use `cy.pause()` in interactive mode to debug tests
- Screenshots and videos are saved in `cypress/screenshots/` and `cypress/videos/` on failure
- Tests run with retries enabled in CI mode (2 retries per test)

### Running Tests in Docker

Docker provides an isolated, reproducible environment for running E2E tests, which is especially useful for CI/CD pipelines.

**Prerequisites for Docker testing:**
- Docker and Docker Compose installed
- No need for Node.js or npm installed locally (everything runs in containers)
- No need for backend or frontend servers running locally

**Running E2E tests in Docker:**

From the project root:
```bash
./test-e2e.sh  # Recommended - includes automatic cleanup
```

From the frontend directory:
```bash
npm run cypress:docker
```

This command will:
1. Build Docker images for backend and frontend
2. Start PostgreSQL test database in tmpfs (in-memory for speed)
3. Start backend API server and wait for health check
4. Start frontend dev server and wait for health check
5. Run all Cypress tests in the cypress/included Docker image
6. Exit with appropriate status code (0 for success, non-zero for failure)

**Viewing logs during test execution:**

In a separate terminal:
```bash
cd frontend && npm run cypress:docker:logs
```

This shows real-time logs from all services (database, backend, frontend, Cypress).

**Cleaning up after tests:**
```bash
cd frontend && npm run cypress:docker:down
```

This removes all containers and volumes created by the test run. The `test-e2e.sh` script does this automatically.

**Debugging failed tests in Docker:**

- Test videos are saved in `frontend/cypress/videos/`
- Failure screenshots are saved in `frontend/cypress/screenshots/`
- View service logs: `npm run cypress:docker:logs`
- To keep containers running after test failure for debugging, manually run:
  ```bash
  docker compose -f ../docker-compose.cypress.yaml up --build
  ```
  (without --abort-on-container-exit)

**CI/CD Integration:**

The docker-compose.cypress.yaml setup is designed for CI/CD pipelines:
- All dependencies are containerized (no need to install Node.js, Chrome, etc. on CI runners)
- Tests run against isolated test database (no conflicts with other tests)
- Exit code propagates correctly (0 for success, non-zero for failure)
- Example GitHub Actions workflow: Run `./test-e2e.sh` in a step, which will fail the build if tests fail

**Differences between local and Docker testing:**

| Aspect | Local Testing | Docker Testing |
|--------|--------------|----------------|
| Server URLs | localhost:5173, localhost:3000 | Container network (frontend:5173, backend-api:3000) |
| Setup | Manual server startup required | Automatic startup with health checks |
| Database | Your local PostgreSQL | In-memory PostgreSQL (tmpfs) |
| Environment | Varies by machine | Identical across all machines |
| Chrome/Browser | Your local installation | Cypress Docker image with pre-installed browsers |
| Test Isolation | May conflict with local data | Completely isolated environment |

**Troubleshooting:**

- **Connection errors:** Check that health checks are passing:
  ```bash
  docker compose -f ../docker-compose.cypress.yaml ps
  ```

- **Backend health check fails:** Check backend logs:
  ```bash
  docker compose -f ../docker-compose.cypress.yaml logs backend-api
  ```

- **Frontend health check fails:** Check frontend logs:
  ```bash
  docker compose -f ../docker-compose.cypress.yaml logs frontend
  ```

- **Cypress crashes:** Increase shared memory in docker-compose.cypress.yaml:
  ```yaml
  cypress:
    shm_size: 4gb  # Increase from 2gb if needed
  ```

- **Rebuild after code changes:**
  ```bash
  docker compose -f ../docker-compose.cypress.yaml build --no-cache
  ```

- **Port conflicts:** If you have services running locally on ports 3000 or 5173, the Docker containers use internal networking and won't conflict. However, if you want to access the containers from your host, you can expose different ports in docker-compose.cypress.yaml.

## Development

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
