FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --ignore-scripts

COPY . .

EXPOSE 3000

CMD ["node", "src/app.js"]