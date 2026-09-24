import { type RefObject, useState } from "react"
import { Check, Copy, GitCommitHorizontal, GitMerge } from "lucide-react"
import type { ChatBranchHistoryEntry, ChatCommitDetails } from "../../../../shared/types"
import { cn } from "../../../lib/utils"
import { formatPromptTimestamp } from "../../messages/ResultMessage"
import { TURN_CARD_ROW_INSET, TurnCardMessage, TurnCardMetaRow, TurnCardMetaSeparator } from "../../ui/turn-card"
import { useCardDetails, WidgetHoverCard } from "../widgets/WidgetHoverCard"
import { DiffFileStat } from "./shared"

// Commits never change, so a card read once is good for the session.
const detailsCache = new Map<string, ChatCommitDetails>()

/**
 * A commit's card: the full message, who and when, its checks, and the files
 * it changed. Everything the History row has to truncate or leave out.
 */
export function CommitHoverCardContent({
  entry,
  details,
  isPendingPush,
  onOpenCommit,
  onOpenChecks,
  onOpenFile,
}: {
  entry: ChatBranchHistoryEntry
  /** What the server adds; absent until the read lands (or if it fails). */
  details: ChatCommitDetails | null
  isPendingPush: boolean
  onOpenCommit?: () => void
  onOpenChecks?: () => void
  onOpenFile?: (path: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const shortSha = entry.sha.slice(0, 7)
  const isMerge = (details?.parentCount ?? 0) > 1
  const hiddenFiles = details ? details.totalFileCount - details.files.length : 0

  // Author, age, checks, tags and "not pushed" are on the History row; the
  // card carries what the row can't: the hash, a merge, a committer who isn't
  // the author, the exact time, the whole message and the files.
  return (
    <>
      <TurnCardMetaRow>
        <button
          type="button"
          aria-label={`Copy ${entry.sha}`}
          onClick={() => {
            void navigator.clipboard?.writeText(entry.sha)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1_200)
          }}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-sm font-mono transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {isMerge ? <GitMerge className="size-2.5 shrink-0" strokeWidth={2.5} /> : <GitCommitHorizontal className="size-2.5 shrink-0" strokeWidth={2.5} />}
          {shortSha}
          {copied ? <Check className="size-2.5 shrink-0 text-success" strokeWidth={2.5} /> : <Copy className="size-2.5 shrink-0 opacity-60" strokeWidth={2.5} />}
        </button>
        {isMerge ? (
          <>
            <TurnCardMetaSeparator />
            <span className="shrink-0">Merge</span>
          </>
        ) : null}
        {details?.committerName ? (
          <>
            <TurnCardMetaSeparator />
            <span className="truncate">committed by {details.committerName}</span>
          </>
        ) : null}
        <span className="ml-auto shrink-0 pl-2" title={details?.authorEmail}>{formatPromptTimestamp(entry.authoredAt)}</span>
      </TurnCardMetaRow>
      {/* The whole message, which the row cuts to one line: the subject in the
          prompt's weight, the body under it like a reply. Opens the commit on
          GitHub when the repo is there, as the row does. */}
      <div className="mt-1 space-y-1">
        <TurnCardMessage
          className="line-clamp-3 text-sm font-medium text-popover-foreground"
          label="Open this commit on GitHub"
          onSelect={onOpenCommit}
        >
          {entry.summary}
        </TurnCardMessage>
        {entry.description ? (
          <div className={cn("line-clamp-[10] whitespace-pre-wrap text-sm text-muted-foreground", TURN_CARD_ROW_INSET)}>
            {entry.description.trim()}
          </div>
        ) : null}
      </div>
      {/* Last and only once read, as on the chat card: the appendix you drop
          to when the message didn't settle it, and nothing appears until it
          lands, so the card doesn't resize under a reader already on it. */}
      {details && details.files.length > 0 ? (
        <>
          <div className="-mx-1.5 mt-2 border-t border-border/60" aria-hidden />
          {/* The list's summary in the card's small print, its +/- on the
              same right edge as every file's below it. */}
          <TurnCardMetaRow className="mt-1.5">
            <span>{details.totalFileCount} file{details.totalFileCount === 1 ? "" : "s"}</span>
            <DiffFileStat additions={details.additions} deletions={details.deletions} className="ml-auto pl-2" />
          </TurnCardMetaRow>
          {details.files.map((file) => (
            <button
              key={file.path}
              type="button"
              aria-label={`Open ${file.path}`}
              onClick={onOpenFile ? () => onOpenFile(file.path) : undefined}
              disabled={!onOpenFile}
              className={cn(
                "flex w-full items-center gap-2 rounded text-left text-[12px] text-muted-foreground",
                TURN_CARD_ROW_INSET,
                onOpenFile
                  ? "cursor-pointer transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  : "cursor-default",
              )}
            >
              <span className="min-w-0 flex-1 truncate" title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>
                {file.previousPath ? <span className="text-muted-foreground/70">{file.previousPath} → </span> : null}
                {file.path}
              </span>
              <DiffFileStat additions={file.additions} deletions={file.deletions} className="shrink-0" />
            </button>
          ))}
          {hiddenFiles > 0 ? (
            <div className={cn("text-[12px] text-muted-foreground/70", TURN_CARD_ROW_INSET)}>
              {hiddenFiles} more file{hiddenFiles === 1 ? "" : "s"}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  )
}

/** Reads the commit's details while its card is open, then renders it. */
function CommitHoverCardBody({
  entry,
  isPendingPush,
  onReadCommit,
  onOpenFile,
  dismiss,
}: {
  entry: ChatBranchHistoryEntry
  isPendingPush: boolean
  onReadCommit?: (sha: string) => Promise<ChatCommitDetails>
  onOpenFile?: (path: string) => void
  dismiss: () => void
}) {
  const details = useCardDetails(detailsCache, entry.sha, onReadCommit ? () => onReadCommit(entry.sha) : null)
  const openInNewTab = (url: string) => {
    dismiss()
    window.open(url, "_blank", "noopener,noreferrer")
  }
  return (
    <CommitHoverCardContent
      entry={entry}
      details={details}
      isPendingPush={isPendingPush}
      onOpenCommit={entry.githubUrl ? () => openInNewTab(entry.githubUrl!) : undefined}
      onOpenChecks={entry.checks?.url ? () => openInNewTab(entry.checks!.url!) : undefined}
      onOpenFile={onOpenFile ? (path) => { dismiss(); onOpenFile(path) } : undefined}
    />
  )
}

/** History's hover card: one for the list, a commit's card on the row under the pointer. */
export function CommitHoverCard({
  containerRef,
  entries,
  aheadCount,
  onReadCommit,
  onOpenFile,
}: {
  /** The History list; every commit row is somewhere beneath it. */
  containerRef: RefObject<HTMLDivElement | null>
  entries: ChatBranchHistoryEntry[]
  /** The first this many commits aren't on the remote yet. */
  aheadCount: number
  onReadCommit?: (sha: string) => Promise<ChatCommitDetails>
  onOpenFile?: (path: string) => void
}) {
  return (
    <WidgetHoverCard containerRef={containerRef}>
      {(sha, dismiss) => {
        const index = entries.findIndex((entry) => entry.sha === sha)
        if (index === -1) return null
        return (
          <CommitHoverCardBody
            key={sha}
            entry={entries[index]!}
            isPendingPush={index < aheadCount}
            onReadCommit={onReadCommit}
            onOpenFile={onOpenFile}
            dismiss={dismiss}
          />
        )
      }}
    </WidgetHoverCard>
  )
}
