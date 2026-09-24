import { ArrowDown, ArrowUp, Check, Columns2, FileDiff, GitBranch, GitBranchPlus, GitMerge, Github, GitPullRequest, History, LoaderCircle, Pencil, PenLine, RefreshCw, Rows3, Sparkles, Upload, WrapText } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  ChatBranchListEntry,
  ChatBranchListResult,
  ChatDiffSnapshot,
  DiffCommitMode,
  DiffCommitResult,
  ChatMergeBranchResult,
  ChatMergePreviewResult,
  GitHubPublishInfo,
  GitHubRepoAvailabilityResult,
} from "../../../../shared/types"
import { formatRelativeTime } from "../../../lib/formatters"
import { cn } from "../../../lib/utils"
import { isDiffPathChecked, useDiffCommitStore } from "../../../stores/diffCommitStore"
import { useRightSidebarStore } from "../../../stores/rightSidebarStore"
import { Button } from "../../ui/button"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../ui/context-menu"
import { Input } from "../../ui/input"
import { Textarea } from "../../ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip"
import { BranchPicker } from "../git/BranchPicker"
import { CommitHistoryRow } from "../git/CommitHistoryRow"
import { DiffFileCard, type DiffFileActions } from "../git/DiffFileCard"
import { GitHubPublishModal } from "../git/GitHubPublishModal"
import { MergeBranchModal } from "../git/MergeBranchModal"
import { DiffFileStat, IconButton, StageCheckbox, type DiffRenderMode } from "../git/shared"
import { EDGE_ROW_HOVER_CLASS, SwapIn, useWidgetExpanded, WidgetCard, WidgetPresence } from "./WidgetCard"

export { canIgnoreDiffFile, canIgnoreDiffFolder, shouldLoadDiffPatchNow } from "../git/DiffFileCard"
export type { DiffFileActions } from "../git/DiffFileCard"

const EMPTY_CHECKED_PATHS: Record<string, boolean> = {}

// Rendering thousands of file cards at once makes the whole app sluggish, so
// the changes list is paginated and expanded on demand.
export const INITIAL_VISIBLE_DIFF_FILE_COUNT = 200
export const VISIBLE_DIFF_FILE_INCREMENT = 300
// History opens on the latest few commits; "Show more" reveals the rest of
// what the server sends, which is 25 (diff-store's BRANCH_HISTORY_LIMIT).
export const INITIAL_VISIBLE_HISTORY_COUNT = 5

// The Branch and Changes footers' main buttons: outline, the same surface as
// the square icon button beside them, so an always-visible footer reads as
// one quiet row rather than a solid call to action.
const FOOTER_MAIN_BUTTON_CLASS = "min-w-0 flex-1 rounded-xl"

/**
 * The Changes header: what the commit button will commit. With every file
 * checked (the default) that is simply the change set; once some are
 * unchecked it says "3 of 5" and the totals count only the checked files,
 * because the commit row stays in view while the list is collapsed and the
 * header is then the only place the selection shows.
 */
export function summarizeChanges(
  files: ReadonlyArray<{ path: string; additions?: number; deletions?: number }>,
  selectedPaths: ReadonlySet<string>,
) {
  const partial = files.some((file) => !selectedPaths.has(file.path))
  const counted = partial ? files.filter((file) => selectedPaths.has(file.path)) : files
  const noun = files.length === 1 ? "file" : "files"
  return {
    title: partial ? `${counted.length} of ${files.length} ${noun} changed` : `${files.length} ${noun} changed`,
    additions: counted.reduce((sum, file) => sum + (file.additions ?? 0), 0),
    deletions: counted.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
  }
}

/** The commits History lists, and how many a "Show more" would add. */
export function visibleHistoryEntries<T>(entries: T[], showAll: boolean) {
  const shown = showAll ? entries : entries.slice(0, INITIAL_VISIBLE_HISTORY_COUNT)
  return { shown, hiddenCount: entries.length - shown.length }
}

