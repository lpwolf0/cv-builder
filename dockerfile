
FROM node:22-bookworm

WORKDIR /app

# Install project dependencies
COPY package*.json ./
RUN npm install

# Install Chromium and its Linux dependencies
RUN npx playwright install --with-deps chromium

# Copy the application
COPY . .

ENV NODE_ENV=production

EXPOSE 10000

CMD ["npm", "start"]
