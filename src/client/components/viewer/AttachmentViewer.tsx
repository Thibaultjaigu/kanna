import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, File, FileImage, FileJson, FileText, FileVideo, Link2, Sheet } from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "../../lib/utils"
import { formatAttachmentSize } from "../messages/AttachmentCard"
import {
  classifyAttachmentPreview,
  fetchTextPreview,
  parseDelimitedPreview,
  prettifyJson,
  TEXT_PREVIEW_LIMIT_BYTES,
  type AttachmentPreviewKind,
  type TablePreviewData,
} from "../messages/attachmentPreview"
import { FileContentView } from "../messages/FileContentView"
import { TranscriptMarkdown } from "../messages/shared"
import { Skeleton } from "../ui/skeleton"
import type { ViewerAttachment } from "../../stores/viewerStore"
import { ViewerIconButton, ViewerSurface, ViewerToggle } from "./ViewerSurface"

/** Rows and columns the table view reads: the viewer has the room, and a sort wants the rows. */
const VIEWER_TABLE_LIMITS = { rows: 1_000, columns: 50 }

/** A one-line row: text-xs's 16px line, py-1.5, and its 1px rule. */
const FILLER_ROW_HEIGHT = 29
/** An empty column past the data. */
const FILLER_COLUMN_WIDTH = 120

type TextKind = Extract<AttachmentPreviewKind, "markdown" | "text" | "json" | "table">

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: string; truncated: boolean; table?: TablePreviewData }

const KIND_ICONS: Record<AttachmentPreviewKind, typeof File> = {
  image: FileImage,
  video: FileVideo,
  pdf: FileText,
  markdown: FileText,
  text: FileText,
  json: FileJson,
  table: Sheet,
  external: File,
}

function absoluteUrl(url: string) {
  return new URL(url, document.baseURI || window.location.href).toString()
}

/** Reads a text-shaped attachment once per open, with the table parsed for the table view. */
function useTextContent(attachment: ViewerAttachment, kind: AttachmentPreviewKind): LoadState | null {
  const [state, setState] = useState<LoadState | null>(null)
  useEffect(() => {
    if (kind !== "markdown" && kind !== "text" && kind !== "json" && kind !== "table") {
      setState(null)
      return
    }
    const textKind: TextKind = kind
    let cancelled = false
    setState({ status: "loading" })
    fetchTextPreview(attachment.url, TEXT_PREVIEW_LIMIT_BYTES)
      .then(({ content, truncated }) => {
        if (cancelled) return
        if (textKind === "table") {
          const tab = attachment.mimeType === "text/tab-separated-values" || attachment.name.toLowerCase().endsWith(".tsv")
          setState({ status: "ready", content, truncated, table: parseDelimitedPreview(content, tab ? "\t" : ",", VIEWER_TABLE_LIMITS) })
          return
        }
        setState({ status: "ready", content: textKind === "json" ? prettifyJson(content) : content, truncated })
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : "Couldn't load this file." })
      })
    return () => {
      cancelled = true
    }
  }, [attachment.mimeType, attachment.name, attachment.url, kind])
  return state
}

/**
 * What a preview left out, briefly: "first 1,000 of 1,001 rows". A sort only
 * reorders what's shown, which "first" already says.
 */
export function truncationNotes(content: { truncated: boolean; table?: TablePreviewData }): string[] {
  const table = content.table
  return [
    content.truncated ? "first 1 MB" : null,
    table?.truncatedRows ? `first ${table.rows.length.toLocaleString()} of ${table.rowCount.toLocaleString()} rows` : null,
    table?.truncatedColumns ? `first ${VIEWER_TABLE_LIMITS.columns} of ${table.columnCount} columns` : null,
  ].filter((note): note is string => note !== null)
}

export type RenderView = "rendered" | "original"

function previewKind(attachment: ViewerAttachment) {
  return classifyAttachmentPreview({ mimeType: attachment.mimeType, displayName: attachment.name, size: attachment.size }).kind
}

/** Whether a file reads differently rendered than as its text: markdown, and CSV/TSV as a table. */
export function hasRenderedView(attachment: ViewerAttachment) {
  const kind = previewKind(attachment)
  return kind === "markdown" || kind === "table"
}

