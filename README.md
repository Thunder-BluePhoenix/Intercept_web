# Intercept Web

Intercept Web is an application designed to capture, transmit, and record both system audio and microphone input simultaneously. Built with a Node.js backend and a Vite-based frontend, it streams audio data over WebSockets directly from the browser and mixes it remotely using FFmpeg.

## Features

- **Dual-Stream Audio Capture**: Simultaneously record system audio and microphone input.
- **Real-Time WebSocket Streaming**: Stream audio channels continuously to the backend via WebSockets.
- **Server-Side Audio Mixing**: Uses `fluent-ffmpeg` to mix both audio streams into a single, synchronized `.mp3` output file upon completion.
- **Secure Handling for External Devices**: Properly handles HTTPS requirements (essential for capturing microphone and system audio on modern mobile browsers).

## Project Structure

- **`/frontend`**: A Vite-based web frontend that runs in the browser, capturing audio inputs and streaming them.
- **`/backend`** or root-level scripts: An Express-based backend with a WebSocket server to receive `webm` streams and manage the file saving/mixing process.
- **`/streams`**: The default output directory on the server where raw and mixed `.mp3` files are saved.

## Prerequisites

- **Node.js**: v18 or newer recommended.
- **FFmpeg**: The server relies on FFmpeg being installed and available in the system's `PATH` to merge the audio streams.

## Getting Started

### 1. Backend Setup

From the root directory:

```bash
# Install dependencies
npm install

# Start the Node.js server
npm start
```

The server will typically start on `http://localhost:3000`.

### 2. Frontend Setup

Navigate to the `frontend` directory:

```bash
cd frontend

# Install dependencies
npm install

# Start the Vite development server
npm run dev
```

### 3. HTTPS and Mobile Access

For mobile browsers to permit microphone and system audio capture, the application must be served over a secure context (HTTPS) or `localhost`. If deploying on a local network for external device testing, you will need to set up a self-signed certificate for the local network IP.

## How It Works

1. The client establishes a WebSocket connection with the server.
2. The browser captures media via the MediaStream API and sends chunks of binary audio (identifying the stream type via custom binary prefixes) over the WebSocket.
3. The server receives the binary data and funnels it into separate `.webm` files (`mic` and `sys`).
4. Upon closing the connection, the server utilizes `ffmpeg` to mix both tracks into a `_mixed.mp3` file, retaining the longest duration across both streams.

## License

This project is licensed under the [GPL-3.0 License](LICENSE).
