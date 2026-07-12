FROM node:22-alpine

RUN addgroup -S nonroot \
    && adduser -S nonroot -G nonroot

USER nonroot

WORKDIR /app

COPY package*.json ./

RUN npm install --ignore-scripts

COPY . .

EXPOSE 3005

CMD ["npm", "start"]