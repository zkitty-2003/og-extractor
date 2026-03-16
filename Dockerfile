# Stage 1: Build Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /frontend_build

# Copy frontend config and dependencies
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source code
COPY frontend/ ./

# Build the frontend (outputs to /frontend_build/dist)
RUN npm run build

# Stage 2: Build Dashboard
FROM node:18-alpine AS dashboard-builder
WORKDIR /dashboard_build
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Stage 3: Backend Runtime
FROM python:3.10-slim

# Add a non-root user for security
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Copy built frontend assets
COPY --from=frontend-builder /frontend_build/dist ./dist
COPY --from=dashboard-builder /dashboard_build/dist ./dashboard_dist

# Change ownership of /app to appuser
RUN chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8000

# Start command
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