/** An attachment at full size: images and video fit, PDFs fill, text reads. */
export function AttachmentViewer({ attachment, onClose }: { attachment: ViewerAttachment; onClose: () => void }) {
  const kind = previewKind(attachment)
  const content = useTextContent(attachment, kind)
  const [view, setView] = useState<RenderView>("rendered")
  const Icon = KIND_ICONS[kind]
  // What was left out leads the subtitle, before type and size, rather than
  // taking a row of the body: it's the part of the file's description that
  // changes how you read what's below.
  const subtitle = [
    ...(content?.status === "ready" ? truncationNotes(content) : []),
    attachment.mimeType,
    attachment.size !== null ? formatAttachmentSize(attachment.size) : null,
  ].filter(Boolean).join(" · ")

  return (
    <ViewerSurface
      label={`Preview ${attachment.name}`}
      icon={<Icon />}
      title={attachment.name}
      subtitle={subtitle}
      onClose={onClose}
      center={hasRenderedView(attachment) ? (
        <ViewerToggle
          value={view}
          onChange={setView}
          options={[{ value: "rendered", label: "Preview" }, { value: "original", label: "Original" }]}
        />
      ) : undefined}
      toolbar={(
        <>
          <ViewerIconButton label="Copy link" onClick={() => void navigator.clipboard?.writeText(absoluteUrl(attachment.url))}><Link2 /></ViewerIconButton>
          <ViewerIconButton label="Open in new tab" onClick={() => window.open(absoluteUrl(attachment.url), "_blank", "noopener,noreferrer")}><ExternalLink /></ViewerIconButton>
        </>
      )}
      bodyClassName={kind === "image" || kind === "video" ? "bg-muted/30" : undefined}
    >
      <AttachmentBody attachment={attachment} kind={kind} content={content} view={view} />
    </ViewerSurface>
  )
}

/**
 * A file's rendered view on its own, for a viewer body that isn't an
 * attachment's: a changed markdown or CSV file, previewed from its diff.
 */
export function RenderedFilePreview({ attachment }: { attachment: ViewerAttachment }) {
  const kind = previewKind(attachment)
  const content = useTextContent(attachment, kind)
  return <AttachmentBody attachment={attachment} kind={kind} content={content} view="rendered" />
}

function AttachmentBody({ attachment, kind, content, view }: {
  attachment: ViewerAttachment
  kind: AttachmentPreviewKind
  content: LoadState | null
  view: RenderView
}) {
  if (kind === "image") {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <img src={attachment.url} alt={attachment.name} className="max-h-full max-w-full rounded-lg object-contain shadow-sm" />
      </div>
    )
  }
  if (kind === "video") {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <video src={attachment.url} controls className="max-h-full max-w-full rounded-lg" aria-label={attachment.name} />
      </div>
    )
  }
  if (kind === "pdf") {
    return <iframe src={attachment.url} title={attachment.name} className="size-full border-0" />
  }
  if (kind === "external") {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <File className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No preview for this kind of file.</p>
        <button
          type="button"
          onClick={() => window.open(absoluteUrl(attachment.url), "_blank", "noopener,noreferrer")}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          <ExternalLink className="size-3.5" /> Open in new tab
        </button>
      </div>
    )
  }
  if (!content || content.status === "loading") return <TextSkeleton />
  if (content.status === "error") {
    return <div className="flex min-h-full items-center justify-center p-6 text-sm text-destructive">{content.message}</div>
  }

  if (kind === "table" && content.table && view === "rendered") {
    return <SortableTable table={content.table} />
  }
  if (kind === "markdown" && view === "rendered") {
    return (
      // A reading measure: ~72 characters a line, centred, however wide the
      // viewer is. Long lines of prose are hard to track back across.
      <article className="mx-auto max-w-[72ch] px-6 py-8">
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <TranscriptMarkdown text={content.content} />
        </div>
      </article>
    )
  }
  return (
    <div className="p-4">
      <FileContentView content={content.content} />
    </div>
  )
}

// Uneven widths: text of varying length, not a grid waiting to fill.
const SKELETON_LINES = ["62%", "48%", "71%", "40%", "66%", "55%", "30%", "58%"]

function TextSkeleton() {
  return (
    <div className="mx-auto max-w-[72ch] space-y-3 px-6 py-8" aria-busy aria-label="Loading preview">
      {SKELETON_LINES.map((width, index) => <Skeleton key={index} className="h-3.5" style={{ width }} />)}
    </div>
  )
}

