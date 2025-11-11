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
