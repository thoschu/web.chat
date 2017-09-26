FROM phusion/baseimage

MAINTAINER <Tom S. >

RUN apt-get update
RUN apt-get -y upgrade

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

RUN apt-get install -y nodejs npm git

COPY . /usr/src/app
RUN npm install

EXPOSE 3000
CMD ["npm","start"]
