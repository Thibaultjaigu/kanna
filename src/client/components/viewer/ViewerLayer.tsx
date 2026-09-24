import { lazy, Suspense } from "react"
import { useViewerStore } from "../../stores/viewerStore"
import type { DiffViewerContext } from "../chat-ui/git/DiffViewer"
import { cn } from "../../lib/utils"

// Each view loads with its first use: the diff renderer (shiki grammars),
// recharts and the markdown/table views are none of them first paint.
const DiffViewer = lazy(() => import("../chat-ui/git/DiffViewer").then((m) => ({ default: m.DiffViewer })))
const AttachmentViewer = lazy(() => import("./AttachmentViewer").then((m) => ({ default: m.AttachmentViewer })))
const ChartFullView = lazy(() => import("../messages/ChartTool").then((m) => ({ default: m.ChartFullView })))

/**
 * Where the viewer shows, and the one place it's mounted per page: the chat
 * page puts it over the chat (navbar, transcript, composer, terminal), the
 * export viewer over the whole page. It covers what it's placed in with the
 * page background, so nothing behind shows through, and sets the card 8px in,
 * the widget column's gutter.
 *
 * `diff` is what the page knows about the working tree; a page without one
 * (the export viewer) never opens a diff.
 */
export function ViewerLayer({ diff, className }: { diff?: DiffViewerContext; className?: string }) {
  const item = useViewerStore((store) => store.item)
  const open = useViewerStore((store) => store.open)
  const close = useViewerStore((store) => store.close)
  if (!item) return null
  if (item.kind === "diff" && (!diff || diff.projectId !== item.projectId)) return null

  return (
    <div className={cn("absolute inset-0 z-30 bg-background p-2", className)}>
      <Suspense fallback={null}>
        {item.kind === "diff" && diff ? (
          <DiffViewer
            projectId={item.projectId}
            path={item.path}
            context={diff}
            onNavigate={(path) => open({ kind: "diff", projectId: item.projectId, path })}
            onClose={close}
          />
        ) : item.kind === "attachment" ? (
          <AttachmentViewer attachment={item.attachment} onClose={close} />
        ) : item.kind === "chart" ? (
          <ChartFullView payload={item.payload} onClose={close} />
        ) : null}
      </Suspense>
    </div>
  )
}

/** Whether the viewer is open: the page makes what's under it inert. */
export function useViewerOpen() {
  return useViewerStore((store) => store.item !== null)
}
