import { LoaderCircle, RefreshCw } from "lucide-react"
import type { AgentProvider } from "../../../../shared/types"
import type { KannaSocket } from "../../../app/socket"
import {
  formatPercent,
  formatUntil,
  planLabel,
  providerLabel,
  UsageBar,
  UsageWindowRows,
  useUsageLimits,
} from "../../../app/settings/UsageSection"
import { formatRelativeTime } from "../../../lib/formatters"
import { PROVIDER_ICONS } from "../ChatPreferenceControls"
import { Button } from "../../ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import { useWidgetExpanded, WidgetCard, WidgetPresence } from "./WidgetCard"

/**
 * The selected harness's usage limits, in the column's own card rather than
 * Settings' ProviderCard, so its header lines up with every other widget's.
 * Only when that harness reports limits: a harness without any (or with
 * nothing read yet) leaves no empty card at the bottom of the column.
 *
 * Collapsed, the header carries the first limit: when it resets, its bar and
 * its percent. Open, the header names the plan ("Personal max") and holds
 * the refresh button, and the body lists every window.
 */
export function UsageWidget({
  projectId,
  socket,
  active,
  provider,
}: {
  projectId: string
  socket: KannaSocket
  /** Refreshes only while the widget column is open. */
  active: boolean
  provider: AgentProvider
}) {
  const { snapshot, refreshing, refresh } = useUsageLimits(socket, active)
  const usage = snapshot?.providers.find((entry) => entry.provider === provider)
  const hasContent = Boolean(usage && (usage.windows.length > 0 || usage.credits))
  const [expanded, setExpanded] = useWidgetExpanded(projectId, "usage", usage?.windows.length ?? 0)

  if (!usage) return <WidgetPresence show={false}>{null}</WidgetPresence>

  const Icon = PROVIDER_ICONS[usage.provider]
  const summaryWindow = usage.windows[0] ?? null
  const summaryResets = summaryWindow?.resetsAt ? formatUntil(summaryWindow.resetsAt) : null
  const plan = planLabel(usage)
  const updated = usage.updatedAt ? `Updated ${formatRelativeTime(usage.updatedAt)}` : null

  const collapsedSummary = summaryWindow ? (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 pr-1">
          {/* Bare ("2h"); the tooltip says "Resets in 2h". */}
          {summaryResets ? (
            <span className="text-xs tabular-nums text-muted-foreground">{summaryResets.replace(/^in /, "")}</span>
          ) : null}
          <div className="w-16 py-1.5">
            <UsageBar usedPercent={summaryWindow.usedPercent} />
          </div>
          <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
            {formatPercent(summaryWindow.usedPercent)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        <div>{summaryWindow.label}</div>
        {summaryResets ? <div className="text-muted-foreground">Resets {summaryResets}</div> : null}
      </TooltipContent>
    </Tooltip>
  ) : null

  // The Branch card's Fetch button, glyph and all: the same act (re-read
  // something remote) looks the same in both headers.
  const refreshButton = (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Refresh usage"
          onClick={() => {
            if (!refreshing) void refresh(true)
          }}
          disabled={refreshing}
          className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground hover:!bg-transparent hover:!border-border/0"
        >
          {refreshing ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{refreshing ? "Refreshing…" : updated ?? "Refresh usage"}</TooltipContent>
    </Tooltip>
  )

  return (
    <WidgetPresence show={hasContent}>
      <WidgetCard
        icon={<Icon />}
        title={providerLabel(usage.provider)}
        // Muted after the title, like the Branch card's branch name.
        count={expanded && plan ? <span className="capitalize">{plan}</span> : undefined}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        actions={expanded ? refreshButton : collapsedSummary}
      >
        <UsageWindowRows snapshot={usage} compact className="px-3 py-3" />
      </WidgetCard>
    </WidgetPresence>
  )
}
