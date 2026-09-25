FROM node:18
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx
COPY --from=0 /app/build  /usr/share/nginx/html
