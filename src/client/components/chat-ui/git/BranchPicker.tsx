import { ArrowUpRight, GitBranchPlus, Plus } from "lucide-react"
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react"
import type {
  ChatBranchListEntry,
  ChatBranchListResult,
} from "../../../../shared/types"
import { cn } from "../../../lib/utils"
import { ROW_HIGHLIGHT_CLASS, ROW_HOVER_CLASS } from "../widgets/WidgetCard"
import { BRANCH_ROW_CLASS, BranchListSection, BranchListSkeleton, BranchSearchRow } from "./BranchList"

/**
 * Unsearched, Local and Remote show only this many, newest commit first: the
 * picker sits inline in the widget column, and a repo's full remote list
 * would bury everything under it. A search still covers every branch, and
 * each section's "N more" row reaches the rest.
 */
export const UNSEARCHED_BRANCH_LIMIT = 5

export function mostRecentBranches(entries: ChatBranchListEntry[], limit = UNSEARCHED_BRANCH_LIMIT) {
  if (entries.length <= limit) return entries
  // ISO timestamps compare correctly as strings; undated entries sort last.
  return [...entries]
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    .slice(0, limit)
}

export interface BranchCreateOption {
  name: string
  /** Unset when the list named neither a default nor a current branch. */
  baseBranchName?: string
}

/**
 * What "Create branch" offers for a search: nothing while the search is empty
 * or names a branch that already exists (checking that one out is the
 * answer), otherwise the name off the default branch and, when HEAD is
 * elsewhere, off the current one too. Default first: it is the usual base,
 * and the previous dialog defaulted to it as well.
 *
 * Whitespace becomes "-": git refuses spaces, and the row shows the name it
 * will actually create.
 */
export function branchCreateOptions(
  query: string,
  branchList: ChatBranchListResult | null,
  currentBranchName?: string,
): BranchCreateOption[] {
  const name = query.trim().replace(/\s+/g, "-")
  if (!name || !branchList) return []
  const existing = [...branchList.recent, ...branchList.local, ...branchList.remote, ...branchList.pullRequests]
  if (name === currentBranchName || existing.some((entry) => entry.name === name || entry.displayName === name)) return []
  const bases = [...new Set([branchList.defaultBranchName, currentBranchName].filter((base): base is string => Boolean(base)))]
  return bases.length === 0 ? [{ name }] : bases.map((baseBranchName) => ({ name, baseBranchName }))
}

/**
 * The picker's sections for a search. One search covers all of them: a
 * branch you want may be a local branch, a remote one or someone's PR, and
 * you shouldn't have to know which before you type.
 */
export function branchPickerSections(args: {
  branchList: ChatBranchListResult | null
  query: string
  currentBranchName?: string
  showAllLocal: boolean
  showAllRemote: boolean
  showAllPullRequests: boolean
}) {
  const { branchList, currentBranchName, showAllLocal, showAllRemote, showAllPullRequests } = args
  const normalizedQuery = args.query.trim().toLowerCase()
  const matches = (entry: ChatBranchListEntry) => entry.name !== currentBranchName && (
    !normalizedQuery
    || [entry.displayName, entry.name, entry.description, entry.prTitle, entry.headLabel, entry.prNumber ? `#${entry.prNumber}` : undefined]
      .some((value) => value?.toLowerCase().includes(normalizedQuery))
  )
  const pullRequestHeadNames = new Set((branchList?.pullRequests ?? []).map((entry) => entry.headRefName ?? entry.name))
  const allLocal = (branchList?.local ?? []).filter(matches)
  // A remote branch with an open PR shows once, as the PR.
  const allRemote = (branchList?.remote ?? []).filter((entry) => matches(entry) && !pullRequestHeadNames.has(entry.name))
  const allPullRequests = (branchList?.pullRequests ?? []).filter(matches)
  return {
    recent: (branchList?.recent ?? []).filter(matches),
    pullRequests: normalizedQuery || showAllPullRequests ? allPullRequests : mostRecentBranches(allPullRequests),
    local: normalizedQuery || showAllLocal ? allLocal : mostRecentBranches(allLocal),
    remote: normalizedQuery || showAllRemote ? allRemote : mostRecentBranches(allRemote),
    allPullRequestCount: allPullRequests.length,
    allLocalCount: allLocal.length,
    allRemoteCount: allRemote.length,
  }
}

