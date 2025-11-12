FROM node:20-alpine
RUN apk add --no-cache git

COPY ./ /make-sense

RUN cd /make-sense && \
  npm install

WORKDIR /make-sense

ENTRYPOINT ["npm", "run", "dev"]