// Web addresses inside a cell, wherever they sit in its text.
const CELL_URL_PATTERN = /https?:\/\/[^\s<>"']+/gu

/**
 * A cell's text with its web addresses as links. They open in a new tab: the
 * viewer is where you're reading, and a link that replaced it would lose your
 * place in the table.
 */
export function CellText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(CELL_URL_PATTERN)) {
    // Trailing punctuation is the sentence's, not the address's.
    const url = match[0].replace(/[.,;:!?)\]]+$/u, "")
    const start = match.index ?? 0
    if (start > last) parts.push(text.slice(last, start))
    parts.push(
      <a
        key={start}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => event.stopPropagation()}
        className="text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
      >
        {url}
      </a>,
    )
    last = start + url.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

type SortState = { column: number; direction: "asc" | "desc" } | null

/** A cell as a number when it reads as one: "1,204", "$3.50", "42%", "-7". */
function numericValue(cell: string): number | null {
  const cleaned = cell.trim().replace(/[,$€£%]/gu, "")
  if (cleaned === "" || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/iu.test(cleaned)) return null
  return Number(cleaned)
}

/**
 * Sorts rows by one column. Numbers as numbers when both cells are numeric,
 * text otherwise (with digits in order: "item 2" before "item 10"). Empty
 * cells always sink to the bottom, whichever direction.
 */
export function sortTableRows(rows: readonly string[][], sort: SortState): string[][] {
  if (!sort) return [...rows]
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
  const factor = sort.direction === "asc" ? 1 : -1
  return [...rows].sort((left, right) => {
    const a = left[sort.column] ?? ""
    const b = right[sort.column] ?? ""
    if (!a.trim() || !b.trim()) return (a.trim() ? 0 : 1) - (b.trim() ? 0 : 1)
    const numberA = numericValue(a)
    const numberB = numericValue(b)
    if (numberA !== null && numberB !== null) return (numberA - numberB) * factor
    return collator.compare(a, b) * factor
  })
}

/**
 * A CSV as a table: sticky header, click a column to sort it (ascending,
 * descending, then back to the file's order), numbers aligned right.
 */
