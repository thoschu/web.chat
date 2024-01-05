FROM node:18-alpine

MAINTAINER <Tom S. | thoschulte@gmail.com>

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Install app dependencies
COPY package.json /usr/src/app/
RUN npm install

# Bundle app source
COPY . /usr/src/app

EXPOSE 3000

#HEALTHCHECK --interval=5m --timeout=3s CMD curl -f http://localhost:3000 || exit 1
HEALTHCHECK CMD curl --fail http://localhost:3000 || exit 1

CMD ["npm","start"]
