FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg

RUN chown node:node /app

USER node

COPY --chown=node:node package*.json ./

RUN npm install --ignore-scripts

COPY --chown=node:node . .

CMD ["node", "src/worker.js"]