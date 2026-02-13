import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function loadObjectFromSource(relativePath, variableName) {
  const sourcePath = path.join(repoRoot, relativePath);
  const content = fs.readFileSync(sourcePath, "utf8");
  const pattern = new RegExp(`var\\s+${variableName}\\s*=\\s*(\\{[\\s\\S]*?\\});`);
  const match = content.match(pattern);
  if (!match) {
    throw new Error(`Could not parse ${variableName} from ${relativePath}`);
  }

  return Function(`"use strict"; return (${match[1]});`)();
}

const deviceModelMap = loadObjectFromSource("source/devices.js", "allDeviceTypes");
const linkTypeMap = loadObjectFromSource("source/links.js", "allLinkTypes");
const moduleTypeMap = loadObjectFromSource("source/modules.js", "allModuleTypes");

const topology = {
  devices: [],
  modules: [],
  links: [],
  pcIpConfigs: [],
  iosConfigs: [],
};

function asCodeString(value) {
  return JSON.stringify(value);
}

function buildScript() {
  const lines = [];

  for (const d of topology.devices) {
    lines.push(`addDevice(${asCodeString(d.name)}, ${asCodeString(d.model)}, ${d.x}, ${d.y});`);
  }

  for (const m of topology.modules) {
    lines.push(`addModule(${asCodeString(m.deviceName)}, ${asCodeString(m.slot)}, ${asCodeString(m.model)});`);
  }

  for (const l of topology.links) {
    lines.push(
      `addLink(${asCodeString(l.device1Name)}, ${asCodeString(l.device1Interface)}, ${asCodeString(l.device2Name)}, ${asCodeString(l.device2Interface)}, ${asCodeString(l.linkType)});`,
    );
  }

  for (const cfg of topology.pcIpConfigs) {
    lines.push(
      `configurePcIp(${asCodeString(cfg.deviceName)}, ${cfg.dhcpEnabled === undefined ? "undefined" : asCodeString(cfg.dhcpEnabled)}, ${cfg.ipAddress === undefined ? "undefined" : asCodeString(cfg.ipAddress)}, ${cfg.subnetMask === undefined ? "undefined" : asCodeString(cfg.subnetMask)}, ${cfg.defaultGateway === undefined ? "undefined" : asCodeString(cfg.defaultGateway)}, ${cfg.dnsServer === undefined ? "undefined" : asCodeString(cfg.dnsServer)});`,
    );
  }

  for (const c of topology.iosConfigs) {
    lines.push(`configureIosDevice(${asCodeString(c.deviceName)}, ${asCodeString(c.commands)});`);
  }

  return lines.join("\n");
}

function validateTopology() {
  const errors = [];
  const names = new Set();

  for (const d of topology.devices) {
    if (names.has(d.name)) {
      errors.push(`Duplicate device name: ${d.name}`);
    }
    names.add(d.name);

    if (!Object.hasOwn(deviceModelMap, d.model)) {
      errors.push(`Unknown Packet Tracer model '${d.model}' for device '${d.name}'.`);
    }
  }

  for (const l of topology.links) {
    if (!names.has(l.device1Name)) {
      errors.push(`Link references missing device '${l.device1Name}'.`);
    }
    if (!names.has(l.device2Name)) {
      errors.push(`Link references missing device '${l.device2Name}'.`);
    }
    if (!Object.hasOwn(linkTypeMap, l.linkType)) {
      errors.push(`Unknown link type '${l.linkType}'.`);
    }
  }

  for (const m of topology.modules) {
    if (!names.has(m.deviceName)) {
      errors.push(`Module assignment references missing device '${m.deviceName}'.`);
    }
    if (!Object.hasOwn(moduleTypeMap, m.model)) {
      errors.push(`Unknown module model '${m.model}'.`);
    }
  }

  for (const c of topology.pcIpConfigs) {
    if (!names.has(c.deviceName)) {
      errors.push(`PC config references missing device '${c.deviceName}'.`);
    }
  }

  for (const c of topology.iosConfigs) {
    if (!names.has(c.deviceName)) {
      errors.push(`IOS config references missing device '${c.deviceName}'.`);
    }
  }

  return errors;
}

function summarizeTopology() {
  return {
    counts: {
      devices: topology.devices.length,
      modules: topology.modules.length,
      links: topology.links.length,
      pcIpConfigs: topology.pcIpConfigs.length,
      iosConfigs: topology.iosConfigs.length,
    },
    deviceNames: topology.devices.map((d) => d.name),
  };
}

const server = new McpServer({
  name: "ptbuilder-mcp",
  version: "0.1.0",
  description: "Build Cisco Packet Tracer Builder JavaScript via MCP tools",
});

server.registerTool(
  "reset_topology",
  {
    description: "Clear the in-memory topology draft.",
    inputSchema: {},
  },
  async () => {
    topology.devices = [];
    topology.modules = [];
    topology.links = [];
    topology.pcIpConfigs = [];
    topology.iosConfigs = [];

    return {
      content: [{ type: "text", text: "Topology draft reset." }],
      structuredContent: summarizeTopology(),
    };
  },
);

