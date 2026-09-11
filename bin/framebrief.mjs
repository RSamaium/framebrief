#!/usr/bin/env node
const command = process.argv[2];
if (command !== "serve") { process.stderr.write("Usage: framebrief serve --workspace /chemin/vers/projet [--port 5174]\n"); process.exitCode = 1; }
else await import("../dist-server/standalone-server.js");
