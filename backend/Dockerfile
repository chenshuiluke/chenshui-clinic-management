# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm i

# Copy source code
COPY src ./src
RUN npm i
# Build TypeScript
RUN npm run build

# Remove source files to prevent tsx from loading them
RUN rm -rf src

# Expose port (adjust if your app uses a different port)
EXPOSE 3000

# Start the application
CMD ["node", "dist/server.js"]
