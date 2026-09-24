import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { TooltipProvider } from "../../ui/tooltip"
import { DiffViewer } from "./DiffViewer"
import { diffStatus, splitDiffPath, type DiffFile } from "./shared"

const file = (path: string, overrides: Partial<DiffFile> = {}): DiffFile => ({
  path, changeType: "modified", isUntracked: false, additions: 3, deletions: 1, patchDigest: `d-${path}`, ...overrides,
})

describe("diffStatus", () => {
  test("reads like git, with untracked files counting as added", () => {
    expect(diffStatus(file("a.ts")).letter).toBe("M")
    expect(diffStatus(file("a.ts", { changeType: "added" })).letter).toBe("A")
    expect(diffStatus(file("a.ts", { isUntracked: true })).letter).toBe("A")
    expect(diffStatus(file("a.ts", { changeType: "deleted" })).letter).toBe("D")
    expect(diffStatus(file("a.ts", { changeType: "renamed" })).letter).toBe("R")
  })
})

describe("splitDiffPath", () => {
  test("splits the name from its folder", () => {
    expect(splitDiffPath("src/app/Page.tsx")).toEqual({ name: "Page.tsx", folder: "src/app" })
    expect(splitDiffPath("README.md")).toEqual({ name: "README.md", folder: "" })
  })
})

describe("DiffViewer", () => {
  test("opens on the file's name, its place in the list, and a skeleton while its patch loads", () => {
    const files = [file("src/a.ts"), file("src/b.ts"), file("src/c.ts")]
    const markup = renderToStaticMarkup(createElement(TooltipProvider, null, createElement(DiffViewer, {
      projectId: "p1",
      path: "src/b.ts",
      context: {
        files,
        editorLabel: "Cursor",
        diffRenderMode: "unified",
        wrapLines: false,
        onDiffRenderModeChange: () => {},
        onWrapLinesChange: () => {},
        onLoadPatch: () => new Promise<string>(() => {}),
        onOpenFile: () => {},
      },
      onNavigate: () => {},
      onClose: () => {},
    })))
    expect(markup).toContain(">b.ts<")
    expect(markup).toContain("2 of 3")
    expect(markup).toContain('aria-label="Loading diff"')
    expect(markup).toContain('aria-label="Side-by-side diff"')
  })
})
