FROM node:22-alpine

WORKDIR /app
RUN chown node:node /app

USER node

COPY --chown=node:node src/ src/
COPY --chown=node:node package*.json ./

RUN npm install --ignore-scripts

CMD ["node", "src/app.js"]