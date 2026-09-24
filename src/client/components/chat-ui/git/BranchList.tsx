import { GitBranch, GitPullRequest, Search } from "lucide-react"
import type { KeyboardEvent, ReactNode, Ref } from "react"
import type { ChatBranchListEntry } from "../../../../shared/types"
import { formatRelativeTime } from "../../../lib/formatters"
import { cn } from "../../../lib/utils"
import { Input } from "../../ui/input"
import { Skeleton } from "../../ui/skeleton"
import { ROW_HIGHLIGHT_CLASS, ROW_HOVER_CLASS } from "../widgets/WidgetCard"

export function BranchSearchInput({
  value,
  onChange,
  placeholder,
  disabled,
  trailingAction,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  trailingAction?: ReactNode
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn("h-9 pl-7 text-sm", trailingAction ? "pr-14" : undefined)}
        disabled={disabled}
      />
      {trailingAction ? <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailingAction}</div> : null}
    </div>
  )
}

/**
 * Search as the first row of a widget body rather than a boxed field: a
 * full-bleed strip over the list, like the Changes card's toolbar. Its glyph
 * sits in the header's 16px icon column and the text starts where the
 * header's title does, so it reads as part of the card, not a form in it.
 *
 * A combobox over the list below it: the arrow keys move the list's active
 * option, and the input never loses focus.
 */
export function BranchSearchRow({
  inputRef,
  value,
  onChange,
  placeholder,
  listId,
  activeOptionId,
  onKeyDown,
}: {
  inputRef?: Ref<HTMLInputElement>
  value: string
  onChange: (value: string) => void
  placeholder: string
  listId: string
  activeOptionId?: string
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex h-10 items-center gap-2 border-b border-border px-3">
      <span className="flex w-4 shrink-0 items-center justify-center">
        <Search className="size-3.5 text-muted-foreground" />
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        data-1p-ignore
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

/**
 * Row geometry shared by branch rows, their skeletons and the picker's extra
 * rows. The transparent border is room for the widget row highlight's border
 * (ROW_HIGHLIGHT_CLASS), so a lit row doesn't shift.
 */
export const BRANCH_ROW_CLASS = "flex w-full items-start gap-2 rounded-lg border border-transparent px-2 py-2 text-left"

export function BranchListSection({
  title,
  count,
  entries,
  emptyLabel,
  selectedName,
  activeOptionId,
  optionId,
  optionClassName,
  disabled,
  stickyTitle = false,
  rowClassName,
  footer,
  onSelect,
}: {
  title: string
  /** Muted after the title, e.g. how many open PRs there are in all. */
  count?: number
  entries: ChatBranchListEntry[]
  emptyLabel?: string
  selectedName?: string | null
  /**
   * For a list driven by a combobox: the option the arrow keys are on, each
   * row's option id, and the row's highlight classes, which the combobox
   * owns (it knows whether the pointer or the keys are driving).
   */
  activeOptionId?: string | null
  optionId?: (entry: ChatBranchListEntry) => string
  optionClassName?: (isActive: boolean) => string | undefined
  disabled?: boolean
  stickyTitle?: boolean
  /** Overrides row padding, e.g. to line icons up with a widget header. */
  rowClassName?: string
  /** A last row after the entries, e.g. "N more". */
  footer?: ReactNode
  onSelect: (entry: ChatBranchListEntry) => void
}) {
  if (entries.length === 0 && !emptyLabel) {
    return null
  }

  return (
    // No space between rows: they touch, so the highlight never drops out as
    // the pointer moves down the list. The label's padding spaces sections.
    <div role={optionId ? "group" : undefined} aria-label={optionId ? title : undefined}>
      <div className={cn(
        "flex items-baseline gap-1.5 px-1 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground",
        stickyTitle && "sticky top-0 z-10 bg-background"
      )}>
        <span>{title}</span>
        {count !== undefined ? <span className="tabular-nums tracking-normal text-muted-foreground/70">{count}</span> : null}
      </div>
      {entries.length === 0 ? (
        <div className="px-1 py-1 text-xs text-muted-foreground">{emptyLabel}</div>
      ) : (
        entries.map((entry) => {
          const isSelected = selectedName === entry.name
          const id = optionId?.(entry)
          const isActive = id !== undefined && id === activeOptionId
          return (
            <button
              key={entry.id}
              id={id}
              type="button"
              role={id ? "option" : undefined}
              aria-selected={id ? isActive : undefined}
              // Keeps focus in the search field when the list is a combobox's.
              tabIndex={id ? -1 : undefined}
              disabled={disabled}
              data-active={id ? isActive : undefined}
              onClick={() => onSelect(entry)}
              className={cn(
                BRANCH_ROW_CLASS,
                "disabled:opacity-60",
                rowClassName,
                optionClassName
                  ? optionClassName(isActive)
                  : isSelected ? cn(ROW_HIGHLIGHT_CLASS, "text-foreground") : ROW_HOVER_CLASS
              )}
            >
              {/* A 16px box, one text line tall, so the 14px glyph centers on
                  the first line and on any column of 16px icons above it. */}
              <span className="flex h-5 w-4 shrink-0 items-center justify-center">
                {entry.kind === "pull_request"
                  ? <GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />
                  : <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex w-full items-center gap-3">
                  <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-sm text-foreground">{entry.displayName}</div>
                  {entry.updatedAt ? (
                    <div className="ml-auto shrink-0 text-right text-[11px] text-muted-foreground">
                      {formatRelativeTime(entry.updatedAt)}
                    </div>
                  ) : null}
                </div>
                {(entry.kind === "pull_request" && entry.description) || entry.headLabel ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {entry.kind === "pull_request" ? (entry.description ?? entry.headLabel ?? entry.name) : (entry.headLabel ?? undefined)}
                  </div>
                ) : null}
              </div>
            </button>
          )
        })
      )}
      {footer}
    </div>
  )
}

// Fixed, uneven widths: branch names vary in length, and identical bars read
// as a table waiting for data rather than a list of names.
const SKELETON_NAME_WIDTHS = ["58%", "42%", "70%", "36%", "52%"]

/**
 * The branch list while it loads: a section label and rows in the real rows'
 * geometry (icon column, name, trailing age), so the list lands in place.
 */
export function BranchListSkeleton({ rows = 5, rowClassName }: { rows?: number; rowClassName?: string }) {
  return (
    <div aria-busy aria-label="Loading branches">
      <div className="px-1 pb-1.5 pt-2.5">
        <Skeleton className="h-2.5 w-14" />
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={cn(BRANCH_ROW_CLASS, "items-center", rowClassName)}>
          <span className="flex h-5 w-4 shrink-0 items-center justify-center">
            <Skeleton className="size-3.5 rounded-full" />
          </span>
          <Skeleton className="h-3 flex-none" style={{ width: SKELETON_NAME_WIDTHS[index % SKELETON_NAME_WIDTHS.length] }} />
          <Skeleton className="ml-auto h-2.5 w-7" />
        </div>
      ))}
    </div>
  )
}
