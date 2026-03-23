FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm ci

# Build static assets
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

# Serve the app on port 5173 to match your existing access pattern
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5173

CMD ["nginx", "-g", "daemon off;"]
