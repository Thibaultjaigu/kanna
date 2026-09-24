import { describe, expect, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { GitWidgets, summarizeChanges, visibleHistoryEntries, canIgnoreDiffFile, canIgnoreDiffFolder, getPrimaryCommitActionPrefix, shouldLoadDiffPatchNow } from "./GitWidgets"
import { TooltipProvider } from "../../ui/tooltip"

describe("GitWidgets", () => {
  test("loads missing patches for expanded rows", () => {
    expect(shouldLoadDiffPatchNow({
      isCollapsed: false,
      hasPreviewAttachment: false,
      patch: undefined,
      patchError: undefined,
      isPatchLoading: false,
    })).toBe(true)
  })

  test("does not load patches for collapsed rows", () => {
    expect(shouldLoadDiffPatchNow({
      isCollapsed: true,
      hasPreviewAttachment: false,
      patch: undefined,
      patchError: undefined,
      isPatchLoading: false,
    })).toBe(false)
  })

  test("does not load patches for preview attachments", () => {
    expect(shouldLoadDiffPatchNow({
      isCollapsed: false,
      hasPreviewAttachment: true,
      patch: undefined,
      patchError: undefined,
      isPatchLoading: false,
    })).toBe(false)
  })

  test("does not load patches when patch content, loading state, or errors already exist", () => {
    expect(shouldLoadDiffPatchNow({
      isCollapsed: false,
      hasPreviewAttachment: false,
      patch: "diff --git a/app.ts b/app.ts",
      patchError: undefined,
      isPatchLoading: false,
    })).toBe(false)

    expect(shouldLoadDiffPatchNow({
      isCollapsed: false,
      hasPreviewAttachment: false,
      patch: undefined,
      patchError: "Failed to load patch",
      isPatchLoading: false,
    })).toBe(false)

    expect(shouldLoadDiffPatchNow({
      isCollapsed: false,
      hasPreviewAttachment: false,
      patch: undefined,
      patchError: undefined,
      isPatchLoading: true,
    })).toBe(false)
  })

  test("with no changes: no Changes section, just Branch and History", () => {
    const markup = renderToStaticMarkup(createElement(
      TooltipProvider,
      null,
      createElement(GitWidgets, {
        projectId: "project-1",
        diffs: {
          status: "ready",
          branchName: "main",
          defaultBranchName: "main",
          files: [],
          branchHistory: {
            entries: [{
              sha: "abc123",
              summary: "Initial commit",
              description: "Set up the project",
              authorName: "Kanna",
              authoredAt: new Date(Date.now() - 60_000).toISOString(),
              tags: ["v1.0.0"],
              githubUrl: "https://github.com/acme/repo/commit/abc123",
            }],
          },
        },
        editorLabel: "Cursor",
        diffRenderMode: "unified",
        wrapLines: false,
        onOpenFile: () => {},
        onOpenInFinder: () => {},
        onDiscardFile: () => {},
        onIgnoreFile: () => {},
        onIgnoreFolder: () => {},
        onCopyFilePath: () => {},
        onCopyRelativePath: () => {},
        onLoadPatch: async () => "",
        onListBranches: async () => ({ recent: [], local: [], remote: [], pullRequests: [], pullRequestsStatus: "unavailable" }),
        onCheckoutBranch: async () => {},
        onCreateBranch: async () => {},
        onGenerateCommitMessage: async () => ({ subject: "", body: "" }),
        onCommit: async () => null,
        onSyncWithRemote: async () => null,
        onDiffRenderModeChange: () => {},
        onWrapLinesChange: () => {},
      })
    ))

    // A clean tree drops the Changes section instead of saying "No changes".
    expect(markup).not.toContain("No changes")
    expect(markup).not.toContain("files changed")
    expect(markup).toContain("History")
    // One commit is a small card, so History starts open.
    expect(markup).toContain("Initial commit")
    expect(markup).toContain("main")
    // Nothing to commit, so no commit box.
    expect(markup).not.toContain("Commit message")
  })

  test("with changes: count, sync and commit box show; the file list waits for expand", () => {
    const markup = renderToStaticMarkup(createElement(
      TooltipProvider,
      null,
      createElement(GitWidgets, {
        projectId: "project-1",
        diffs: {
          status: "ready",
          branchName: "main",
          defaultBranchName: "main",
          behindCount: 3,
          hasOriginRemote: true,
          hasUpstream: true,
          originRepoSlug: "acme/repo",
          files: [{
            path: "src/app.ts",
            changeType: "modified",
            isUntracked: false,
            additions: 1,
            deletions: 1,
            patchDigest: "digest-1",
          }],
          branchHistory: { entries: [] },
        },
        editorLabel: "Cursor",
        diffRenderMode: "unified",
        wrapLines: false,
        onOpenFile: () => {},
        onOpenInFinder: () => {},
        onDiscardFile: () => {},
        onIgnoreFile: () => {},
        onIgnoreFolder: () => {},
        onCopyFilePath: () => {},
        onCopyRelativePath: () => {},
        onLoadPatch: async () => "",
        onListBranches: async () => ({ recent: [], local: [], remote: [], pullRequests: [], pullRequestsStatus: "unavailable" }),
        onCheckoutBranch: async () => {},
        onCreateBranch: async () => {},
        onGenerateCommitMessage: async () => ({ subject: "", body: "" }),
        onCommit: async () => null,
        onSyncWithRemote: async () => null,
        onDiffRenderModeChange: () => {},
        onWrapLinesChange: () => {},
      })
    ))

    expect(markup).toContain("1 file changed")
    // One file is a small change set: the list starts open.
    expect(markup).toContain("src/app.ts")
    // The Branches widget names the branch; its picker waits for expand.
    expect(markup).toContain(">main<")
    expect(markup).not.toContain("Search branches")
    expect(markup).toContain("Pull")
    expect(markup).toContain("3")
    expect(markup).toContain("Generate &amp; push to")
    // The message fields wait behind the pencil; the button generates one itself.
    expect(markup).toContain("Write commit message")
    expect(markup).not.toContain("Commit message\"")
    expect(markup).not.toContain("Generate commit message")
    expect(markup).not.toContain("Publish Branch")
  })

  // A static render reads the store's initial state (zustand's server
  // snapshot), so this pins the default; a toggle is the store's `expanded`
  // map, covered in rightSidebarStore.test.ts.
  test("a large Changes card starts collapsed behind a disclosure, counting files", () => {
    const markup = renderToStaticMarkup(createElement(
      TooltipProvider,
      null,
      createElement(GitWidgets, {
        projectId: "project-1",
        diffs: {
          status: "ready",
          branchName: "main",
          files: [
            { path: "src/app.ts", changeType: "modified", isUntracked: false, additions: 1, deletions: 1, patchDigest: "d1" },
            { path: "src/b.ts", changeType: "added", isUntracked: true, additions: 4, deletions: 0, patchDigest: "d2" },
            { path: "src/c.ts", changeType: "added", isUntracked: true, additions: 0, deletions: 0, patchDigest: "d3" },
            { path: "src/d.ts", changeType: "added", isUntracked: true, additions: 0, deletions: 0, patchDigest: "d4" },
          ],
          branchHistory: { entries: [] },
        },
        editorLabel: "Cursor",
        diffRenderMode: "unified",
        wrapLines: false,
        onOpenFile: () => {},
        onOpenInFinder: () => {},
        onDiscardFile: () => {},
        onIgnoreFile: () => {},
        onIgnoreFolder: () => {},
        onCopyFilePath: () => {},
        onCopyRelativePath: () => {},
        onLoadPatch: async () => "",
        onListBranches: async () => ({ recent: [], local: [], remote: [], pullRequests: [], pullRequestsStatus: "unavailable" }),
        onCheckoutBranch: async () => {},
        onCreateBranch: async () => {},
        onGenerateCommitMessage: async () => ({ subject: "", body: "" }),
        onCommit: async () => null,
        onSyncWithRemote: async () => null,
        onDiffRenderModeChange: () => {},
        onWrapLinesChange: () => {},
      })
    ))

    expect(markup).toContain("4 files changed")
    // Totals across the change set: +1 and +4 added, 1 removed.
    expect(markup).toContain(">+5<")
    expect(markup).toContain(">-1<")
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain("src/b.ts")
    expect(markup).not.toContain("Side-by-side diff")
    // No commits yet, so no History card.
    expect(markup).not.toContain(">History<")
  })

  test("the Changes header describes what will be committed", () => {
    const files = [
      { path: "a.ts", additions: 10, deletions: 2 },
      { path: "b.ts", additions: 5, deletions: 0 },
      { path: "c.ts", additions: 1, deletions: 7 },
    ]
    expect(summarizeChanges(files, new Set(["a.ts", "b.ts", "c.ts"])))
      .toEqual({ title: "3 files changed", additions: 16, deletions: 9 })
    expect(summarizeChanges(files, new Set(["a.ts", "c.ts"])))
      .toEqual({ title: "2 of 3 files changed", additions: 11, deletions: 9 })
    expect(summarizeChanges(files, new Set()))
      .toEqual({ title: "0 of 3 files changed", additions: 0, deletions: 0 })
    expect(summarizeChanges([files[0]!], new Set(["a.ts"])).title).toBe("1 file changed")
  })

  test("History lists 5 commits, then offers the rest of the 25", () => {
    const entries = Array.from({ length: 25 }, (_, index) => index)
    expect(visibleHistoryEntries(entries, false)).toEqual({ shown: [0, 1, 2, 3, 4], hiddenCount: 20 })
    expect(visibleHistoryEntries(entries, true)).toEqual({ shown: entries, hiddenCount: 0 })
    expect(visibleHistoryEntries([0, 1, 2], false)).toEqual({ shown: [0, 1, 2], hiddenCount: 0 })
  })

  test("a long History starts collapsed, counting only unpushed commits", () => {
    const entries = Array.from({ length: 25 }, (_, index) => ({
      sha: `sha${index}`,
      summary: `Commit number ${index}`,
      description: "",
      authoredAt: new Date(Date.now() - index * 60_000).toISOString(),
      tags: [],
    }))
    const markup = renderToStaticMarkup(createElement(
      TooltipProvider,
      null,
      createElement(GitWidgets, {
        projectId: "project-1",
        diffs: { status: "ready", branchName: "main", hasUpstream: true, aheadCount: 2, files: [], branchHistory: { entries } },
        editorLabel: "Cursor",
        diffRenderMode: "unified",
        wrapLines: false,
        onOpenFile: () => {},
        onOpenInFinder: () => {},
        onDiscardFile: () => {},
        onIgnoreFile: () => {},
        onIgnoreFolder: () => {},
        onCopyFilePath: () => {},
        onCopyRelativePath: () => {},
        onLoadPatch: async () => "",
        onListBranches: async () => ({ recent: [], local: [], remote: [], pullRequests: [], pullRequestsStatus: "unavailable" }),
        onCheckoutBranch: async () => {},
        onCreateBranch: async () => {},
        onGenerateCommitMessage: async () => ({ subject: "", body: "" }),
        onCommit: async () => null,
        onSyncWithRemote: async () => null,
        onDiffRenderModeChange: () => {},
        onWrapLinesChange: () => {},
      })
    ))

    expect(markup).toContain(">History<")
    // Not the length, which is the server's cap on any real repo.
    expect(markup).not.toContain(">25<")
    expect(markup).toContain(">2 unpushed<")
    expect(markup).not.toContain("Commit number 0<")
    expect(markup).not.toContain("Show 20 more")
  })

  test("labels the primary commit action for empty and filled messages", () => {
    expect(getPrimaryCommitActionPrefix({
      hasSummary: false,
      isGenerating: false,
      isCommitting: false,
      isGeneratedCommitInFlight: false,
      commitModeInFlight: null,
      primaryCommitMode: "commit_and_push",
    })).toBe("Generate & push to")

    expect(getPrimaryCommitActionPrefix({
      hasSummary: true,
      isGenerating: false,
      isCommitting: false,
      isGeneratedCommitInFlight: false,
      commitModeInFlight: null,
      primaryCommitMode: "commit_and_push",
    })).toBe("Commit & push to")

    expect(getPrimaryCommitActionPrefix({
      hasSummary: true,
      isGenerating: false,
      isCommitting: true,
      isGeneratedCommitInFlight: true,
      commitModeInFlight: "commit_and_push",
      primaryCommitMode: "commit_and_push",
    })).toBe("Pushing…")
  })

  test("renders nothing before the first git snapshot", () => {
    const markup = renderToStaticMarkup(createElement(
      TooltipProvider,
      null,
      createElement(GitWidgets, {
        projectId: "project-1",
        diffs: { status: "unknown", files: [], branchHistory: { entries: [] } },
        editorLabel: "Cursor",
        diffRenderMode: "unified",
        wrapLines: false,
        onOpenFile: () => {},
        onOpenInFinder: () => {},
        onDiscardFile: () => {},
        onIgnoreFile: () => {},
        onIgnoreFolder: () => {},
        onCopyFilePath: () => {},
        onCopyRelativePath: () => {},
        onLoadPatch: async () => "",
        onListBranches: async () => ({ recent: [], local: [], remote: [], pullRequests: [], pullRequestsStatus: "unavailable" }),
        onCheckoutBranch: async () => {},
        onCreateBranch: async () => {},
        onGenerateCommitMessage: async () => ({ subject: "", body: "" }),
        onCommit: async () => null,
        onSyncWithRemote: async () => null,
        onDiffRenderModeChange: () => {},
        onWrapLinesChange: () => {},
      })
    ))

    expect(markup).not.toContain("Open branch switcher")
    expect(markup).not.toContain("History")
  })

  test("shows push to github for an unpublished local branch without a remote", () => {
    const markup = renderToStaticMarkup(createElement(
      TooltipProvider,
      null,
      createElement(GitWidgets, {
        projectId: "project-1",
        diffs: {
          status: "ready",
          branchName: "feature/local-only",
          defaultBranchName: "main",
          hasUpstream: false,
          files: [],
          branchHistory: { entries: [] },
        },
        editorLabel: "Cursor",
        diffRenderMode: "unified",
        wrapLines: false,
        onOpenFile: () => {},
        onOpenInFinder: () => {},
        onDiscardFile: () => {},
        onIgnoreFile: () => {},
        onIgnoreFolder: () => {},
        onCopyFilePath: () => {},
        onCopyRelativePath: () => {},
        onLoadPatch: async () => "",
        onListBranches: async () => ({ recent: [], local: [], remote: [], pullRequests: [], pullRequestsStatus: "unavailable" }),
        onCheckoutBranch: async () => {},
        onCreateBranch: async () => {},
        onGenerateCommitMessage: async () => ({ subject: "", body: "" }),
        onCommit: async () => null,
        onSyncWithRemote: async () => null,
        onDiffRenderModeChange: () => {},
        onWrapLinesChange: () => {},
      })
    ))

    expect(markup).toContain("Push to GitHub")
    expect(markup).not.toContain("PR")
  })

  test("a published non-default branch keeps PR out of the header", () => {
    const markup = renderToStaticMarkup(createElement(
      TooltipProvider,
      null,
      createElement(GitWidgets, {
        projectId: "project-1",
        diffs: {
          status: "ready",
          branchName: "feature/branch-switcher",
          defaultBranchName: "main",
          hasOriginRemote: true,
          hasUpstream: true,
          originRepoSlug: "acme/repo",
          files: [],
          branchHistory: { entries: [] },
        },
        editorLabel: "Cursor",
        diffRenderMode: "unified",
        wrapLines: false,
        onOpenFile: () => {},
        onOpenInFinder: () => {},
        onDiscardFile: () => {},
        onIgnoreFile: () => {},
        onIgnoreFolder: () => {},
        onCopyFilePath: () => {},
        onCopyRelativePath: () => {},
        onLoadPatch: async () => "",
        onListBranches: async () => ({ recent: [], local: [], remote: [], pullRequests: [], pullRequestsStatus: "unavailable" }),
        onCheckoutBranch: async () => {},
        onCreateBranch: async () => {},
        onGenerateCommitMessage: async () => ({ subject: "", body: "" }),
        onCommit: async () => null,
        onSyncWithRemote: async () => null,
        onDiffRenderModeChange: () => {},
        onWrapLinesChange: () => {},
      })
    ))

    expect(markup).toContain("Fetch")
    // Open pull request sits with Merge in the Branch card's body, which a
    // static render leaves closed.
    expect(markup).not.toContain("Open pull request")
  })

  test("ignores new files whether untracked or staged, but never tracked files", () => {
    expect(canIgnoreDiffFile({
      path: "tmp.log",
      changeType: "added",
      isUntracked: true,
      additions: 0,
      deletions: 0,
      patchDigest: "digest-2",
    })).toBe(true)

    // A new file that has been staged (e.g. by the agent or a failed commit)
    // is still ignorable — the server unstages it first.
    expect(canIgnoreDiffFile({
      path: "tmp.log",
      changeType: "added",
      isUntracked: false,
      additions: 0,
      deletions: 0,
      patchDigest: "digest-2b",
    })).toBe(true)

    expect(canIgnoreDiffFile({
      path: "src/app.ts",
      changeType: "modified",
      isUntracked: false,
      additions: 0,
      deletions: 0,
      patchDigest: "digest-3",
    })).toBe(false)
  })

  test("ignores folders only for untracked files with a parent directory", () => {
    expect(canIgnoreDiffFolder({
      path: "tmp/cache/output.log",
      changeType: "added",
      isUntracked: true,
      additions: 0,
      deletions: 0,
      patchDigest: "digest-4",
    })).toBe(true)

    expect(canIgnoreDiffFolder({
      path: "scratch.log",
      changeType: "added",
      isUntracked: true,
      additions: 0,
      deletions: 0,
      patchDigest: "digest-5",
    })).toBe(false)

    expect(canIgnoreDiffFolder({
      path: "src/app.ts",
      changeType: "modified",
      isUntracked: false,
      additions: 0,
      deletions: 0,
      patchDigest: "digest-6",
    })).toBe(false)
  })
})
