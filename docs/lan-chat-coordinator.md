# LAN Chat WebSocket Coordinator

This experimental coordinator improves LAN Chat device discovery when UDP broadcast is unreliable. It does not forward chat text, files, or media. DevNexus clients still send messages directly over the LAN with the existing P2P transport.

## Run

```bash
LAN_CHAT_COORDINATOR_TOKEN=change-me \
LAN_CHAT_COORDINATOR_BIND=0.0.0.0 \
LAN_CHAT_COORDINATOR_PORT=45882 \
node tools/lan-chat-coordinator.mjs
```

Health check:

```bash
curl http://server:45882/health
```

WebSocket endpoint:

```text
ws://server:45882/ws
```

## DevNexus Client Settings

Open LAN Chat settings and enable `WebSocket coordinator`.

- `Coordinator URL`: `ws://server:45882/ws`
- `Coordinator token`: the same value as `LAN_CHAT_COORDINATOR_TOKEN`
- `Advertise LAN host`: the LAN IP other devices can use to reach this computer, for example `192.168.1.23`

When connected, the client registers its device ID, nickname, LAN host, and LAN Chat port. The coordinator returns a live snapshot of other devices. DevNexus merges those devices into the existing LAN Chat device list, so direct chat and public-room fanout continue to use local TCP/UDP.

## Protocol

Client registration:

```json
{
  "type": "register",
  "token": "change-me",
  "device": {
    "deviceId": "AA:BB:CC:DD:EE:FF",
    "nickname": "Alice",
    "host": "192.168.1.23",
    "port": 45881,
    "clientVersion": "0.9.3"
  }
}
```

Server snapshot:

```json
{
  "type": "snapshot",
  "devices": [
    {
      "deviceId": "AA:BB:CC:DD:EE:FF",
      "nickname": "Alice",
      "host": "192.168.1.23",
      "port": 45881,
      "clientVersion": "0.9.3",
      "lastSeen": "2026-05-16T00:00:00.000Z"
    }
  ]
}
```

The in-memory lease defaults to 15 seconds and can be changed with `LAN_CHAT_COORDINATOR_LEASE_MS`.
