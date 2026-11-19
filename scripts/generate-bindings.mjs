import { spawnSync } from "node:child_process";

const nodeVersion = process.versions.node.match(/^22\.(\d+)\.(\d+)$/);
if (!nodeVersion || Number(nodeVersion[1]) < 23 || (Number(nodeVersion[1]) === 23 && Number(nodeVersion[2]) < 4)) {
  console.error(`Use Node.js 22.23.4 or newer in the 22.x line; found ${process.versions.node}`);
  process.exit(1);
}

const cli = process.env.SPACETIME_CLI || process.env.SPACETIME || "spacetime";
const version = spawnSync(cli, ["--version"], { encoding: "utf8" });
const output = (version.stdout ?? "") + (version.stderr ?? "");
if (version.error || version.status !== 0 || !/\b(?:tool version|spacetime(?:db)?)\s+2\.15\.0\b/i.test(output)) {
  console.error("Binding generation requires SpacetimeDB CLI 2.15.0. Install/select it or set SPACETIME_CLI to its executable.");
  console.error(version.error?.message || output.trim());
  process.exit(1);
}

const result = spawnSync(cli, [
  "generate", "--lang", "typescript", "--out-dir", "src/module_bindings",
  "--module-path", "server/spacetimedb", "--yes",
], { stdio: "inherit", windowsHide: true });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
