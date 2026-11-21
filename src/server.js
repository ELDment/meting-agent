import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import manifest from "../package.json" with { type: "json" };
import { Lookup, platforms } from "../skills/meting-agent/scripts/client.js";
import { operations } from "../skills/meting-agent/scripts/operations.js";

export { ResolveCookie } from "../skills/meting-agent/scripts/client.js";

export const serviceMetadata = {
  name: "meting-agent",
  version: manifest.projectVersion ?? manifest.version,
  title: "Meting Agent",
  description: manifest.description,
  websiteUrl: "https://www.npmjs.com/package/@eldment/meting-agent",
};

function Schema(field) {
  let schema;
  if (field.choices) {
    schema = z.enum(field.choices);
  } else if (field.integer) {
    schema = z.int().positive();
    if (field.max) {
      schema = schema.max(field.max);
    }
  } else {
    schema = field.required ? z.string().regex(/\S/, "Expected a non-blank string.") : z.string();
  }
  if (!field.required) {
    schema = schema.optional();
  }
  return field.description ? schema.describe(field.description) : schema;
}

function Result(body) {
  return { isError: !body.ok, content: [{ type: "text", text: JSON.stringify(body) }] };
}

export function CreateMcpServer() {
  const server = new McpServer(serviceMetadata);
  for (const [operation, { description, parameters }] of Object.entries(operations)) {
    const fields = Object.entries(parameters).map(([name, field]) => [name, Schema(field)]);
    const inputSchema = z.strictObject(Object.fromEntries(fields));
    server.registerTool(operation, { description, inputSchema }, async (input) => {
      if (operation === "platforms") {
        return Result({ ok: true, data: platforms });
      }
      const { platform } = input;
      try {
        return Result({ ok: true, operation, platform, data: await Lookup(operation, input) });
      } catch (error) {
        return Result({ ok: false, operation, platform, message: error.message });
      }
    });
  }
  return server;
}
