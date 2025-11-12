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

# Remove TypeScript source files but keep migrations
RUN find src -type f -name "*.ts" ! -path "*/migrations/*" -delete && \
    find src -type d -empty -delete

# Expose port (adjust if your app uses a different port)
EXPOSE 3000

# Start the application
CMD ["node", "dist/server.js"]
