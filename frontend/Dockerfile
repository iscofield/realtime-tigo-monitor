FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build arguments for API URLs
ARG VITE_WS_URL=ws://localhost:8000/ws/panels
ARG VITE_API_BASE=http://localhost:8000
ENV VITE_WS_URL=$VITE_WS_URL
ENV VITE_API_BASE=$VITE_API_BASE

# Build the application
RUN npm run build

# Production stage with nginx
FROM nginx:alpine

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
