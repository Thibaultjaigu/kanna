import { useEffect, useState } from "react"
import { Check, Loader2, Network, X } from "lucide-react"
import type { SubagentActivity } from "../../../../shared/types"
import { WidgetList, WidgetRow } from "./parts"
import { SwapIn, WidgetCard } from "./WidgetCard"

/**
 * Work the agent delegated this turn: subagents, background shells, monitors.
 *
 * The main agent's result lands as soon as *it* stops, so a turn can read as
 * finished while the work it kicked off runs on. This widget makes that
 * visible: while anything is running the chat is not done, whatever the turn
 * status says.
 */

/** Elapsed time, re-rendered on a 1s tick only while something is running. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

/** "3 of 5 running" while some run, "3 running" while all do, then the total. */
export function formatAgentsCount(subagents: readonly SubagentActivity[]): string {
  const running = subagents.filter((agent) => agent.status === "running").length
  if (running === 0) return String(subagents.length)
  return running === subagents.length ? `${running} running` : `${running} of ${subagents.length} running`
}

const STATUS_ICON: Record<SubagentActivity["status"], { Icon: typeof Check; className: string; label: string }> = {
  // The same red spinner a running chat shows in the sidebar.
  running: { Icon: Loader2, className: "animate-spin text-logo", label: "Running" },
  completed: { Icon: Check, className: "text-success", label: "Done" },
  failed: { Icon: X, className: "text-destructive", label: "Failed" },
}

export function AgentsWidget({
  subagents,
  toolIds,
  onJumpToToolCall,
}: {
  subagents: readonly SubagentActivity[]
  /** Subagent id → the tool call that spawned it, for the ones found in the loaded transcript. */
  toolIds: ReadonlyMap<string, string>
  onJumpToToolCall: (toolId: string) => void
}) {
  const now = useNow(subagents.some((agent) => agent.status === "running"))
  return (
    <WidgetCard
      // Static: the rows already spin for what is running, and a spinning
      // header too read as the main agent being busy.
      icon={<Network />}
      title="Agents"
      count={formatAgentsCount(subagents)}
    >
      <WidgetList>
        {subagents.map((agent) => {
          const { Icon, className, label } = STATUS_ICON[agent.status]
          const toolId = toolIds.get(agent.id)
          return (
            <WidgetRow
              key={agent.id}
              icon={(
                <SwapIn swapKey={agent.status}>
                  <Icon role="img" className={className} aria-label={label} />
                </SwapIn>
              )}
              title={agent.label}
              meta={formatElapsed((agent.endedAt ?? now) - agent.startedAt)}
              // Opens the chat at the call that spawned it: a list of labels
              // with timers otherwise leaves "where is that?" open.
              onActivate={toolId ? () => onJumpToToolCall(toolId) : undefined}
              tooltip={toolId ? `${agent.label}: show in chat` : agent.label}
            />
          )
        })}
      </WidgetList>
    </WidgetCard>
  )
}
