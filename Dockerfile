FROM node:22-alpine AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable && yarn install --frozen-lockfile

COPY abi ./abi
COPY src ./src
COPY tsconfig.json ./
RUN yarn build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable \
	&& yarn install --frozen-lockfile --production \
	&& yarn cache clean

COPY --from=build --chown=node:node /app/dist ./dist

USER node

CMD ["node", "dist/start-auto-claimer.js"]
