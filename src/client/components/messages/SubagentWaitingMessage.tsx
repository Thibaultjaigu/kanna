import { Loader2 } from "lucide-react"
import { MetaRow, MetaContent } from "./shared"
import { AnimatedShinyText } from "../ui/animated-shiny-text"
import type { SubagentActivity } from "../../../shared/types"

/**
 * What the chat is still waiting on, in the transcript's own footer.
 *
 * The composer pill says the same thing, but this is the line that answers the
 * question the transcript actually raises: the main agent has stopped talking,
 * the turn reads as over, and the last message sits there looking final. This
 * takes the slot `ProcessingMessage` vacates, so the place that said
 * "Running..." keeps speaking until the delegated work is genuinely done.
 */
export function SubagentWaitingMessage({ subagents }: { subagents: readonly SubagentActivity[] }) {
  const running = subagents.filter((agent) => agent.status === "running")
  if (running.length === 0) return null

  // One agent is worth naming; several would run past the line, so they count.
  const label = running.length === 1
    ? `Waiting on ${running[0]!.label}...`
    : `Waiting on ${running.length} agents...`

  return (
    <MetaRow className="ml-[1px] mt-3">
      <MetaContent>
        <Loader2 className="size-4.5 animate-spin text-muted-icon" />
        <AnimatedShinyText className="ml-[1px] text-sm" shimmerWidth={44}>
          {label}
        </AnimatedShinyText>
      </MetaContent>
    </MetaRow>
  )
}