interface GitWidgetsProps extends DiffFileActions {
  projectId: string | null
  diffs: ChatDiffSnapshot
  editorLabel: string
  diffRenderMode: DiffRenderMode
  wrapLines: boolean
  onLoadPatch: (path: string) => Promise<string>
  onListBranches: () => Promise<ChatBranchListResult>
  onPreviewMergeBranch: (branch: ChatBranchListEntry) => Promise<ChatMergePreviewResult>
  onMergeBranch: (branch: ChatBranchListEntry) => Promise<ChatMergeBranchResult | null>
  onCheckoutBranch: (branch: ChatBranchListEntry) => Promise<void>
  onCreateBranch: (args: { name: string; baseBranchName?: string }) => Promise<void>
  onGenerateCommitMessage: (args: { paths: string[] }) => Promise<{ subject: string; body: string }>
  onInitializeGit: () => Promise<unknown>
  onGetGitHubPublishInfo: () => Promise<GitHubPublishInfo>
  onCheckGitHubRepoAvailability: (args: { owner: string; name: string }) => Promise<GitHubRepoAvailabilityResult>
  onSetupGitHub: (args: { owner: string; name: string; visibility: "public" | "private"; description: string }) => Promise<unknown>
  onCommit: (args: { paths: string[]; summary: string; description: string; mode: DiffCommitMode }) => Promise<DiffCommitResult | null>
  onSyncWithRemote: (action: "fetch" | "pull" | "push" | "publish") => Promise<unknown>
  onDiffRenderModeChange: (mode: DiffRenderMode) => void
  onWrapLinesChange: (wrap: boolean) => void
}

export function getPrimaryCommitActionPrefix(args: {
  hasSummary: boolean
  isGenerating: boolean
  isCommitting: boolean
  isGeneratedCommitInFlight: boolean
  commitModeInFlight: DiffCommitMode | null
  primaryCommitMode: DiffCommitMode
}) {
  if (args.hasSummary) {
    if (args.isCommitting) {
      if (args.isGeneratedCommitInFlight) {
        return args.commitModeInFlight === "commit_only" ? "Committing…" : "Pushing…"
      }
      return args.commitModeInFlight === "commit_only" ? "Committing…" : "Committing & Pushing…"
    }
    return args.primaryCommitMode === "commit_only" ? "Commit to" : "Commit & push to"
  }

  if (args.isGenerating) {
    return "Generating…"
  }
  return args.primaryCommitMode === "commit_only" ? "Generate & commit to" : "Generate & push to"
}

/** The icon-only Fetch button's tooltip: when it last ran. */
function formatFetchTooltip(isoTimestamp?: string) {
  if (!isoTimestamp) {
    return "No local fetch recorded"
  }
  return `Fetched ${formatRelativeTime(isoTimestamp)}`
}

/**
 * The git part of the widget column, three cards.
 *
 * Branch names the current branch and carries the sync controls (fetch, and
 * ↓/↑ counts to pull and push). It expands into the branch picker (find,
 * switch or create a branch), with Merge and PR below it. Changes is an "N files changed" disclosure
 * over the file list (staging checkboxes, expandable diffs), with the commit
 * box always in view below. History lists recent commits.
 */
