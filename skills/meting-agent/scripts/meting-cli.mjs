import { parseArgs } from "node:util";
import { Lookup, platforms } from "./client.js";
import { operations } from "./operations.js";

function ReadOptions(parameters, args) {
  const entries = Object.entries(parameters);
  const options = Object.fromEntries(entries.map(([name]) => [name, { type: "string" }]));
  const { values } = parseArgs({ args, options });

  for (const [name, field] of entries) {
    const value = values[name];
    if (value === undefined && !field.required) {
      continue;
    }
    if (field.required && !value?.trim()) {
      throw new Error(`Missing value for --${name}.`);
    }
    if (field.choices && !field.choices.includes(value)) {
      throw new Error(`--${name} must be one of ${field.choices.join(", ")}.`);
    }
    if (field.integer) {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < 1 || number > (field.max ?? Infinity)) {
        throw new Error(
          `--${name} must be a positive integer${field.max ? " up to " + field.max : ""}.`,
        );
      }
      values[name] = number;
    }
  }
  return values;
}

function Usage(command, { parameters }) {
  const flags = Object.entries(parameters).map(([name, field]) => {
    const flag = `--${name} <${field.choices?.join("|") ?? (field.integer ? "n" : "text")}>`;
    return field.required ? flag : `[${flag}]`;
  });
  return [command, ...flags].join(" ");
}

async function Main([command, ...args]) {
  if (!command || ["-h", "--help"].includes(command)) {
    console.log("Usage: node meting-cli.mjs <command> [options]\n");
    for (const [name, spec] of Object.entries(operations)) {
      console.log(Usage(name, spec));
    }
    return;
  }
  if (!Object.hasOwn(operations, command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const spec = operations[command];
  if (args.length === 1 && ["-h", "--help"].includes(args[0])) {
    console.log(Usage(command, spec));
    return;
  }
  const input = ReadOptions(spec.parameters, args);
  const data = command === "platforms" ? platforms : await Lookup(command, input);
  console.log(JSON.stringify({ ok: true, command, platform: input.platform, data }, null, 2));
}

try {
  await Main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
