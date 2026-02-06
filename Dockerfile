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

# Stage 2: Backend Runtime
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code (including main.py and other modules)
COPY . .

# Copy built frontend assets from Stage 1 -> /app/dist
COPY --from=frontend-builder /frontend_build/dist ./dist

# Expose port (Documentation only, Render ignores this)
EXPOSE 8000

# Start command using $PORT environment variable
# Module path: main.py -> main:app
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
