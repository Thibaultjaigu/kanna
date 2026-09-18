import { useEffect, useState } from "react"
import { isNightlyVersion } from "../../../shared/types"
import { SegmentedControl } from "../../components/ui/segmented-control"
import { SettingsHeaderButton } from "../../components/ui/settings-header-button"
import type { KannaState } from "../useKannaState"
import { SETTINGS_ROWS } from "./registry"
import { ENABLED_DISABLED_OPTIONS, SettingsErrorBanner, SettingsRow } from "./shared"

export function LabsSection({
  state,
  appVersion,
}: {
  state: Pick<
    KannaState,
    | "appSettings"
    | "handleWriteAppSettings"
    | "updateSnapshot"
    | "handleInstallNightly"
    | "handleInstallStable"
    | "handleCheckForUpdates"
  >
  appVersion: string
}) {
  const { appSettings, handleWriteAppSettings, updateSnapshot } = state
  const [error, setError] = useState<string | null>(null)

  async function handleRecentChatsChange(nextValue: "enabled" | "disabled") {
    try {
      setError(null)
      await handleWriteAppSettings({ newSidebarEnabled: nextValue === "enabled" })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save Labs settings.")
    }
  }

  async function handleWebglRendererChange(nextValue: "enabled" | "disabled") {
    try {
      setError(null)
      await handleWriteAppSettings({ terminal: { webglRenderer: nextValue === "enabled" } })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save Labs settings.")
    }
  }

  const recentChatsValue = appSettings?.newSidebarEnabled === false ? "disabled" : "enabled"
  const webglRendererValue = appSettings?.terminal.webglRenderer === true ? "enabled" : "disabled"

  const currentVersionLabel = updateSnapshot?.currentVersion ?? appVersion
  const isUpdating = updateSnapshot?.status === "updating" || updateSnapshot?.status === "restart_pending"
  const onNightly = isNightlyVersion(currentVersionLabel)
  const nightly = updateSnapshot?.nightly
  const checkForUpdates = state.handleCheckForUpdates
  const nightlyStatusLabel = isUpdating
    ? "Update in progress…"
    : nightly?.status === "up_to_date"
      ? "Latest nightly installed"
      : nightly?.status === "available"
        ? "New nightly available"
        : nightly?.status === "checking"
          ? "Checking latest nightly…"
          : nightly?.status === "error"
            ? "Could not check latest nightly"
            : "Latest nightly not checked yet"

  useEffect(() => {
    if (!onNightly) return
    const check = () => {
      if (document.visibilityState === "visible") void checkForUpdates()
    }
    check()
    const timer = window.setInterval(check, 5 * 60 * 1000)
    window.addEventListener("focus", check)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", check)
    }
  }, [checkForUpdates, onNightly])

  return (
    <>
      {error ? <SettingsErrorBanner message={error} /> : null}
      <div className="border-b border-border">
        <SettingsRow def={SETTINGS_ROWS.recentChatsInSidebar} bordered={false}>
          <SegmentedControl
            value={recentChatsValue}
            onValueChange={(value) => {
              void handleRecentChatsChange(value)
            }}
            options={ENABLED_DISABLED_OPTIONS}
            size="sm"
          />
        </SettingsRow>
        <SettingsRow def={SETTINGS_ROWS.terminalWebglRenderer}>
          <SegmentedControl
            value={webglRendererValue}
            onValueChange={(value) => {
              void handleWebglRendererChange(value)
            }}
            options={ENABLED_DISABLED_OPTIONS}
            size="sm"
          />
        </SettingsRow>
        <SettingsRow
          def={SETTINGS_ROWS.nightlyBuilds}
          title={onNightly ? `Nightly build ${currentVersionLabel}` : undefined}
          description={
            onNightly
              ? (
                <div className="flex flex-col gap-1">
                  <p role="status" className="font-medium text-foreground">{nightlyStatusLabel}</p>
                  {nightly?.latestCommitSha ? <p>Latest main: <code>{nightly.latestCommitSha.slice(0, 7)}</code></p> : null}
                  {nightly?.lastCheckedAt ? <p>Last checked {new Date(nightly.lastCheckedAt).toLocaleTimeString()}</p> : null}
                  {nightly?.error ? <p>{nightly.error}</p> : null}
                </div>
              )
              : undefined
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            {onNightly ? (
              <SettingsHeaderButton
                onClick={() => { void checkForUpdates({ force: true }) }}
                disabled={isUpdating || nightly?.status === "checking"}
              >
                Check again
              </SettingsHeaderButton>
            ) : null}
            {onNightly ? (
              <SettingsHeaderButton
                variant="outline"
                onClick={() => {
                  void state.handleInstallStable()
                }}
                disabled={isUpdating}
              >
                Back to stable
              </SettingsHeaderButton>
            ) : null}
            <SettingsHeaderButton
              variant="outline"
              onClick={() => {
                void state.handleInstallNightly()
              }}
              disabled={isUpdating}
            >
              {isUpdating ? "Updating…" : "Build Latest"}
            </SettingsHeaderButton>
          </div>
        </SettingsRow>
      </div>
    </>
  )
}
