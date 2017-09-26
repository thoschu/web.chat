FROM node:argon

MAINTAINER <Tom S. >

RUN apt-get update
RUN apt-get -y upgrade

# Create app directory
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

# Bundle app source
COPY . /usr/src/app

# Install app dependencies
# COPY package.json /usr/src/app/
RUN npm install



EXPOSE 3000
CMD ["npm","start"]
