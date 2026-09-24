import { create } from "zustand"
import type { ChartToolPayload, DisplayAttachment } from "../../shared/display-tools"
import type { ChatAttachment } from "../../shared/types"

/**
 * The one viewer: what the elevated card over the chat is showing, if
 * anything. A changed file's diff, an attachment, or a chart at full size all
 * open here, so they share one surface, one chrome and one set of keys, and
 * nothing else in the app keeps a modal of its own for them.
 *
 * Not persisted: a view is something you're doing, not a place to come back
 * to after a reload.
 */

/** An attachment from anywhere (the composer, a prompt, an agent's send), in one shape. */
export interface ViewerAttachment {
  url: string
  name: string
  mimeType: string
  size: number | null
}

export type ViewerItem =
  | { kind: "diff"; projectId: string; path: string }
  | { kind: "attachment"; attachment: ViewerAttachment }
  | { kind: "chart"; payload: ChartToolPayload }

interface ViewerState {
  item: ViewerItem | null
  open: (item: ViewerItem) => void
  close: () => void
}

export const useViewerStore = create<ViewerState>()((set) => ({
  item: null,
  open: (item) => set({ item }),
  close: () => set({ item: null }),
}))

export function openViewer(item: ViewerItem) {
  useViewerStore.getState().open(item)
}

export function viewerAttachmentFromChat(attachment: ChatAttachment): ViewerAttachment {
  return { url: attachment.contentUrl, name: attachment.displayName, mimeType: attachment.mimeType, size: attachment.size }
}

export function viewerAttachmentFromDisplay(attachment: DisplayAttachment): ViewerAttachment {
  return { url: attachment.url, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size }
}

/** The path the viewer shows a diff of, in this project, or null. */
export function useReviewedPath(projectId: string | null) {
  return useViewerStore((store) => (
    projectId && store.item?.kind === "diff" && store.item.projectId === projectId ? store.item.path : null
  ))
}
