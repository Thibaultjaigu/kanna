import { describe, expect, test } from "bun:test"
import { UpdateManager, type UpdateManagerDeps } from "./update-manager"

const NIGHTLY_SHA = `abc1234${"0".repeat(33)}`

function nightlyManager(overrides: Partial<UpdateManagerDeps> = {}) {
  return new UpdateManager({
    currentVersion: "0.69.0-nightly.abc1234",
    fetchLatestVersion: async () => "0.69.0",
    fetchLatestNightlySha: async () => NIGHTLY_SHA,
    installVersion: () => ({ ok: true, errorCode: null, userTitle: null, userMessage: null }),
    ...overrides,
  })
}

describe("nightly update checks", () => {
  test.each([
    [NIGHTLY_SHA, "up_to_date"],
    [`def5678${"0".repeat(33)}`, "available"],
  ])("compares the installed commit with %s", async (latestSha, status) => {
    const manager = nightlyManager({ fetchLatestNightlySha: async () => latestSha })
    const snapshot = await manager.checkForUpdates()
    expect(snapshot.nightly).toMatchObject({ status, latestCommitSha: latestSha, error: null })
    expect(snapshot.nightly?.lastCheckedAt).toBeNumber()
    expect(snapshot.status).toBe("up_to_date")
    expect(snapshot.updateAvailable).toBe(false)
  })

  test("shows checking while GitHub responds and shares concurrent checks", async () => {
    let resolveSha!: (sha: string) => void
    let calls = 0
    const response = new Promise<string>((resolve) => { resolveSha = resolve })
    const manager = nightlyManager({ fetchLatestNightlySha: () => { calls += 1; return response } })
    const first = manager.checkForUpdates()
    const second = manager.checkForUpdates({ force: true })
    expect(manager.getSnapshot().nightly?.status).toBe("checking")
    resolveSha(NIGHTLY_SHA)
    await Promise.all([first, second])
    expect(calls).toBe(1)
    expect(manager.getSnapshot().nightly?.status).toBe("up_to_date")
  })

  test("caches GitHub checks and lets Check again detect a new commit", async () => {
    let calls = 0
    const manager = nightlyManager({ fetchLatestNightlySha: async () => {
      calls += 1
      return calls === 1 ? NIGHTLY_SHA : `def5678${"0".repeat(33)}`
    } })
    await manager.checkForUpdates()
    await manager.checkForUpdates()
    expect(calls).toBe(1)
    await manager.checkForUpdates({ force: true })
    expect(calls).toBe(2)
    expect(manager.getSnapshot().nightly?.status).toBe("available")
  })

  test("clears the previous result if GitHub becomes unavailable", async () => {
    let fail = false
    const manager = nightlyManager({ fetchLatestNightlySha: async () => {
      if (fail) throw new Error("GitHub returned 403")
      return NIGHTLY_SHA
    } })
    await manager.checkForUpdates()
    fail = true
    const snapshot = await manager.checkForUpdates({ force: true })
    expect(snapshot.nightly).toMatchObject({ status: "error", latestCommitSha: null, error: "GitHub returned 403" })
    expect(snapshot.status).toBe("up_to_date")
  })

  test("keeps the nightly result if npm fails", async () => {
    const manager = nightlyManager({ fetchLatestVersion: async () => { throw new Error("npm unavailable") } })
    const snapshot = await manager.checkForUpdates()
    expect(snapshot.nightly?.status).toBe("up_to_date")
    expect(snapshot.status).toBe("error")
  })

  test("does not query GitHub for stable installs", async () => {
    let calls = 0
    const manager = nightlyManager({
      currentVersion: "0.69.0",
      fetchLatestNightlySha: async () => { calls += 1; return NIGHTLY_SHA },
    })
    const snapshot = await manager.checkForUpdates()
    expect(calls).toBe(0)
    expect(snapshot.nightly).toBeUndefined()
  })

  test("reports unknown status when the installed commit is invalid", async () => {
    const snapshot = await nightlyManager({ currentVersion: "0.69.0-nightly.invalid" }).checkForUpdates()
    expect(snapshot.nightly?.status).toBe("error")
  })

  test("does not replace restart status when an earlier check finishes", async () => {
    let resolveSha!: (sha: string) => void
    const manager = nightlyManager({
      fetchLatestNightlySha: () => new Promise((resolve) => { resolveSha = resolve }),
      installNightly: async () => ({
        ok: true, errorCode: null, userTitle: null, userMessage: null, version: "0.69.0-nightly.def5678",
      }),
    })
    const checking = manager.checkForUpdates()
    await manager.installNightly()
    resolveSha(NIGHTLY_SHA)
    await checking
    expect(manager.getSnapshot().status).toBe("restart_pending")
    expect(manager.getSnapshot().currentVersion).toBe("0.69.0-nightly.def5678")
  })
})

