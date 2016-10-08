iFROM ubuntu:latest

MAINTAINER <Tom S.>

RUN apt-get update
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

RUN apt-get install -y nodejs npm git
RUN apt-get update

COPY . /usr/src/app
RUN npm install

EXPOSE 3000
CMD ["npm","start"]