function GitWidgetsImpl({
  projectId,
  diffs,
  editorLabel,
  diffRenderMode,
  wrapLines,
  onOpenFile,
  onOpenInFinder,
  onDiscardFile,
  onIgnoreFile,
  onIgnoreFolder,
  onCopyFilePath,
  onCopyRelativePath,
  onListBranches,
  onPreviewMergeBranch,
  onMergeBranch,
  onCheckoutBranch,
  onCreateBranch,
  onGenerateCommitMessage,
  onInitializeGit,
  onGetGitHubPublishInfo,
  onCheckGitHubRepoAvailability,
  onSetupGitHub,
  onCommit,
  onSyncWithRemote,
  onLoadPatch,
  onDiffRenderModeChange,
  onWrapLinesChange,
}: GitWidgetsProps) {
  const fileActions: DiffFileActions = useMemo(() => ({
    onOpenFile,
    onOpenInFinder,
    onDiscardFile,
    onIgnoreFile,
    onIgnoreFolder,
    onCopyFilePath,
    onCopyRelativePath,
  }), [onOpenFile, onOpenInFinder, onDiscardFile, onIgnoreFile, onIgnoreFolder, onCopyFilePath, onCopyRelativePath])
  const hasChanges = diffs.files.length > 0
  const [isGenerating, setIsGenerating] = useState(false)
  const [commitModeInFlight, setCommitModeInFlight] = useState<DiffCommitMode | null>(null)
  const [isGeneratedCommitInFlight, setIsGeneratedCommitInFlight] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  // The merge dialog belongs to the footer, which shows without the picker,
  // so it loads its own branch list when opened.
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [mergeBranchList, setMergeBranchList] = useState<ChatBranchListResult | null>(null)
  const [isGitHubPublishModalOpen, setIsGitHubPublishModalOpen] = useState(false)
  const [patchesByPath, setPatchesByPath] = useState<Record<string, string>>({})
  const [patchErrorsByPath, setPatchErrorsByPath] = useState<Record<string, string>>({})
  const [loadingPatchPaths, setLoadingPatchPaths] = useState<Record<string, boolean>>({})
  const patchDigestsByPathRef = useRef<Record<string, string>>({})
  const [visibleFileCount, setVisibleFileCount] = useState(INITIAL_VISIBLE_DIFF_FILE_COUNT)
  const filePaths = useMemo(() => diffs.files.map((file) => file.path), [diffs.files])
  const filePathsKey = useMemo(() => filePaths.join("\u0000"), [filePaths])
  // Local, not persisted: the picker is a place you visit, not a view to keep open.
  const [branchesExpanded, setBranchesExpanded] = useState(false)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [changesExpanded, setChangesExpanded] = useWidgetExpanded(projectId, "changes", diffs.files.length)
  const [historyExpanded, setHistoryExpanded] = useWidgetExpanded(projectId, "history", diffs.branchHistory?.entries.length ?? 0)
  const collapsedPaths = useRightSidebarStore((store) => (projectId ? (store.projectUi[projectId]?.collapsedPaths ?? EMPTY_CHECKED_PATHS) : EMPTY_CHECKED_PATHS))
  const summary = useRightSidebarStore((store) => (projectId ? (store.projectUi[projectId]?.summary ?? "") : ""))
  const description = useRightSidebarStore((store) => (projectId ? (store.projectUi[projectId]?.description ?? "") : ""))
  // The message and description fields stay hidden behind the pencil: the
  // commit button generates a message by itself, so most commits never need
  // them. A draft already written starts them open, so you can see what the
  // button is about to commit.
  const [commitEditorOpen, setCommitEditorOpen] = useState(() => summary.trim().length > 0 || description.trim().length > 0)
  const commitMessageInputRef = useRef<HTMLInputElement | null>(null)
  const reconcileCollapsedPaths = useRightSidebarStore((store) => store.reconcileCollapsedPaths)
  const toggleCollapsedPath = useRightSidebarStore((store) => store.toggleCollapsedPath)
  const setCommitDraft = useRightSidebarStore((store) => store.setCommitDraft)
  const clearCommitDraft = useRightSidebarStore((store) => store.clearCommitDraft)
  const diffCommitSelection = useDiffCommitStore((store) => (projectId ? store.selectionsByProjectId[projectId] : undefined))
  const reconcileCheckedPaths = useDiffCommitStore((store) => store.reconcileProject)
  const setCheckedPath = useDiffCommitStore((store) => store.setChecked)
  const setAllCheckedPaths = useDiffCommitStore((store) => store.setAllChecked)

  useEffect(() => {
    setVisibleFileCount(INITIAL_VISIBLE_DIFF_FILE_COUNT)
    setShowAllHistory(false)
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    reconcileCollapsedPaths(projectId, filePaths)
  }, [filePaths, filePathsKey, projectId, reconcileCollapsedPaths])

  useEffect(() => {
    const nextDigestsByPath = Object.fromEntries(diffs.files.map((file) => [file.path, file.patchDigest]))
    const filePathSet = new Set(filePaths)
    const isCurrentDigest = (path: string) => patchDigestsByPathRef.current[path] === nextDigestsByPath[path]
    setPatchesByPath((current) => Object.fromEntries(
      Object.entries(current).filter(([path]) => filePathSet.has(path) && isCurrentDigest(path))
    ))
    setPatchErrorsByPath((current) => Object.fromEntries(Object.entries(current).filter(([path]) => filePathSet.has(path) && isCurrentDigest(path))))
    setLoadingPatchPaths((current) => Object.fromEntries(Object.entries(current).filter(([path]) => filePathSet.has(path) && isCurrentDigest(path))))
    patchDigestsByPathRef.current = nextDigestsByPath
  }, [diffs.files, filePaths, filePathsKey])

  useEffect(() => {
    if (!projectId) return
    reconcileCheckedPaths(projectId, filePaths)
  }, [filePaths, filePathsKey, projectId, reconcileCheckedPaths])

  const selectedPaths = useMemo(
    () => diffs.files.filter((file) => isDiffPathChecked(diffCommitSelection, file.path)).map((file) => file.path),
    [diffCommitSelection, diffs.files]
  )
  const selectedCount = selectedPaths.length
  const allSelected = diffs.files.length > 0 && selectedCount === diffs.files.length
  const someSelected = selectedCount > 0 && selectedCount < diffs.files.length
  const trimmedSummary = summary.trim()
  const hasSummary = trimmedSummary.length > 0
  const isCommitting = commitModeInFlight !== null
  const isBusy = isGenerating || isCommitting
  const branchHistory = diffs.branchHistory?.entries ?? []
  const visibleHistory = visibleHistoryEntries(branchHistory, showAllHistory)
  const changesSummary = useMemo(
    () => summarizeChanges(diffs.files, new Set(selectedPaths)),
    [diffs.files, selectedPaths],
  )
  const behindCount = diffs.behindCount ?? 0
  const aheadCount = diffs.aheadCount ?? 0
  const isPublishedBranch = diffs.hasUpstream === true
  const isPublishableBranch = diffs.hasUpstream === false && Boolean(diffs.branchName)
  const hasRemoteOrigin = diffs.hasOriginRemote === true
  const encodedBranchName = diffs.branchName
    ? diffs.branchName.split("/").map((segment) => encodeURIComponent(segment)).join("/")
    : null
  const syncAction: "fetch" | "pull" | "publish" = isPublishableBranch
    ? "publish"
    : behindCount > 0
      ? "pull"
      : "fetch"
  const compareUrl = diffs.originRepoSlug && encodedBranchName
    ? `https://github.com/${diffs.originRepoSlug}/compare/${encodedBranchName}?expand=1`
    : null
  const canOpenPullRequest = Boolean(
    isPublishedBranch
    && compareUrl
    && diffs.branchName
    && diffs.branchName !== diffs.defaultBranchName
  )
  const canGenerate = diffs.status === "ready"
    && selectedCount > 0
    && !isBusy
  const canCommit = diffs.status === "ready"
    && selectedCount > 0
    && hasSummary
    && !isBusy
  const primaryCommitMode: DiffCommitMode = hasRemoteOrigin ? "commit_and_push" : "commit_only"
  const resolvedBranchName = diffs.branchName ?? "current branch"
  const commitButtonState = hasSummary
    ? (isCommitting ? `committing:${commitModeInFlight}:${isGeneratedCommitInFlight}` : "commit")
    : (isGenerating ? "generating" : "generate")
  const primaryCommitActionPrefix = getPrimaryCommitActionPrefix({
    hasSummary,
    isGenerating,
    isCommitting,
    isGeneratedCommitInFlight,
    commitModeInFlight,
    primaryCommitMode,
  })

  async function handleCommit(mode: DiffCommitMode) {
    if (!canCommit) return
    setCommitModeInFlight(mode)
    try {
      const result = await onCommit({
        paths: selectedPaths,
        summary: trimmedSummary,
        description: description.trim(),
        mode,
      })
      if (result?.ok || result?.localCommitCreated) {
        if (projectId) {
          clearCommitDraft(projectId)
        }
      }
    } finally {
      setCommitModeInFlight(null)
    }
  }

  async function handleGenerate() {
    if (!canGenerate) return
    setIsGenerating(true)
    try {
      const result = await onGenerateCommitMessage({ paths: selectedPaths })
      if (projectId) {
        setCommitDraft(projectId, {
          summary: result.subject,
          description: result.body,
        })
      }
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleGenerateAndCommit(mode: DiffCommitMode) {
    if (!canGenerate) return
    setIsGenerating(true)
    try {
      const result = await onGenerateCommitMessage({ paths: selectedPaths })
      const generatedSummary = result.subject.trim()
      const generatedDescription = result.body.trim()
      if (projectId) {
        setCommitDraft(projectId, {
          summary: result.subject,
          description: result.body,
        })
      }
      if (!generatedSummary) {
        return
      }

      setIsGenerating(false)
      setIsGeneratedCommitInFlight(true)
      setCommitModeInFlight(mode)
      const commitResult = await onCommit({
        paths: selectedPaths,
        summary: generatedSummary,
        description: generatedDescription,
        mode,
      })
      if (commitResult?.ok || commitResult?.localCommitCreated) {
        if (projectId) {
          clearCommitDraft(projectId)
        }
      }
    } finally {
      setIsGenerating(false)
      setIsGeneratedCommitInFlight(false)
      setCommitModeInFlight(null)
    }
  }

  function handleCommitKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (!(event.metaKey || event.ctrlKey) || event.key !== "Enter") {
      return
    }
    event.preventDefault()
    if (hasSummary) {
      void handleCommit(primaryCommitMode)
      return
    }
    void handleGenerateAndCommit(primaryCommitMode)
  }

  function openMergeModal() {
    setMergeModalOpen(true)
    setMergeBranchList(null)
    void onListBranches()
      .then(setMergeBranchList)
      // An empty list, not null: null is the dialog's loading skeleton, and
      // a failed load would otherwise pulse forever. The picker surfaces
      // load errors.
      .catch(() => setMergeBranchList({ recent: [], local: [], remote: [], pullRequests: [], pullRequestsStatus: "error" }))
  }

  async function handleSync(action: "fetch" | "pull" | "push" | "publish" = syncAction) {
    if (diffs.status !== "ready" || isSyncing) return
    setIsSyncing(true)
    try {
      await onSyncWithRemote(action)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLoadPatch = useCallback(async (path: string) => {
    if (patchesByPath[path] !== undefined || loadingPatchPaths[path]) {
      return patchesByPath[path] ?? ""
    }

    setLoadingPatchPaths((current) => ({ ...current, [path]: true }))
    setPatchErrorsByPath((current) => {
      if (!(path in current)) return current
      const { [path]: _removed, ...rest } = current
      return rest
    })

    try {
      const patch = await onLoadPatch(path)
      setPatchesByPath((current) => ({ ...current, [path]: patch }))
      const digest = diffs.files.find((file) => file.path === path)?.patchDigest
      if (digest) {
        patchDigestsByPathRef.current = {
          ...patchDigestsByPathRef.current,
          [path]: digest,
        }
      }
      return patch
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPatchErrorsByPath((current) => ({ ...current, [path]: message }))
      throw error
    } finally {
      setLoadingPatchPaths((current) => {
        const { [path]: _removed, ...rest } = current
        return rest
      })
    }
  }, [diffs.files, loadingPatchPaths, onLoadPatch, patchesByPath])

  const syncButtonClass = "h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground hover:!bg-transparent hover:!border-border/0"
  const remoteSyncActions = !hasRemoteOrigin ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setIsGitHubPublishModalOpen(true)}
      className={syncButtonClass}
    >
      <Github className="size-3.5" />
      <span>Push to GitHub</span>
    </Button>
  ) : syncAction === "publish" ? (
    <Button variant="ghost" size="sm" onClick={() => void handleSync()} disabled={isSyncing} className={syncButtonClass}>
      {isSyncing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
      <span>Publish</span>
    </Button>
  ) : (
    <>
      {syncAction === "fetch" ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            {/* Icon only: the refresh glyph says fetch; the tooltip says when it last ran. */}
            <Button variant="ghost" size="sm" aria-label="Fetch" onClick={() => void handleSync()} disabled={isSyncing} className={syncButtonClass}>
              {isSyncing ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{formatFetchTooltip(diffs.lastFetchedAt)}</TooltipContent>
        </Tooltip>
      ) : (
        // Counts, not words: at the column's width "Pull 3 · Push 2 · PR"
        // truncated the branch name, the one thing this header is for.
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Pull ${behindCount}`} onClick={() => void handleSync()} disabled={isSyncing} className={syncButtonClass}>
              {isSyncing ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowDown className="size-3.5" />}
              <span className="tabular-nums">{behindCount}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Pull {behindCount} {behindCount === 1 ? "commit" : "commits"}</TooltipContent>
        </Tooltip>
      )}
      {isPublishedBranch && aheadCount > 0 ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button variant="default" size="sm" aria-label={`Push ${aheadCount}`} onClick={() => void handleSync("push")} disabled={isSyncing} className="h-6 gap-1 px-1.5 text-xs">
              {isSyncing ? <LoaderCircle className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
              <span className="tabular-nums">{aheadCount}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Push {aheadCount} {aheadCount === 1 ? "commit" : "commits"}</TooltipContent>
        </Tooltip>
      ) : null}
    </>
  )

  // Below the picker, so only while the card is open: merging and opening a
  // PR are rare next to reading the branch name, and an always-visible row
  // for them cost the column 56px. Laid out like the Changes card's commit
  // row, the main action taking the width and a square outline button beside
  // it. New branch is not here: the picker's search creates one from what
  // you typed. A detached HEAD has nothing to merge into.
  const branchActions = diffs.status === "ready" && (diffs.branchName || canOpenPullRequest) ? (
    <div className="flex gap-2 border-t border-border p-2">
      {diffs.branchName ? (
        <Button type="button" variant="outline" className={FOOTER_MAIN_BUTTON_CLASS} onClick={openMergeModal}>
          <span className="flex min-w-0 items-center gap-1.5">
            <GitMerge strokeWidth={2.5} className="size-3 shrink-0" />
            <span className="min-w-0 truncate text-left">
              {/* The ellipsis says it opens a dialog (pick the branch to merge), not a merge. */}
              Merge into <GitBranch strokeWidth={2.5} className="mr-[4.5px] ml-0.5 inline size-3" />{diffs.branchName}…
            </span>
          </span>
        </Button>
      ) : null}
      {canOpenPullRequest && compareUrl ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label="Open pull request"
              onClick={() => window.open(compareUrl, "_blank", "noopener,noreferrer")}
              className="size-10 shrink-0 rounded-xl p-0"
            >
              <GitPullRequest strokeWidth={2.5} className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open pull request</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  ) : null

  const commitBox = hasChanges && diffs.status === "ready" ? (
    <div className="space-y-2 p-2">
      {commitEditorOpen ? (
        <div>
          <div className="relative">
            <Input
              ref={commitMessageInputRef}
              value={summary}
              onChange={(event) => {
                if (!projectId) return
                setCommitDraft(projectId, { summary: event.target.value, description })
              }}
              onKeyDown={handleCommitKeyDown}
              placeholder="Commit message"
              className="rounded-t-xl rounded-b-none px-3 pr-10"
              disabled={isBusy}
            />
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Generate commit message"
                  className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                  disabled={!canGenerate}
                  onClick={() => void handleGenerate()}
                >
                  {isGenerating
                    ? <LoaderCircle strokeWidth={2.5} className="size-3.5 animate-spin" />
                    : <Sparkles strokeWidth={2.5} className="size-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>Generate commit message</TooltipContent>
            </Tooltip>
          </div>
          <Textarea
            value={description}
            onChange={(event) => {
              if (!projectId) return
              setCommitDraft(projectId, { summary, description: event.target.value })
            }}
            onKeyDown={handleCommitKeyDown}
            placeholder="Description"
            rows={3}
            // No ring (it would clash with the input's edge above), but the
            // border still says which of the two fields has focus.
            className="-mt-px rounded-t-none rounded-b-xl px-3 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:border-ring"
            disabled={isBusy}
          />
        </div>
      ) : null}
      <div className="flex gap-2">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              aria-label={commitEditorOpen ? "Hide commit message" : "Write commit message"}
              aria-pressed={commitEditorOpen}
              onClick={() => {
                const opening = !commitEditorOpen
                setCommitEditorOpen(opening)
                // Focus only on a click, never on mount: a draft that starts
                // the fields open must not pull focus out of the chat input.
                if (opening) requestAnimationFrame(() => commitMessageInputRef.current?.focus())
              }}
              className={cn("size-10 shrink-0 rounded-xl p-0", commitEditorOpen && "bg-muted text-foreground")}
            >
              <Pencil strokeWidth={2.5} className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{commitEditorOpen ? "Hide commit message" : "Write commit message"}</TooltipContent>
        </Tooltip>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className={FOOTER_MAIN_BUTTON_CLASS}
              disabled={hasSummary ? !canCommit : !canGenerate}
              onClick={() => {
                if (hasSummary) {
                  void handleCommit(primaryCommitMode)
                  return
                }
                void handleGenerateAndCommit(primaryCommitMode)
              }}
            >
              {/* Cross-fades per state: the label changes width and wording
                  while you watch it, and a hard swap reads as a flicker. */}
              <SwapIn swapKey={commitButtonState} className="min-w-0 gap-1.5">
                {hasSummary ? (
                  isCommitting ? (
                    <LoaderCircle strokeWidth={2.5} className="size-3 shrink-0 animate-spin" />
                  ) : primaryCommitMode === "commit_and_push" ? diffs.hasUpstream ? (
                    <Upload strokeWidth={2.5} className="size-3 shrink-0" />
                  ) : (
                    <GitBranchPlus strokeWidth={2.5} className="size-3 shrink-0" />
                  ) : (
                    <Check strokeWidth={2.5} className="size-3 shrink-0" />
                  )
                ) : isGenerating ? (
                  <LoaderCircle strokeWidth={2.5} className="size-3 shrink-0 animate-spin" />
                ) : (
                  <PenLine strokeWidth={2.5} className="size-3 shrink-0" />
                )}
                <span className="min-w-0 truncate text-left">
                  {isGenerating || isCommitting
                    ? primaryCommitActionPrefix
                    : <>{primaryCommitActionPrefix} <GitBranch strokeWidth={2.5} className="mr-[4.5px] ml-0.5 inline size-3 " />{resolvedBranchName}</>}
                </span>
              </SwapIn>
            </Button>
          </ContextMenuTrigger>
          {diffs.hasUpstream ? (
            <ContextMenuContent>
              <ContextMenuItem
                disabled={!hasSummary || !canCommit}
                onSelect={(event) => {
                  event.stopPropagation()
                  void handleCommit("commit_only")
                }}
              >
                Commit Only
              </ContextMenuItem>
            </ContextMenuContent>
          ) : null}
        </ContextMenu>
      </div>
    </div>
  ) : null

  const fileList = hasChanges ? (
    <div>
      {/* No bottom border: the first file row's own divider draws that line
          (see DiffFileCard). */}
      <div className="flex h-9 items-center justify-between gap-2 pl-[11px] pr-3">
        <StageCheckbox
          checked={allSelected}
          mixed={someSelected}
          label={allSelected ? "Unselect all files from commit" : "Select all files for commit"}
          onClick={() => {
            if (!projectId) return
            setAllCheckedPaths(projectId, filePaths, someSelected ? true : !allSelected)
          }}
        />
        <div className="flex items-center gap-1">
          <IconButton label="Unified diff" active={diffRenderMode === "unified"} onClick={() => onDiffRenderModeChange("unified")}>
            <Rows3 className="size-4" />
          </IconButton>
          <IconButton label="Side-by-side diff" active={diffRenderMode === "split"} onClick={() => onDiffRenderModeChange("split")}>
            <Columns2 className="size-4" />
          </IconButton>
          <IconButton label={wrapLines ? "Disable word wrap" : "Enable word wrap"} active={wrapLines} onClick={() => onWrapLinesChange(!wrapLines)}>
            <WrapText className="size-4" />
          </IconButton>
        </div>
      </div>
      {/* Only the files scroll: a big change set stays inside 60vh, with the
          toolbar above it and the commit box and History below it in view. */}
      <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
        {/* No divide-y: its border sits on the card, outside the header that
            carries the hover, so each divider was a 1px dead line. Every
            row draws its own divider instead. */}
        <div>
          {(visibleFileCount < diffs.files.length ? diffs.files.slice(0, visibleFileCount) : diffs.files).map((file) => {
            const isCollapsed = collapsedPaths[file.path] ?? true
            const isChecked = isDiffPathChecked(diffCommitSelection, file.path)
            return (
              <DiffFileCard
                key={file.path}
                file={file}
                projectId={projectId}
                isCollapsed={isCollapsed}
                isChecked={isChecked}
                editorLabel={editorLabel}
                diffRenderMode={diffRenderMode}
                wrapLines={wrapLines}
                onToggleCollapsed={() => {
                  if (!projectId) return
                  toggleCollapsedPath(projectId, file.path)
                }}
                onToggleChecked={() => {
                  if (!projectId) return
                  setCheckedPath(projectId, file.path, !isChecked)
                }}
                fileActions={fileActions}
                patch={patchesByPath[file.path]}
                patchError={patchErrorsByPath[file.path]}
                isPatchLoading={Boolean(loadingPatchPaths[file.path])}
                onLoadPatch={handleLoadPatch}
              />
            )
          })}
          {visibleFileCount < diffs.files.length ? (
            <button
              type="button"
              onClick={() => setVisibleFileCount((count) => count + VISIBLE_DIFF_FILE_INCREMENT)}
              className={cn("flex w-full items-center justify-center border-t border-border px-3 py-2.5 text-[13px] text-muted-foreground hover:text-foreground", EDGE_ROW_HOVER_CLASS)}
            >
              Show {Math.min(VISIBLE_DIFF_FILE_INCREMENT, diffs.files.length - visibleFileCount)} more of {(diffs.files.length - visibleFileCount).toLocaleString()} remaining files
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <WidgetPresence show={diffs.status === "no_repo"}>
        <WidgetCard icon={<GitBranch />} title="Git">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <p className="text-sm text-muted-foreground">Not a git repository.</p>
            <Button size="sm" onClick={() => void onInitializeGit()}>Init Git</Button>
          </div>
        </WidgetCard>
      </WidgetPresence>
      <WidgetPresence show={diffs.status === "ready"}>
        <WidgetCard
          icon={<GitBranch />}
          title={(
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="shrink-0">Branch</span>
              <span className="min-w-0 truncate text-muted-foreground">{diffs.branchName ?? "Detached HEAD"}</span>
            </span>
          )}
          expanded={branchesExpanded}
          onToggle={() => setBranchesExpanded((current) => !current)}
          actions={remoteSyncActions}
        >
          <BranchPicker
            currentBranchName={diffs.branchName}
            onListBranches={onListBranches}
            onCheckoutBranch={onCheckoutBranch}
            onCreateBranch={onCreateBranch}
            onDone={() => setBranchesExpanded(false)}
            repoSlug={diffs.originRepoSlug}
          />
          {branchActions}
        </WidgetCard>
      </WidgetPresence>
      {/* A clean working tree drops the card rather than saying so. */}
      <WidgetPresence show={diffs.status === "ready" && hasChanges}>
        <WidgetCard
          icon={<FileDiff />}
          title={changesSummary.title}
          expanded={changesExpanded}
          onToggle={() => setChangesExpanded(!changesExpanded)}
          // Totals of what will be committed, in the same +/- typography as each file row.
          actions={<DiffFileStat additions={changesSummary.additions} deletions={changesSummary.deletions} className="pr-1" />}
          footer={commitBox}
        >
          {fileList}
        </WidgetCard>
      </WidgetPresence>
      <WidgetPresence show={diffs.status === "ready" && branchHistory.length > 0}>
        <WidgetCard
          icon={<History />}
          title="History"
          // Not the length: that is the server's cap (25) on any real repo.
          // What is worth a glance is what hasn't reached the remote yet.
          count={isPublishedBranch && aheadCount > 0 ? `${aheadCount} unpushed` : undefined}
          expanded={historyExpanded}
          onToggle={() => setHistoryExpanded(!historyExpanded)}
        >
          {/* Rows draw their own dividers, inside their hover targets (see
              CommitHistoryRow), so the pointer never crosses a dead line. */}
          <div>
            {visibleHistory.shown.map((entry, index) => (
              <CommitHistoryRow key={entry.sha} entry={entry} isPendingPush={index < aheadCount} divided={index > 0} />
            ))}
            {visibleHistory.hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllHistory(true)}
                className={cn("flex w-full items-center justify-center border-t border-border px-3 py-2.5 text-[13px] text-muted-foreground hover:text-foreground", EDGE_ROW_HOVER_CLASS)}
              >
                Show {visibleHistory.hiddenCount} more
              </button>
            ) : null}
          </div>
        </WidgetCard>
      </WidgetPresence>

      <MergeBranchModal
        open={mergeModalOpen}
        onOpenChange={setMergeModalOpen}
        branchList={mergeBranchList}
        currentBranchName={diffs.branchName}
        onPreviewMergeBranch={onPreviewMergeBranch}
        onMergeBranch={onMergeBranch}
      />
      <GitHubPublishModal
        open={isGitHubPublishModalOpen}
        onOpenChange={setIsGitHubPublishModalOpen}
        onGetGitHubPublishInfo={onGetGitHubPublishInfo}
        onCheckGitHubRepoAvailability={onCheckGitHubRepoAvailability}
        onPublish={onSetupGitHub}
      />
    </>
  )
}

export const GitWidgets = memo(GitWidgetsImpl)
