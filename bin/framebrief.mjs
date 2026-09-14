#!/usr/bin/env node
const command = process.argv[2];
const usage = "Usage: framebrief serve --workspace /absolute/path/to/project [--port 5174]\n";
if (["--help", "-h", "help"].includes(command)) process.stdout.write(usage);
else if (command !== "serve") { process.stderr.write(usage); process.exitCode = 1; }
else await import("../dist-server/standalone-server.js");
