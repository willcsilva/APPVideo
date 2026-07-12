FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --ignore-scripts

COPY . .

EXPOSE 3001

CMD ["node", "src/server.js"]