FROM node:18-alpine

MAINTAINER <Tom S. | thoschulte@gmail.com>

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json /usr/src/app/
RUN npm install

# Install packages
RUN apk add curl && apk add nano

# Bundle app source
COPY . /usr/src/app

EXPOSE 3000

HEALTHCHECK --interval=60s --timeout=60s --start-period=180s CMD curl --fail http://localhost:3000/ping || exit 1

CMD ["npm", "start"]
