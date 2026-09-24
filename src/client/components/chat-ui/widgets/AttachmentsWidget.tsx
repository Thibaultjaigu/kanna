import { ArrowUpRight, FileText, Film, Paperclip } from "lucide-react"
import { useState } from "react"
import { cn } from "../../../lib/utils"
import { WidgetCard, WIDGET_ROW_CLASS } from "./WidgetCard"
import type { WidgetAttachment } from "./derive"

function openInNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer")
}

/** Fades in once decoded, over the tile's muted placeholder, instead of popping. */
function AttachmentThumbnail({ url, name }: { url: string; name: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      src={url}
      alt={name}
      loading="lazy"
      onLoad={() => setLoaded(true)}
      // A cached image can finish before the load listener is attached.
      ref={(img) => {
        if (img?.complete && img.naturalWidth > 0) setLoaded(true)
      }}
      className={cn("size-full object-cover transition-opacity duration-200 ease-snappy", loaded ? "opacity-100" : "opacity-0")}
    />
  )
}

/**
 * Files the agent sent this chat (send_attachments, generate_images), newest
 * first. Images show as a thumbnail grid; everything else as rows below them.
 * Either opens in a new tab.
 */
export function AttachmentsWidget({ attachments }: { attachments: WidgetAttachment[] }) {
  const images = attachments.filter((attachment) => attachment.kind === "image")
  const others = attachments.filter((attachment) => attachment.kind !== "image")
  return (
    <WidgetCard icon={<Paperclip />} title="Attachments" count={attachments.length}>
      {/* Scrolls inside a cap: a chat that generated dozens of images would
          otherwise push every widget below it off screen. No overscroll
          containment, so a wheel that reaches the end carries on into the
          column instead of stalling in the middle of it. */}
      <div className="max-h-[40vh] overflow-y-auto">
        {images.length > 0 ? (
          // As many columns as fit, then every column grows to share the
          // leftover, so rows always reach both edges and thumbnails stay
          // about 96–128px however wide the sidebar is. auto-fill (not
          // auto-fit) keeps one or two images that size instead of stretching
          // them across the card.
          //
          // Cells touch: each carries 3px of padding and draws its tile
          // inside, so two cells read as the old 6px gap but the pointer never
          // crosses dead space between tiles. The wrapper's 3px brings the
          // outer edge back to the card's 6px body inset.
          <div className={cn("grid grid-cols-[repeat(auto-fill,minmax(102px,1fr))] px-[3px] pt-[3px]", others.length === 0 && "pb-[3px]")}>
            {images.map((image) => (
              <button
                key={image.key}
                type="button"
                title={image.name}
                onClick={() => openInNewTab(image.url)}
                className="group/tile p-[3px]"
              >
                {/* The border lights on hover (dimming would read as
                    disabled), instantly like every list highlight, and the
                    tile gives under a press. */}
                <span className="block aspect-square overflow-hidden rounded-lg border border-border bg-muted transition-[scale] duration-150 ease-snappy group-hover/tile:border-foreground/25 group-active/tile:scale-[0.97]">
                  <AttachmentThumbnail url={image.url} name={image.name} />
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {others.length > 0 ? (
          // Touching the grid above, so the pointer goes from the last tile
          // to the first row without passing through dead space.
          <div className={cn("px-1.5 pb-1.5", images.length === 0 && "pt-1.5")}>
            {others.map((attachment) => (
              <button
                key={attachment.key}
                type="button"
                title={attachment.name}
                onClick={() => openInNewTab(attachment.url)}
                className={WIDGET_ROW_CLASS}
              >
                {attachment.kind === "video"
                  ? <Film className="size-4 shrink-0 text-muted-foreground" />
                  : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </WidgetCard>
  )
}