/**
 * The last row of a truncated section: "+ N more", in branch-row geometry so
 * its + sits in the icon column. A link opens GitHub in a new tab; otherwise
 * it reveals the rest in place.
 */
function MoreBranchesRow({ count, href, onClick }: { count: number; href?: string; onClick?: () => void }) {
  // `group-data-[mode=keyboard]/list`: no hover while the keys drive the list
  // (see BranchPicker), or a pointer resting here would light a second row.
  const className = cn(
    "flex w-full items-center gap-2 rounded-lg border border-transparent px-[3px] py-2 text-left text-sm text-muted-foreground hover:text-foreground",
    ROW_HOVER_CLASS,
    "group-data-[mode=keyboard]/list:hover:border-transparent group-data-[mode=keyboard]/list:hover:bg-transparent group-data-[mode=keyboard]/list:hover:text-muted-foreground",
  )
  const content = (
    <>
      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
        <Plus className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">{count} more</span>
      {href ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0" /> : null}
    </>
  )
  return href ? (
    <a href={href} target="_blank" rel="noreferrer noopener" tabIndex={-1} className={className}>{content}</a>
  ) : (
    <button type="button" tabIndex={-1} onClick={onClick} className={className}>{content}</button>
  )
}

type PickerOption =
  | { id: string; kind: "branch"; entry: ChatBranchListEntry }
  | { id: string; kind: "create"; option: BranchCreateOption }

/**
 * Find or create a branch. One search over one list, with no Branches / PRs
 * split: Recent, Pull requests, Local, Remote. Empty sections drop out. A
 * name that matches nothing offers to create that branch.
 *
 * Rendered inline in the Branch widget. It loads the list on mount, i.e.
 * when the widget opens, and focuses the search then (where there is a
 * keyboard). ↑/↓ move, Enter checks out or creates, Esc closes.
 */
export function BranchPicker({
  currentBranchName,
  onListBranches,
  onCheckoutBranch,
  onCreateBranch,
  onDone,
  repoSlug,
}: {
  currentBranchName?: string
  /** "owner/repo" when origin is on GitHub: Remote's and Pull requests' "N more" open their GitHub pages. */
  repoSlug?: string
  onListBranches: () => Promise<ChatBranchListResult>
  onCheckoutBranch: (branch: ChatBranchListEntry) => Promise<void>
  onCreateBranch: (option: BranchCreateOption) => Promise<void>
  /** After a checkout or create, or on Esc: the widget collapses. */
  onDone: () => void
}) {
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [query, setQuery] = useState("")
  const [showAllLocal, setShowAllLocal] = useState(false)
  const [showAllRemote, setShowAllRemote] = useState(false)
  const [showAllPullRequests, setShowAllPullRequests] = useState(false)
  const [branchList, setBranchList] = useState<ChatBranchListResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  /*
   * Two ways to drive the list, and only one highlights at a time.
   *
   * Pointer (the default): rows light with CSS :hover. That is instant and
   * never out of step with the pointer. Tracking hover in React state instead
   * re-rendered the picker for every row crossed, lagged behind the pointer,
   * and left a row lit over gaps and section labels.
   *
   * Keyboard: the arrow keys move a cursor held in state, and :hover is off,
   * so a pointer resting over the list doesn't light a second row. Real
   * pointer movement hands control back. Movement is checked because
   * scrolling the cursor into view slides rows under a still pointer, and
   * some browsers report that as a mouse move.
   */
  const [mode, setMode] = useState<"pointer" | "keyboard">("pointer")
  const [keyboardActiveId, setKeyboardActiveId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    void onListBranches()
      .then((result) => setBranchList(result))
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : String(loadError))
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [onListBranches])

  // Only with a real keyboard: on a phone, focusing would throw up the
  // on-screen keyboard over the list you opened this to tap.
  useEffect(() => {
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true })
  }, [])

  const currentName = branchList?.currentBranchName ?? currentBranchName
  const sections = branchPickerSections({ branchList, query, currentBranchName: currentName, showAllLocal, showAllRemote, showAllPullRequests })
  const createOptions = branchCreateOptions(query, branchList, currentName)
  const optionIdFor = (entry: ChatBranchListEntry) => `${listId}-${entry.id}`

  // Every row the keys can reach, top to bottom.
  const options: PickerOption[] = [
    ...[...sections.recent, ...sections.pullRequests, ...sections.local, ...sections.remote]
      .map((entry): PickerOption => ({ id: optionIdFor(entry), kind: "branch", entry })),
    ...createOptions.map((option): PickerOption => ({ id: `${listId}-create-${option.baseBranchName ?? ""}`, kind: "create", option })),
  ]

  // Enter's target. The keyboard cursor when there is one; while searching,
  // otherwise, the best match. With no search and no cursor, nothing, so a
  // stray Enter on opening doesn't switch branches.
  useEffect(() => {
    setKeyboardActiveId(null)
  }, [query])
  const resolvedActiveId = keyboardActiveId && options.some((option) => option.id === keyboardActiveId)
    ? keyboardActiveId
    : query.trim() ? options[0]?.id ?? null : null

  function moveActive(step: 1 | -1) {
    if (options.length === 0) return
    // From the row under the pointer, if the keys take over from a hover.
    const fromId = mode === "keyboard"
      ? resolvedActiveId
      : listRef.current?.querySelector<HTMLElement>('[role="option"]:hover')?.id ?? resolvedActiveId
    const index = options.findIndex((option) => option.id === fromId)
    const nextIndex = index === -1
      ? (step === 1 ? 0 : options.length - 1)
      : (index + step + options.length) % options.length
    const next = options[nextIndex]!
    setMode("keyboard")
    setKeyboardActiveId(next.id)
    document.getElementById(next.id)?.scrollIntoView({ block: "nearest" })
  }

  /**
   * A row's highlight. Keyboard mode: only the cursor. Pointer mode: :hover,
   * plus Enter's target (the best match while searching) whenever the
   * pointer isn't over the list, so there is never more than one lit row.
   */
  function optionClassName(isActive: boolean) {
    if (mode === "keyboard") return isActive ? ROW_HIGHLIGHT_CLASS : undefined
    return isActive
      ? cn(ROW_HIGHLIGHT_CLASS, "group-hover/list:border-transparent group-hover/list:bg-transparent hover:!border-border hover:!bg-muted")
      : ROW_HOVER_CLASS
  }

  async function runMutation(action: () => Promise<void>) {
    if (isMutating) return
    setIsMutating(true)
    try {
      await action()
      onDone()
    } finally {
      setIsMutating(false)
    }
  }

  function choose(option: PickerOption) {
    void runMutation(() => option.kind === "branch" ? onCheckoutBranch(option.entry) : onCreateBranch(option.option))
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      moveActive(event.key === "ArrowDown" ? 1 : -1)
    } else if (event.key === "Enter") {
      event.preventDefault()
      const option = options.find((candidate) => candidate.id === resolvedActiveId)
      if (option) choose(option)
    } else if (event.key === "Escape") {
      event.preventDefault()
      // Kept here: the page listens for Esc on window (to stop a turn, close
      // panels), and this one means only "leave the picker".
      event.stopPropagation()
      // First Esc clears a search, the next closes the picker.
      if (query) setQuery("")
      else onDone()
    }
  }

  const sectionProps = {
    rowClassName: "px-[3px]",
    disabled: isMutating,
    activeOptionId: resolvedActiveId,
    optionId: optionIdFor,
    optionClassName,
    onSelect: (entry: ChatBranchListEntry) => choose({ id: optionIdFor(entry), kind: "branch", entry }),
  }
  const hasBranchRows = sections.recent.length + sections.pullRequests.length + sections.local.length + sections.remote.length > 0

  return (
    <>
      <BranchSearchRow
        inputRef={inputRef}
        value={query}
        onChange={setQuery}
        placeholder="Find or create a branch…"
        listId={listId}
        activeOptionId={resolvedActiveId ?? undefined}
        onKeyDown={handleKeyDown}
      />
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Branches"
        aria-busy={isLoading}
        data-mode={mode}
        onPointerMove={(event) => {
          if (mode !== "keyboard" || (event.movementX === 0 && event.movementY === 0)) return
          setMode("pointer")
          setKeyboardActiveId(null)
        }}
        // No space between sections either: the last row of one and the
        // create rows below it would otherwise have dead space between them.
        className="group/list px-2 pb-2"
      >
        {isLoading ? (
          <BranchListSkeleton rowClassName="px-[3px]" />
        ) : error ? (
          <div className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">{error}</div>
        ) : (
          <>
            {!hasBranchRows && createOptions.length === 0 ? (
              <div className="px-1 pb-1 pt-2 text-xs text-muted-foreground">
                {query.trim() ? "No matching branches." : "No other branches."}
              </div>
            ) : null}
            <BranchListSection title="Recent" entries={sections.recent} {...sectionProps} />
            <BranchListSection
              title="Pull requests"
              count={branchList?.pullRequests.length}
              entries={sections.pullRequests}
              // Said only when PRs could not be read. "None open" is the
              // section being absent, like every other empty section.
              emptyLabel={branchList?.pullRequestsStatus === "error" && !query.trim()
                ? branchList.pullRequestsError ?? "Could not load pull requests."
                : undefined}
              footer={sections.allPullRequestCount > sections.pullRequests.length ? (
                repoSlug ? (
                  <MoreBranchesRow
                    count={sections.allPullRequestCount - sections.pullRequests.length}
                    href={`https://github.com/${repoSlug}/pulls`}
                  />
                ) : (
                  <MoreBranchesRow count={sections.allPullRequestCount - sections.pullRequests.length} onClick={() => setShowAllPullRequests(true)} />
                )
              ) : null}
              {...sectionProps}
            />
            <BranchListSection
              title="Local"
              entries={sections.local}
              footer={sections.allLocalCount > sections.local.length ? (
                // Local branches have no page on GitHub, so the rest open here.
                <MoreBranchesRow count={sections.allLocalCount - sections.local.length} onClick={() => setShowAllLocal(true)} />
              ) : null}
              {...sectionProps}
            />
            <BranchListSection
              title="Remote"
              entries={sections.remote}
              footer={sections.allRemoteCount > sections.remote.length ? (
                repoSlug ? (
                  <MoreBranchesRow
                    count={sections.allRemoteCount - sections.remote.length}
                    href={`https://github.com/${repoSlug}/branches/all`}
                  />
                ) : (
                  <MoreBranchesRow count={sections.allRemoteCount - sections.remote.length} onClick={() => setShowAllRemote(true)} />
                )
              ) : null}
              {...sectionProps}
            />
            {createOptions.length > 0 ? (
              <div role="group" aria-label="Create branch" className={hasBranchRows ? undefined : "pt-2"}>
                {createOptions.map((option) => {
                  const id = `${listId}-create-${option.baseBranchName ?? ""}`
                  const isActive = id === resolvedActiveId
                  return (
                    <button
                      key={id}
                      id={id}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      tabIndex={-1}
                      data-active={isActive}
                      disabled={isMutating}
                      onClick={() => choose({ id, kind: "create", option })}
                      className={cn(BRANCH_ROW_CLASS, "px-[3px] disabled:opacity-60", optionClassName(isActive))}
                    >
                      <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                        <GitBranchPlus className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        Create <span className="font-mono text-[13px]">{option.name}</span>
                        {option.baseBranchName ? <span className="text-muted-foreground"> from {option.baseBranchName}</span> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
