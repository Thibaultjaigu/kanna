import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { KannaToolHost } from "./kanna-tools"
import { createKannaMcpServer } from "./kanna-mcp"

export async function createCursorKannaTools(host: KannaToolHost) {
  const directory = await mkdtemp(path.join(tmpdir(), "kanna-cursor-tools-"))
  const server = createKannaMcpServer(host)
  const close = () => {
    server.close()
    void rm(directory, { recursive: true, force: true }).catch(() => {})
  }
  try {
    // A private plugin binds this process to this chat without changing project MCP settings.
    await mkdir(path.join(directory, ".cursor-plugin"))
    await writeFile(path.join(directory, ".cursor-plugin/plugin.json"), JSON.stringify({
      name: "kanna-tools",
      version: "1.0.0",
      description: "Tools for the current Kanna chat.",
    }))
    await writeFile(path.join(directory, "mcp.json"), JSON.stringify({
      mcpServers: {
        kanna: { url: server.url, headers: server.headers },
      },
    }), { mode: 0o600 })
    return { directory, close }
  } catch (error) {
    close()
    throw error
  }
}
