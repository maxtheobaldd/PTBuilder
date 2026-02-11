# PTBuilder MCP Server

This MCP server lets an LLM assemble a Packet Tracer topology and generate JavaScript for this project's Packet Tracer extension.

## Why this architecture?

Packet Tracer Script Modules run in Packet Tracer's internal JavaScript runtime (`ipc.appWindow()`, `ipc.network()`, `webViewManager`, etc.). The MCP server runs outside Packet Tracer, so this server produces code that can be executed by **Builder Code Editor** instead of attempting unsupported direct IPC from Node.

## Tools

- `reset_topology`
- `add_device`
- `add_module`
- `add_link`
- `configure_pc_ip`
- `configure_ios_device`
- `validate_topology`
- `generate_builder_script`
- `list_packet_tracer_catalog`

Catalog data is loaded directly from:

- `source/devices.js`
- `source/modules.js`
- `source/links.js`

## Run locally

```bash
cd mcp-server
npm install
npm start
```

The server uses stdio transport and is ready to be wired into any MCP client.

## Example MCP workflow

1. `reset_topology`
2. `add_device` for all nodes
3. `add_link` for all cables
4. optional `configure_*` tools
5. `validate_topology`
6. `generate_builder_script`
7. Paste script into Packet Tracer **Extensions → Builder Code Editor** and run.
