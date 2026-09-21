import { useEffect, useRef, useState } from "react"
import { FileText, ArrowUpRight } from "lucide-react"
import { ChartTool } from "./ChartTool"
import { displayAttachments, type ChartToolPayload, type DisplayAttachment } from "../../../shared/display-tools"
import type { ProcessedToolCall } from "./types"
import { useToolPayload } from "./tool-payload-context"

export function DisplayToolMessage({ message }: { message: ProcessedToolCall }) {
  // Older cached updates can lack the result body even though the server has it.
  const fetchedResult = useToolPayload(message.resultTrimmed ? message.resultEntryId : undefined)
  const rawResult = fetchedResult?.kind === "tool_result" ? fetchedResult.content : message.rawResult
  if (!message.resultEntryId || (message.resultTrimmed && !fetchedResult)) return <p className="text-sm text-muted-foreground">{message.toolName === "show_chart" ? "Preparing chart" : message.toolName === "generate_images" ? "Generating images" : "Preparing attachments"}...</p>
  if (message.isError) return <p role="alert" className="text-sm text-destructive">{errorText(rawResult)}</p>
  if (message.toolKind !== "display") return null
  if (message.toolName === "show_chart") return <ChartTool payload={message.input.payload as unknown as ChartToolPayload} />
  return <AttachmentsCard attachments={displayAttachments(rawResult)} />
}

function errorText(result: unknown): string {
  if (Array.isArray(result)) return result.map(block => block?.text ?? "").join("\n") || "Could not display this result."
  return "Could not display this result."
}

export function AttachmentsCard({ attachments }: { attachments: DisplayAttachment[] }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set())
  const multiple = attachments.length > 1
  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [moreLeft, setMoreLeft] = useState(false)
  const [moreRight, setMoreRight] = useState(false)
  const [scrollbarHeight, setScrollbarHeight] = useState(0)
  const measure = () => {
    const scroller = scrollerRef.current
    if (!scroller) return
    setMoreLeft(scroller.scrollLeft > 1)
    setMoreRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1)
    setScrollbarHeight(scroller.offsetHeight - scroller.clientHeight)
  }
  useEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content || typeof ResizeObserver === "undefined") return
    // Images set the content width when they load, so watch both elements.
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])
  return (
      <div className="group relative -m-2 w-[calc(100%+1rem)] min-w-0 overflow-hidden" aria-label="Attachments">
        {/* The scrollbar keeps its space and only its thumb goes transparent. Removing it would change the row height on hover. */}
        <div ref={scrollerRef} onScroll={measure} className="attachments-scroller w-full snap-x scroll-px-2 overflow-x-auto">
          <div ref={contentRef} className="flex w-max min-w-full gap-2 p-2">
            {attachments.map((attachment, index) => {
              const failed = broken.has(attachment.url)
              const mediaClass = "block h-56 w-full rounded-[10px] border border-border bg-muted dark:bg-card object-contain"
              const imagePreview = attachment.kind === "image" && !failed
              const onError = () => setBroken(current => new Set(current).add(attachment.url))
              const imageLink = (
                <a href={attachment.url} target="_blank" rel="noreferrer noopener" className="block" aria-label={`Open ${attachment.name}`}>
                  {/* Load on mount because the image's dimensions determine the preview width. Every image has the same height. Only a panorama wider than the cap is cropped. */}
                  <img src={attachment.url} alt={attachment.name} referrerPolicy="no-referrer" className="block h-56 w-auto max-w-[32rem] rounded-[10px] object-cover shadow-md" onError={onError} />
                </a>
              )
              return (
                <figure key={`${attachment.url}-${index}`} className={imagePreview ? "m-0 flex w-fit shrink-0 snap-start flex-col items-start gap-1" : multiple ? "m-0 flex w-80 max-w-full shrink-0 snap-start flex-col gap-1" : "m-0 flex w-full min-w-0 max-w-lg flex-col gap-1"}>
                  {imagePreview ? (
                    imageLink
                  ) : attachment.kind === "video" && !failed ? (
                    <video src={attachment.url} controls preload="metadata" className={mediaClass} onError={onError} aria-label={attachment.name} />
                  ) : (
                    <a href={attachment.url} target="_blank" rel="noreferrer noopener" className="flex w-64 max-w-full items-center gap-3 rounded-[10px] border border-border bg-muted dark:bg-card p-3 text-sm hover:border-muted-foreground/50">
                      <FileText className="size-5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                      <ArrowUpRight className="size-4 shrink-0" />
                    </a>
                  )}
                  {failed && <span className="text-xs text-muted-foreground">Preview unavailable. Open the file to view it.</span>}
                </figure>
              )
            })}
          </div>
        </div>
        {/* A line marks each side that has more content past it. The lines are overlays, so they do not shift the row, and they stop above the scrollbar. */}
        {([["left-0", moreLeft], ["right-0", moreRight]] as const).map(([side, visible]) => (
          <span key={side} aria-hidden="true" className={`pointer-events-none absolute top-0 w-px bg-border transition-opacity ${side} ${visible ? "opacity-100" : "opacity-0"}`} style={{ bottom: scrollbarHeight }} />
        ))}
      </div>
  )
}
