FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --ignore-scripts

COPY . .

CMD ["node", "src/worker.js"]