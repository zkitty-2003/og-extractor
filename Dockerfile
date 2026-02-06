# Stage 1: Build the React Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /frontend_build

# Copy dependencies first to leverage caching
COPY frontend/package*.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
# Output will be in /frontend_build/dist
RUN npm run build

# Stage 2: Serve with FastAPI
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies if needed (e.g. for some python packages)
# RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Copy built frontend assets from Stage 1 to /app/dist
COPY --from=frontend-builder /frontend_build/dist ./dist

# Expose port (Render uses $PORT, default to 8000)
EXPOSE 8000

# Run commands
# Using shell form to expand ${PORT}
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
