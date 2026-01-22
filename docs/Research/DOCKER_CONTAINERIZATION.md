# Docker Containerization for Claude Pilot

> Research Summary - January 2026

## Use Cases for Docker

### 1. Cross-Platform Building

Docker images like [electronuserland/builder](https://hub.docker.com/r/electronuserland/builder) provide complete environments for packaging Electron apps:

```dockerfile
FROM electronuserland/builder:wine

WORKDIR /app
COPY . .
RUN yarn install
RUN yarn build
```

**Key Points:**

- Use Yarn over npm for better dependency resolution
- Add `"postinstall": "electron-builder install-app-deps"` to package.json
- Builds Linux, Windows (via Wine), and macOS (requires macOS host)

### 2. Running Electron Apps in Docker

For headless testing or server-side rendering:

```dockerfile
FROM node:20-slim

# Install X11 virtual framebuffer
RUN apt-get update && apt-get install -y \
    xvfb \
    libxss1 \
    libasound2 \
    libgtk-3-0 \
    libgbm1 \
    libnss3 \
    && rm -rf /var/lib/apt/lists/*

ENV DISPLAY=:99

COPY . /app
WORKDIR /app
RUN npm install

# Start xvfb and app
CMD Xvfb :99 -screen 0 1920x1080x24 & npm start
```

**Security Note:** Avoid `--no-sandbox`. Use a seccomp profile instead:

```bash
docker run --security-opt seccomp=chrome.json your-electron-app
```

### 3. E2E Testing in Docker

Reference: [Running E2E Tests in Electron with Docker](https://blog.dangl.me/archive/running-fully-automated-e2e-tests-in-electron-in-a-docker-container-with-playwright/)

```yaml
# docker-compose.test.yml
services:
  e2e:
    build:
      context: .
      dockerfile: Dockerfile.test
    volumes:
      - ./test-results:/app/test-results
    environment:
      - DISPLAY=:99
    command: >
      sh -c "Xvfb :99 -screen 0 1920x1080x24 &
             npm run test:e2e"
```

### 4. Development Environment Containerization

For consistent dev environments across team members:

```dockerfile
FROM node:20

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    libx11-dev \
    libxkbfile-dev \
    libsecret-1-dev \
    python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
```

## Recommended Approach for Claude Pilot

### Build Process

1. Use GitHub Actions with `electronuserland/builder` for CI/CD
2. Keep development local (Electron HMR is faster without Docker overhead)

### Testing

1. Run unit tests locally (faster iteration)
2. Use Docker for E2E tests in CI (consistent environment)

### Dockerfile.test

```dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

ENV DISPLAY=:99
CMD ["sh", "-c", "Xvfb :99 -screen 0 1920x1080x24 & npm run test:e2e"]
```

## Best Practices (2026)

1. **Pin base images**: Use specific tags, not `latest`
2. **Run as non-root**: Use `USER node` in production images
3. **Multi-stage builds**: Separate build and runtime stages
4. **Image signing**: Sign images with Docker Content Trust
5. **Vulnerability scanning**: Integrate Trivy/Snyk in CI

## Sources

- [electronuserland/builder Docker Image](https://hub.docker.com/r/electronuserland/builder)
- [Running Electron on Docker](https://jaked.org/blog/2021-02-18-How-to-run-Electron-on-Linux-on-Docker-on-Mac)
- [E2E Tests with Electron and Playwright in Docker](https://blog.dangl.me/archive/running-fully-automated-e2e-tests-in-electron-in-a-docker-container-with-playwright/)
- [Docker Containerization Automation](https://adevait.com/nodejs/docker-container-automation-node-python-electron)
