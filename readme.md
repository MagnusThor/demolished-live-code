# demolished-live-code: Real-Time WGSL Shader Playground with WebGPU and WebRTC

This repository contains the complete source code for a live-coding environment that allows users to instantly compile and run WebGPU Shading Language (WGSL) shaders, render the output to a canvas, and broadcast the result—along with mic/camera—in real-time using WebRTC.

The primary goal of this project is to demonstrate a high-performance, low-latency workflow for collaborative graphics development.


## 🛠️ Local Setup and Execution

This project is built using Node.js, Express, and TypeScript. You need to compile the TypeScript source files before running the server.

### Prerequisites

* Node.js (LTS recommended)
* A modern browser with WebGPU support (e.g., Chrome, Edge, Firefox Nightly)

### Installation

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/MagnusThor/demolished-live-code](https://github.com/MagnusThor/demolished-live-code) demolished-live-code
    cd demolished-live-code
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Build the Application:**
    This step compiles the TypeScript source code into the necessary JavaScript files in the `build/` directory.
    ```bash
    npm run build
    ```

4.  **Start the Server:**
    ```bash
    npm start
    ```

### Usage

1.  **Broadcaster View:** Navigate to `http://localhost:1337/` (or the port specified in your server configuration) to access the live-coding editor.
2.  **Spectator View:** Share the generated stream URL (which will include a UUID) with a spectator, or open a second tab/device to view the stream.

The server handles WebRTC signaling, allowing the browser to establish a direct, peer-to-peer connection for streaming the GPU output.

