import { Code, Columns2, Rows3, WrapText } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "../../../lib/utils"
import type { ViewerAttachment } from "../../../stores/viewerStore"
import { hasRenderedView, RenderedFilePreview } from "../../viewer/AttachmentViewer"
import { ViewerDivider, ViewerIconButton, ViewerSurface, ViewerToggle } from "../../viewer/ViewerSurface"
import { DiffPatchView } from "./DiffPatchView"
import { DiffFileStat, diffStatus, splitDiffPath, type DiffFile, type DiffRenderMode } from "./shared"

interface PatchEntry {
  /** The file's patch digest when this was read: a new digest means read again. */
  digest: string
  patch?: string
  error?: string
  loading: boolean
}

/**
 * A changed file as it reads now, from the working tree. The digest rides
 * along in the address so an edit reads the file again rather than a cached
 * copy (the server only looks at the path).
 */
function workingTreeAttachment(projectId: string, file: DiffFile): ViewerAttachment {
  return {
    url: `/api/projects/${projectId}/files/${encodeURIComponent(file.path)}/content?v=${encodeURIComponent(file.patchDigest)}`,
    name: splitDiffPath(file.path).name,
    mimeType: file.mimeType ?? "text/plain",
    size: file.size ?? null,
  }
}

/** What the viewer needs from the page to show diffs: the files, and how to read and open them. */
export interface DiffViewerContext {
  /** The project these files belong to: a diff opened in another shows nothing. */
  projectId: string
  files: DiffFile[]
  editorLabel: string
  diffRenderMode: DiffRenderMode
  wrapLines: boolean
  onDiffRenderModeChange: (mode: DiffRenderMode) => void
  onWrapLinesChange: (wrap: boolean) => void
  onLoadPatch: (path: string) => Promise<string>
  onOpenFile: (path: string) => void
}

/**
 * A changed file's diff, in the viewer. The Changes card lists files; this is
 * where one reads, one at a time, at the width a sidebar never gives it,
 * side-by-side included. Stepping moves through the Changes list in order.
 */
export function DiffViewer({
  projectId,
  path,
  context,
  onNavigate,
  onClose,
}: {
  projectId: string
  path: string
  context: DiffViewerContext
  onNavigate: (path: string) => void
  onClose: () => void
}) {
  const { files } = context
  const [patches, setPatches] = useState<Record<string, PatchEntry>>({})
  // Diff or rendered, for files that have a rendered view (markdown, CSV).
  // Kept while stepping, so reading a run of docs rendered stays rendered;
  // a file without one shows its diff whatever this says.
  const [view, setView] = useState<"diff" | "rendered">("diff")
  const index = files.findIndex((file) => file.path === path)
  const file = index === -1 ? null : files[index]!
  const lastIndexRef = useRef(Math.max(0, index))
  if (index !== -1) lastIndexRef.current = index

  // The file went away (committed, discarded): show the one that took its
  // place in the list, or close once nothing is left to review.
  useEffect(() => {
    if (file) return
    if (files.length === 0) {
      onClose()
      return
    }
    onNavigate(files[Math.min(lastIndexRef.current, files.length - 1)]!.path)
  }, [file, files, onClose, onNavigate])

  const { onLoadPatch } = context
  const load = useCallback((target: DiffFile) => {
    setPatches((current) => ({ ...current, [target.path]: { digest: target.patchDigest, loading: true } }))
    onLoadPatch(target.path)
      .then((patch) => setPatches((current) => (
        current[target.path]?.digest === target.patchDigest
          ? { ...current, [target.path]: { digest: target.patchDigest, patch, loading: false } }
          : current
      )))
      .catch((error: unknown) => setPatches((current) => (
        current[target.path]?.digest === target.patchDigest
          ? { ...current, [target.path]: { digest: target.patchDigest, error: error instanceof Error ? error.message : String(error), loading: false } }
          : current
      )))
  }, [onLoadPatch])

  // Read the shown file, and the next one ahead of time so stepping forward
  // lands on a diff rather than a skeleton. A changed digest (the agent kept
  // editing) reads the file again.
  useEffect(() => {
    for (const target of [file, index === -1 ? null : files[index + 1]]) {
      if (!target) continue
      const entry = patches[target.path]
      if (!entry || entry.digest !== target.patchDigest) load(target)
    }
  }, [file, files, index, load, patches])

  const step = useCallback((delta: 1 | -1) => {
    if (files.length === 0) return
    const from = index === -1 ? lastIndexRef.current : index
    const next = files[Math.min(files.length - 1, Math.max(0, from + delta))]
    if (next && next.path !== path) onNavigate(next.path)
  }, [files, index, onNavigate, path])

  const attachment = useMemo(() => (file ? workingTreeAttachment(projectId, file) : null), [file, projectId])
  // A deleted file has nothing left in the working tree to render.
  const renderable = Boolean(attachment && file?.changeType !== "deleted" && hasRenderedView(attachment))
  const rendered = renderable && view === "rendered"

  if (!file) return null
  const status = diffStatus(file)
  const { name, folder } = splitDiffPath(file.path)
  const entry = patches[file.path]
  const isCurrent = entry?.digest === file.patchDigest

  return (
    <ViewerSurface
      label={`Review ${file.path}`}
      scrollKey={`${file.path}:${rendered ? "rendered" : "diff"}`}
      icon={<span className={cn("font-mono text-xs font-semibold", status.className)} title={status.label}>{status.letter}</span>}
      title={name}
      // RTL so a long folder loses its start, not its end; <bdi> keeps the
      // path reading left to right.
      subtitle={folder ? <span className="block truncate [direction:rtl] text-left"><bdi>{folder}</bdi></span> : undefined}
      navigation={{ index, count: files.length, onPrevious: () => step(-1), onNext: () => step(1) }}
      onClose={onClose}
      center={renderable ? (
        <ViewerToggle
          value={rendered ? "rendered" : "diff"}
          onChange={setView}
          options={[{ value: "diff", label: "Diff" }, { value: "rendered", label: "Preview" }]}
        />
      ) : undefined}
      toolbar={(
        <>
          <DiffFileStat additions={file.additions} deletions={file.deletions} className="px-1" />
          <ViewerDivider />
          {/* The diff's own controls, only while there's a diff to shape. */}
          {rendered ? null : (
            <>
              <ViewerIconButton label="Unified diff" active={context.diffRenderMode === "unified"} onClick={() => context.onDiffRenderModeChange("unified")}><Rows3 /></ViewerIconButton>
              <ViewerIconButton label="Side-by-side diff" active={context.diffRenderMode === "split"} onClick={() => context.onDiffRenderModeChange("split")}><Columns2 /></ViewerIconButton>
              <ViewerIconButton label={context.wrapLines ? "Disable word wrap" : "Enable word wrap"} active={context.wrapLines} onClick={() => context.onWrapLinesChange(!context.wrapLines)}><WrapText /></ViewerIconButton>
            </>
          )}
          <ViewerIconButton label={`Open in ${context.editorLabel}`} onClick={() => context.onOpenFile(file.path)}><Code /></ViewerIconButton>
        </>
      )}
    >
      {rendered && attachment ? <RenderedFilePreview key={file.path} attachment={attachment} /> : <DiffPatchView
        key={file.path}
        projectId={projectId}
        file={file}
        patch={isCurrent ? entry?.patch : undefined}
        patchError={isCurrent ? entry?.error : undefined}
        isLoading={!isCurrent || Boolean(entry?.loading)}
        diffRenderMode={context.diffRenderMode}
        wrapLines={context.wrapLines}
        onRetry={() => load(file)}
      />}
    </ViewerSurface>
  )
}
