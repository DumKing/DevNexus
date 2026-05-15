#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";

const bind = process.env.LAN_CHAT_COORDINATOR_BIND ?? "0.0.0.0";
const port = Number(process.env.LAN_CHAT_COORDINATOR_PORT ?? "45882");
const token = process.env.LAN_CHAT_COORDINATOR_TOKEN ?? "";
const leaseMs = Number(process.env.LAN_CHAT_COORDINATOR_LEASE_MS ?? "15000");

const clients = new Set();
const devices = new Map();

function nowIso() {
  return new Date().toISOString();
}

function cleanupDevices() {
  const cutoff = Date.now() - leaseMs;
  for (const [deviceId, item] of devices.entries()) {
    if (item.seenAt < cutoff) {
      devices.delete(deviceId);
    }
  }
}

function snapshot() {
  cleanupDevices();
  return {
    type: "snapshot",
    devices: Array.from(devices.values()).map((item) => ({
      deviceId: item.deviceId,
      nickname: item.nickname,
      host: item.host,
      port: item.port,
      clientVersion: item.clientVersion,
      lastSeen: item.lastSeen,
    })),
  };
}

function encodeFrame(value) {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length > 65535) {
    throw new Error("payload too large");
  }
  const header = payload.length < 126
    ? Buffer.from([0x81, payload.length])
    : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 0xff]);
  return Buffer.concat([header, payload]);
}

function send(socket, value) {
  if (!socket.writable || socket.destroyed) return;
  socket.write(encodeFrame(value));
}

function broadcast() {
  const payload = snapshot();
  for (const socket of clients) {
    send(socket, payload);
  }
}

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      throw new Error("large websocket frames are not supported");
    }
    if (!masked || cursor + 4 + length > buffer.length) break;
    const mask = buffer.subarray(cursor, cursor + 4);
    cursor += 4;
    const payload = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
      payload[index] = buffer[cursor + index] ^ mask[index % 4];
    }
    frames.push({ opcode, text: payload.toString("utf8") });
    offset = cursor + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

function handleMessage(socket, text) {
  const payload = JSON.parse(text);
  if (payload.type !== "register") return;
  if (token && payload.token !== token) {
    send(socket, { type: "error", message: "invalid token" });
    socket.end();
    return;
  }
  const device = payload.device ?? {};
  const deviceId = String(device.deviceId ?? "").trim();
  const nickname = String(device.nickname ?? "").trim();
  const host = String(device.host ?? "").trim();
  const portValue = Number(device.port ?? 0);
  if (!deviceId || !nickname || !host || !Number.isInteger(portValue) || portValue <= 0 || portValue > 65535) {
    send(socket, { type: "error", message: "invalid device registration" });
    return;
  }
  devices.set(deviceId, {
    deviceId,
    nickname,
    host,
    port: portValue,
    clientVersion: device.clientVersion ? String(device.clientVersion) : undefined,
    lastSeen: nowIso(),
    seenAt: Date.now(),
  });
  broadcast();
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    cleanupDevices();
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, devices: devices.size }));
    return;
  }
  response.writeHead(404);
  response.end("not found");
});

server.on("upgrade", (request, socket) => {
  if (request.url !== "/ws") {
    socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
    return;
  }
  const key = request.headers["sec-websocket-key"];
  if (!key) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }
  const accept = crypto
    .createHash("sha1")
    .update(String(key) + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));
  clients.add(socket);
  send(socket, snapshot());

  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    try {
      pending = Buffer.concat([pending, chunk]);
      const decoded = decodeFrames(pending);
      pending = decoded.rest;
      for (const frame of decoded.frames) {
        if (frame.opcode === 0x8) {
          socket.end();
          return;
        }
        if (frame.opcode === 0x1) {
          handleMessage(socket, frame.text);
        }
      }
    } catch (error) {
      send(socket, { type: "error", message: error instanceof Error ? error.message : String(error) });
      socket.end();
    }
  });
  socket.on("close", () => clients.delete(socket));
  socket.on("error", () => clients.delete(socket));
});

setInterval(broadcast, Math.max(3000, Math.floor(leaseMs / 3))).unref();

server.listen(port, bind, () => {
  console.log(`DevNexus LAN Chat coordinator listening on ws://${bind}:${port}/ws`);
});
