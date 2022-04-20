FROM node:lts as dependencies
WORKDIR /lyrebird_arbitrage
COPY package.json package-lock.json ./
RUN npm install

FROM node:lts as builder
WORKDIR /lyrebird_arbitrage
COPY . .
COPY --from=dependencies /lyrebird_arbitrage/node_modules ./node_modules
RUN npm run build

FROM node:lts as runner
WORKDIR /lyrebird_arbitrage
COPY --from=builder /lyrebird_arbitrage/node_modules ./node_modules
COPY --from=builder /lyrebird_arbitrage/package.json ./package.json
COPY --from=builder /lyrebird_arbitrage/dist ./dist
COPY --from=builder /lyrebird_arbitrage/config ./config

CMD ["npm", "run", "arby"]
