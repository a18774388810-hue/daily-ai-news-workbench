import { spawn } from "node:child_process";

const children = [
  spawn(process.execPath, ["--watch", "server/index.js"], { stdio: "inherit", env: process.env }),
  spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev:client"], { stdio: "inherit", env: process.env }),
];

let stopping = false;
function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop(signal));
for (const child of children) child.on("exit", (code) => {
  if (!stopping && code) { stop(); process.exitCode = code; }
});