server.registerTool(
  "add_device",
  {
    description: "Add a device for addDevice(name, model, x, y).",
    inputSchema: {
      name: z.string().min(1),
      model: z.string().min(1),
      x: z.number(),
      y: z.number(),
    },
  },
  async ({ name, model, x, y }) => {
    topology.devices.push({ name, model, x, y });

    return {
      content: [
        {
          type: "text",
          text: `Added device '${name}' (${model}) at (${x}, ${y}).`,
        },
      ],
      structuredContent: summarizeTopology(),
    };
  },
);

server.registerTool(
  "add_module",
  {
    description: "Add a module for addModule(deviceName, slot, model).",
    inputSchema: {
      deviceName: z.string().min(1),
      slot: z.number().int().nonnegative(),
      model: z.string().min(1),
    },
  },
  async ({ deviceName, slot, model }) => {
    topology.modules.push({ deviceName, slot, model });
    return {
      content: [{ type: "text", text: `Queued module ${model} for ${deviceName} slot ${slot}.` }],
      structuredContent: summarizeTopology(),
    };
  },
);

server.registerTool(
  "add_link",
  {
    description: "Add a link for addLink(device1Name, interface1, device2Name, interface2, linkType).",
    inputSchema: {
      device1Name: z.string().min(1),
      device1Interface: z.string().min(1),
      device2Name: z.string().min(1),
      device2Interface: z.string().min(1),
      linkType: z.string().min(1),
    },
  },
  async (input) => {
    topology.links.push(input);
    return {
      content: [{ type: "text", text: `Queued link ${input.device1Name}:${input.device1Interface} <-> ${input.device2Name}:${input.device2Interface}.` }],
      structuredContent: summarizeTopology(),
    };
  },
);

server.registerTool(
  "configure_pc_ip",
  {
    description: "Queue a configurePcIp call.",
    inputSchema: {
      deviceName: z.string().min(1),
      dhcpEnabled: z.boolean().optional(),
      ipAddress: z.string().optional(),
      subnetMask: z.string().optional(),
      defaultGateway: z.string().optional(),
      dnsServer: z.string().optional(),
    },
  },
  async (input) => {
    topology.pcIpConfigs.push(input);
    return {
      content: [{ type: "text", text: `Queued PC IP config for ${input.deviceName}.` }],
      structuredContent: summarizeTopology(),
    };
  },
);

server.registerTool(
  "configure_ios_device",
  {
    description: "Queue a configureIosDevice call with newline-delimited commands.",
    inputSchema: {
      deviceName: z.string().min(1),
      commands: z.string().min(1),
    },
  },
  async (input) => {
    topology.iosConfigs.push(input);
    return {
      content: [{ type: "text", text: `Queued IOS config for ${input.deviceName}.` }],
      structuredContent: summarizeTopology(),
    };
  },
);

server.registerTool(
  "validate_topology",
  {
    description: "Validate names/models against PT Builder dictionaries and references.",
    inputSchema: {},
  },
  async () => {
    const errors = validateTopology();
    const summary = summarizeTopology();
    if (errors.length === 0) {
      return {
        content: [{ type: "text", text: "Topology is valid." }],
        structuredContent: { ...summary, valid: true, errors: [] },
      };
    }

    return {
      content: [{ type: "text", text: `Topology has ${errors.length} validation error(s).` }],
      structuredContent: { ...summary, valid: false, errors },
      isError: true,
    };
  },
);

server.registerTool(
  "generate_builder_script",
  {
    description: "Generate JavaScript to paste into PT Builder and run.",
    inputSchema: {
      withValidation: z.boolean().default(true),
    },
  },
  async ({ withValidation }) => {
    if (withValidation) {
      const errors = validateTopology();
      if (errors.length > 0) {
        return {
          content: [{ type: "text", text: `Validation failed:\n- ${errors.join("\n- ")}` }],
          structuredContent: { valid: false, errors },
          isError: true,
        };
      }
    }

    const script = buildScript();
    return {
      content: [{ type: "text", text: script || "// Topology is empty." }],
      structuredContent: { script, ...summarizeTopology() },
    };
  },
);

server.registerTool(
  "list_packet_tracer_catalog",
  {
    description: "List supported models and link types sourced from PT Builder.",
    inputSchema: {
      kind: z.enum(["devices", "modules", "links"]),
      limit: z.number().int().positive().max(500).default(200),
      startsWith: z.string().default(""),
    },
  },
  async ({ kind, limit, startsWith }) => {
    const map = kind === "devices" ? deviceModelMap : kind === "modules" ? moduleTypeMap : linkTypeMap;
    const entries = Object.keys(map)
      .filter((k) => (startsWith ? k.toLowerCase().startsWith(startsWith.toLowerCase()) : true))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, limit);

    return {
      content: [{ type: "text", text: `${kind}: ${entries.length} item(s)` }],
      structuredContent: {
        kind,
        totalKnown: Object.keys(map).length,
        returned: entries.length,
        entries,
      },
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