describe("UpdateManager", () => {
  test("tracks update lifecycle events", async () => {
    const events: Array<{ name: string; properties?: Record<string, unknown> }> = []
    const manager = new UpdateManager({
      currentVersion: "0.12.0",
      fetchLatestVersion: async () => "0.13.0",
      installVersion: () => ({
        ok: true,
        errorCode: null,
        userTitle: null,
        userMessage: null,
      }),
      trackEvent: (eventName, properties) => {
        events.push({ name: eventName, properties })
      },
    })

    await manager.checkForUpdates({ force: true })
    await manager.installUpdate()

    expect(events).toEqual([
      {
        name: "update_checked",
        properties: {
          latest_version: "0.13.0",
        },
      },
      {
        name: "update_installed",
        properties: {
          latest_version: "0.13.0",
        },
      },
    ])
  })

  test("detects available updates", async () => {
    const manager = new UpdateManager({
      currentVersion: "0.12.0",
      fetchLatestVersion: async () => "0.13.0",
      installVersion: () => ({
        ok: true,
        errorCode: null,
        userTitle: null,
        userMessage: null,
      }),
    })

    const snapshot = await manager.checkForUpdates({ force: true })

    expect(snapshot.status).toBe("available")
    expect(snapshot.updateAvailable).toBe(true)
    expect(snapshot.latestVersion).toBe("0.13.0")
    expect(snapshot.installAction).toBe("restart")
    expect(snapshot.reloadRequestedAt).toBeNull()
  })

  test("bypasses cache when force is true", async () => {
    let calls = 0
    const manager = new UpdateManager({
      currentVersion: "0.12.0",
      fetchLatestVersion: async () => {
        calls += 1
        return calls === 1 ? "0.12.1" : "0.13.0"
      },
      installVersion: () => ({
        ok: true,
        errorCode: null,
        userTitle: null,
        userMessage: null,
      }),
    })

    await manager.checkForUpdates()
    await manager.checkForUpdates({ force: true })

    expect(calls).toBe(2)
    expect(manager.getSnapshot().latestVersion).toBe("0.13.0")
  })

  test("surfaces install failures without clearing the running version", async () => {
    let installedVersion: string | null = null
    const manager = new UpdateManager({
      currentVersion: "0.12.0",
      fetchLatestVersion: async () => "0.13.0",
      installVersion: (_packageName, version) => {
        installedVersion = version
        return {
          ok: false,
          errorCode: "version_not_live_yet",
          userTitle: "Update not live yet",
          userMessage: "This update is still propagating. Try again in a few minutes.",
        }
      },
    })

    const result = await manager.installUpdate()

    expect(result).toEqual({
      ok: false,
      action: "restart",
      errorCode: "version_not_live_yet",
      userTitle: "Update not live yet",
      userMessage: "This update is still propagating. Try again in a few minutes.",
    })
    expect(installedVersion === "0.13.0").toBe(true)
    expect(manager.getSnapshot().status).toBe("error")
    expect(manager.getSnapshot().currentVersion).toBe("0.12.0")
  })

  test("installNightly builds main and moves to restart_pending with the stamped version", async () => {
    const events: Array<{ name: string; properties?: Record<string, unknown> }> = []
    const manager = new UpdateManager({
      currentVersion: "0.56.7",
      fetchLatestVersion: async () => "0.56.7",
      installVersion: () => ({ ok: true, errorCode: null, userTitle: null, userMessage: null }),
      installNightly: async () => ({
        ok: true,
        errorCode: null,
        userTitle: null,
        userMessage: null,
        version: "0.56.7-nightly.abc1234",
      }),
      trackEvent: (eventName, properties) => {
        events.push({ name: eventName, properties })
      },
    })

    const result = await manager.installNightly()

    expect(result.ok).toBe(true)
    expect(manager.getSnapshot().status).toBe("restart_pending")
    expect(manager.getSnapshot().currentVersion).toBe("0.56.7-nightly.abc1234")
    expect(typeof manager.getSnapshot().reloadRequestedAt).toBe("number")
    expect(events).toEqual([
      { name: "update_nightly_installed", properties: { nightly_version: "0.56.7-nightly.abc1234" } },
    ])
  })

  test("installNightly surfaces build failures without touching the running version", async () => {
    const manager = new UpdateManager({
      currentVersion: "0.56.7",
      fetchLatestVersion: async () => "0.56.7",
      installVersion: () => ({ ok: true, errorCode: null, userTitle: null, userMessage: null }),
      installNightly: async () => ({
        ok: false,
        errorCode: "install_failed",
        userTitle: "Nightly update failed",
        userMessage: "Nightly build step failed.",
        version: null,
      }),
    })

    const result = await manager.installNightly()

    expect(result.ok).toBe(false)
    expect(result.userTitle).toBe("Nightly update failed")
    expect(manager.getSnapshot().status).toBe("error")
    expect(manager.getSnapshot().currentVersion).toBe("0.56.7")
  })

  test("installNightly reports unavailable when the build hook is missing", async () => {
    const manager = new UpdateManager({
      currentVersion: "0.56.7",
      fetchLatestVersion: async () => "0.56.7",
      installVersion: () => ({ ok: true, errorCode: null, userTitle: null, userMessage: null }),
    })

    const result = await manager.installNightly()
    expect(result.ok).toBe(false)
    expect(result.userTitle).toBe("Nightly update unavailable")
  })

  test("installStable reinstalls the latest release even when versions match", async () => {
    // The way back from a nightly build: the stripped nightly version equals
    // the published release, so the normal update path would refuse.
    let installed: string | null = null
    const manager = new UpdateManager({
      currentVersion: "0.56.7-nightly.abc1234",
      fetchLatestVersion: async () => "0.56.7",
      installVersion: (_packageName, version) => {
        installed = version
        return { ok: true, errorCode: null, userTitle: null, userMessage: null }
      },
    })

    const result = await manager.installStable()

    expect(result.ok).toBe(true)
    expect(installed === "0.56.7").toBe(true)
    expect(manager.getSnapshot().status).toBe("restart_pending")
    expect(manager.getSnapshot().currentVersion).toBe("0.56.7")
  })

  test("always exposes an available reload action in dev mode", async () => {
    const manager = new UpdateManager({
      currentVersion: "0.12.0",
      fetchLatestVersion: async () => "9.9.9",
      installVersion: () => ({
        ok: true,
        errorCode: null,
        userTitle: null,
        userMessage: null,
      }),
      devMode: true,
    })

    expect(manager.getSnapshot()).toMatchObject({
      status: "available",
      updateAvailable: true,
      installAction: "restart",
      reloadRequestedAt: null,
    })

    const result = await manager.installUpdate()
    expect(result).toEqual({
      ok: true,
      action: "restart",
      errorCode: null,
      userTitle: null,
      userMessage: null,
    })
    expect(manager.getSnapshot().status).toBe("restart_pending")
    expect(typeof manager.getSnapshot().reloadRequestedAt).toBe("number")
  })
})