function SortableTable({ table }: { table: TablePreviewData }) {
  const [sort, setSort] = useState<SortState>(null)
  const [header = [], ...body] = table.rows
  const columnCount = Math.max(header.length, ...body.map((row) => row.length))
  const sorted = useMemo(() => sortTableRows(body, sort), [body, sort])
  const numericColumns = useMemo(() => Array.from({ length: columnCount }, (_, column) => {
    // The first column is the row's label, whatever it holds (an id, a
    // year): it reads left, where the eye starts each row.
    if (column === 0) return false
    const cells = body.map((row) => row[column] ?? "").filter((cell) => cell.trim())
    return cells.length > 0 && cells.every((cell) => numericValue(cell) !== null)
  }), [body, columnCount])

  function cycle(column: number) {
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: "asc" }
      if (current.direction === "asc") return { column, direction: "desc" }
      return null
    })
  }

  // The table is as wide as its content, from the left: two short columns
  // stay two short columns rather than spreading across the card. The rest of
  // the card is still grid, like a spreadsheet's empty cells: empty columns
  // to the right, blank rows below, as many as the card has room for. Always
  // one column at least, so a table wider than the card still ends in empty
  // grid when you scroll to its edge. Both come from measuring, so the real
  // columns keep their own widths.
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const tableRef = useRef<HTMLTableElement | null>(null)
  const lastHeaderRef = useRef<HTMLTableCellElement | null>(null)
  const bodyRef = useRef<HTMLTableSectionElement | null>(null)
  const [fill, setFill] = useState({ columns: 1, rows: 0, clipWidth: 0, height: 0 })

  useLayoutEffect(() => {
    const scroller = wrapperRef.current?.parentElement
    const tableElement = tableRef.current
    if (!scroller || !tableElement) return
    function measure() {
      const lastHeader = lastHeaderRef.current
      const tbody = bodyRef.current
      if (!scroller || !tableElement || !lastHeader || !tbody) return
      const top = tableElement.getBoundingClientRect()
      const spareWidth = scroller.clientWidth - (lastHeader.getBoundingClientRect().right - top.left)
      const spareHeight = scroller.clientHeight - (tbody.getBoundingClientRect().bottom - top.top)
      const columns = spareWidth > 0 ? Math.ceil(spareWidth / FILLER_COLUMN_WIDTH) : 1
      const rows = spareHeight > 0 ? Math.ceil(spareHeight / FILLER_ROW_HEIGHT) : 0
      // Rounding up overshoots the card; the overshoot is cut at its edge.
      const clipWidth = spareWidth > 0 ? scroller.clientWidth : 0
      const height = scroller.clientHeight
      setFill((current) => (
        current.columns === columns && current.rows === rows && current.clipWidth === clipWidth && current.height === height
          ? current
          : { columns, rows, clipWidth, height }
      ))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    observer.observe(tableElement)
    return () => observer.disconnect()
  }, [])

  const fillerCells = Array.from({ length: fill.columns }, (_, column) => (
    <td
      key={`filler-${column}`}
      aria-hidden
      className="border-b border-r border-border/60 p-0"
      style={{ width: FILLER_COLUMN_WIDTH, minWidth: FILLER_COLUMN_WIDTH }}
    />
  ))

  return (
    <div
      ref={wrapperRef}
      // The empty rows and columns round up to whole ones, so the last of
      // each is cut at the card's edge rather than adding a scroll of a few
      // pixels. Clip, not hidden: hidden would make this the scroller and
      // unstick the header.
      className={cn(
        fill.clipWidth > 0 ? "overflow-x-clip" : "min-w-max",
        fill.rows > 0 && "overflow-y-clip",
      )}
      style={{
        maxWidth: fill.clipWidth > 0 ? fill.clipWidth : undefined,
        maxHeight: fill.rows > 0 ? fill.height : undefined,
      }}
    >
      <table ref={tableRef} className="w-auto border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-background dark:bg-card">
          <tr>
            {Array.from({ length: columnCount }, (_, column) => {
              const active = sort?.column === column
              return (
                // The header's rules (under it, and after each column) are
                // inset shadows, not borders: in a collapsed table borders
                // belong to the grid, so they'd stay behind while the sticky
                // header moves. The last column keeps its rule too: the table
                // ends before the card does, and the rule closes it.
                <th
                  key={column}
                  ref={column === columnCount - 1 ? lastHeaderRef : undefined}
                  className="p-0 text-left font-medium shadow-[inset_0_-1px_0_hsl(var(--border)),inset_-1px_0_0_hsl(var(--border))]"
                >
                  <button
                    type="button"
                    onClick={() => cycle(column)}
                    aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "group/sort flex w-full items-center gap-1 px-3 py-2 transition-colors hover:bg-muted",
                      numericColumns[column] && "justify-end",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="truncate">{header[column] || `Column ${column + 1}`}</span>
                    {active
                      ? (sort.direction === "asc" ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" />)
                      : <ChevronsUpDown className="size-3 shrink-0 opacity-0 transition-opacity group-hover/sort:opacity-60" />}
                  </button>
                </th>
              )
            })}
            {Array.from({ length: fill.columns }, (_, column) => (
              <th
                key={`filler-${column}`}
                aria-hidden
                className="p-0 shadow-[inset_0_-1px_0_hsl(var(--border)),inset_-1px_0_0_hsl(var(--border))]"
                style={{ width: FILLER_COLUMN_WIDTH, minWidth: FILLER_COLUMN_WIDTH }}
              />
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {sorted.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-muted/40">
              {Array.from({ length: columnCount }, (_, column) => (
                <td
                  key={column}
                  className={cn(
                    // A full grid: row and column rules alike, in the body's
                    // softer tone, closed on the right like the header.
                    "max-w-[28rem] border-b border-r border-border/60 px-3 py-1.5 align-top text-foreground",
                    numericColumns[column] && "text-right tabular-nums",
                  )}
                >
                  <div className="whitespace-pre-wrap break-words">{row[column] ? <CellText text={row[column]!} /> : "\u00A0"}</div>
                </td>
              ))}
              {fillerCells}
            </tr>
          ))}
        </tbody>
        {fill.rows > 0 ? (
          <tbody aria-hidden>
            {Array.from({ length: fill.rows }, (_, rowIndex) => (
              <tr key={rowIndex}>
                {Array.from({ length: columnCount }, (_, column) => (
                  <td key={column} className="border-b border-r border-border/60 px-3 py-1.5">
                    <div>{"\u00A0"}</div>
                  </td>
                ))}
                {fillerCells}
              </tr>
            ))}
          </tbody>
        ) : null}
      </table>
    </div>
  )
}
