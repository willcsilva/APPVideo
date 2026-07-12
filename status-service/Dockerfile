FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

#RUN npm install
RUN npx --ignore-scripts some-package
RUN npm exec --ignore-scripts -- some-package

COPY . .

EXPOSE 3005

CMD ["npm", "start"]