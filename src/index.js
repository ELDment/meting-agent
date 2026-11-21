#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CreateMcpServer, serviceMetadata } from "./server.js";

const [option] = process.argv.slice(2);
if (option === "--version" || option === "-v") {
  console.log(serviceMetadata.version);
} else if (option === "--help" || option === "-h") {
  console.log("Usage: meting-agent [--help | --version]\nStarts the MCP server over stdio.");
} else if (option) {
  console.error(`Unknown option: ${option}`);
  process.exitCode = 1;
} else {
  const server = CreateMcpServer();
  await server.connect(new StdioServerTransport());
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
  }
}
