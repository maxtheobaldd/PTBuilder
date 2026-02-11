# Packet Tracer extension research notes

This repository demonstrates a Cisco Packet Tracer Script Module (`Builder.pts`) that runs JavaScript inside Packet Tracer and uses Packet Tracer's `ipc` API.

## External references reviewed

- NetAcad Packet Tracer overview/download page (product + ecosystem context): https://www.netacad.com/courses/packet-tracer
- PTBuilder repository/wiki (practical extension patterns): https://github.com/kimmknight/PTBuilder
- Model Context Protocol introduction/spec context: https://modelcontextprotocol.io/introduction

## What PTBuilder shows about Packet Tracer scripting

From `source/*.js` in this repo, Packet Tracer exposes host objects such as:

- `ipc.appWindow()` for UI integration and workspace access.
- `ipc.network()` for device enumeration and direct device handle access.
- `webViewManager.createWebView(...)` to host extension UI.
- `_ScriptModule.unregisterIpcEventByID(...)` for menu event cleanup.

### Core network automation primitives used

- Device creation through `getLogicalWorkspace().addDevice(type, model, x, y)`.
- Link creation through `getLogicalWorkspace().createLink(...)`.
- Per-device operations via `ipc.network().getDevice(name)` including:
  - `setName`
  - `skipBoot`
  - `addModule`
  - `getPort(...).setIpSubnetMask(...)`
  - `setDhcpFlag`, `setDefaultGateway`, `setDnsServerIp`
  - `enterCommand(...)` for IOS CLI injection

## Implications for an MCP design

Packet Tracer extensions execute *inside* Packet Tracer, while MCP servers run as external processes. The most robust cross-boundary strategy in this repository is:

1. Use MCP tools to build a topology plan.
2. Emit PTBuilder-compatible JavaScript.
3. Run that generated JavaScript in the existing Builder Code Editor module.

This avoids undocumented inter-process coupling and directly reuses the APIs already proven in PTBuilder.
