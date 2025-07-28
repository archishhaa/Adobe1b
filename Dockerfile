FROM node:18-slim

WORKDIR /app

# Copy deps and install
COPY package*.json ./
RUN npm install --production

# Copy source
COPY . .

# Default command
CMD ["node", "extract.js"]
