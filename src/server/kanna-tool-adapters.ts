import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import type { ToolDefinition } from "@mariozechner/pi-coding-agent"
import type { TSchema } from "typebox"
import { KANNA_TOOLS, kannaToolSpecs, type KannaToolHost } from "./kanna-tools"

export function createClaudeKannaTools(host: KannaToolHost) {
  return createSdkMcpServer({
    name: "kanna",
    alwaysLoad: true,
    tools: KANNA_TOOLS.map((definition) => tool(
      definition.name,
      definition.description,
      definition.schema.shape,
      async (input) => host.execute(definition.name, input),
    )),
  })
}

function piSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(piSchema)
  if (!schema || typeof schema !== "object") return schema
  const result = Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, piSchema(value)]))
  const variants = result.anyOf
  if (Array.isArray(variants) && variants.length > 0 && variants.every(variant =>
    variant && typeof variant === "object" && Object.keys(variant).length === 1
    && ["string", "number", "integer", "boolean", "null"].includes(variant.type),
  )) {
    // Pi coerces anyOf values into the first matching branch, which turns chart numbers into strings.
    // A type array accepts the same values and preserves their types, including null and numeric category labels.
    result.type = [...new Set(variants.map(variant => variant.type))]
    delete result.anyOf
  }
  return result
}

export function createPiKannaTools(host: KannaToolHost): ToolDefinition[] {
  return kannaToolSpecs().map((definition) => ({
    name: definition.name,
    label: definition.name,
    description: definition.description,
    promptSnippet: definition.description,
    parameters: piSchema(definition.inputSchema) as TSchema,
    async execute(_callId, input, signal) {
      const result = await host.execute(definition.name, input, signal)
      if (result.isError) throw new Error(result.content.map((block) => block.text).join("\n"))
      return { content: result.content, details: result.structuredContent ?? {} }
    },
  }))
}
