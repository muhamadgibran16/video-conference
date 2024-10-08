# Use Node.js base image version 18
FROM node:18-alphine

# Set the working directory in the container
WORKDIR /app

# Copy the entire content from the local directory
ADD . /app

# Copy package.json and package-lock.json files
COPY package*.json ./

# Install Dependencies
RUN npm install

# Copy the application source code
COPY . .

# Specify the port
EXPOSE 8888

# Run the application
CMD ["node", "app.js"]