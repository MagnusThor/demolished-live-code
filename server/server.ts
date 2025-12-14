import * as dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import http, { IncomingMessage } from 'http';
import https from 'https';
import path from 'path';
import { ThorIOServer } from 'thor-io.vnext';
import webSocket from 'ws';
import { ConferenceController } from './controllers/ConferenceController';


console.clear();
dotenv.config();
console.log(`Let's bring things to life..`);

let rootPath = path.resolve(".");
let clientPath = path.join(rootPath, "public");
let port = process.env.PORT || 1337;

let httpServer: http.Server | https.Server;
let app = express();

// Create a new ThorIO Server (instance) ,register the ConferenceController
const thorio = ThorIOServer.createInstance([ConferenceController]);

// Set up route to the client served on express
if (fs.existsSync(clientPath)) {
  console.log(`Serving client files from ${clientPath}.`);
  app.use("/", express.static(clientPath));
} else {
  console.log(`Serving no client files.`);
  
  app.get("/", (_, res) => {
    res.send("WebSocket Server is running")
  });
}

httpServer = http.createServer((req, res) => {
  app(req, res);
});

const ws = new webSocket.Server({ server: httpServer });

// pass the WebSockets to the ThorIO instance
ws.on("connection", (ws, req:IncomingMessage) => {
  console.log(`Socket connected with the origin ${req.headers.origin}`);
  thorio.addWebSocket(ws, req)}
 );

 ws.on("close", () => {
  console.log(`Socket closed.. `);
});

httpServer.listen(port);

console.log(`The shit is listening on ${port} - Enjoy `);