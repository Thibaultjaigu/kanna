import type { KeyboardEvent, ReactNode } from "react"
import { Loader2 } from "lucide-react"
import type { ChatBrowserNotificationPreference } from "../../../shared/types"
import { cn } from "../../lib/utils"
import type { SettingsRowDef } from "./registry"

/** Shared row layout + tiny helpers for the settings sections. */

/**
 * Control widths, so every row's control lines up in one right-hand column
 * instead of each select and input sizing itself to its content.
 *
 * Breakpoints here are container queries (`@2xl:`) against the settings
 * column, not the viewport: with the app sidebar open the column can be
 * phone-narrow on a wide window, and a viewport breakpoint squeezed the row
 * text into a sliver beside a 240px input.
 */
export const SETTINGS_CONTROL_CLASS = "h-9 w-full @2xl:w-60"
export const SETTINGS_NUMBER_INPUT_CLASS = "hide-number-steppers h-9 w-full text-left font-mono @2xl:w-28 @2xl:text-right"

/**
 * Left/right inset for text that sits on the page above a card (group
 * headings, the section title): 1px card border + the rows' 16px padding, so
 * it lines up with the text inside the cards, the way iOS grouped lists do.
 * Anything that sits under a heading keeps px-4 so this one offset fits all.
 */
export const SETTINGS_INSET_X_CLASS = "px-[17px]"

/**
 * The card rows sit in, with a hairline between rows. overflow-hidden keeps
 * the palette's jump highlight inside the corners.
 */
export const SETTINGS_LIST_CARD_CLASS = "divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card/40"

/** Inline text actions inside a row description ("View tracked events", "Reset to …"). */
export const SETTINGS_INLINE_ACTION_CLASS =
  "font-medium text-foreground underline underline-offset-2 transition-colors hover:text-foreground/70"

export function getKeybindingsSubtitle(filePathDisplay: string) {
  return `Edit global app shortcuts stored in ${filePathDisplay}.`
}

export function shouldPreviewChatSoundChange(
  previousValue: string,
  nextValue: string
) {
  return previousValue !== nextValue
}

/**
 * A browser notification setting only sticks once the permission prompt was
 * granted; otherwise it falls back to "never" so the picker never claims an
 * option the browser will silently ignore.
 */
export function resolveChatBrowserNotificationPreferenceAfterPermission(
  requestedPreference: ChatBrowserNotificationPreference,
  permission: NotificationPermission | "unsupported"
): ChatBrowserNotificationPreference {
  if (requestedPreference === "never") return "never"
  return permission === "granted" ? requestedPreference : "never"
}

export function handleSettingsInputKeyDown(event: KeyboardEvent<HTMLInputElement>, commit: () => void) {
  if (event.key !== "Enter") return
  commit()
  event.currentTarget.blur()
}

/** Errors and warnings shown above or inside a section. */
export function SettingsNotice({
  tone = "error",
  children,
  className,
}: {
  tone?: "error" | "warning"
  children: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "whitespace-pre-wrap break-words rounded-lg border px-4 py-3 text-sm",
        tone === "error"
          ? "border-destructive/20 bg-destructive/5 text-destructive"
          : "border-border bg-card/40 text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SettingsErrorBanner({ message }: { message: string }) {
  return <SettingsNotice className="mb-6">{message}</SettingsNotice>
}

/** Loading and empty states: the same card everywhere, with an optional spinner. */
export function SettingsPlaceholder({
  loading = false,
  children,
  className,
}: {
  loading?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground",
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Small pill for states and tags ("Current", "Prerelease", plan names). */
export function SettingsBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground", className)}>
      {children}
    </span>
  )
}

/**
 * The heading every titled block in settings uses (row groups, Skills'
 * "Installed"). Styled like the sidebar's section labels (SectionHeader in
 * ThreadSections): quiet chrome you scan past, not a second title.
 */
export function SettingsGroupHeading({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className={cn("flex min-h-5 items-center justify-between gap-3 pb-2", SETTINGS_INSET_X_CLASS)}>
      <h3 className="text-sm text-slate-500 dark:text-slate-400">{children}</h3>
      {trailing}
    </div>
  )
}

/**
 * A titled card of rows. The divider lines come from the group, so a row that
 * renders conditionally (the custom editor template) never leaves a double or
 * missing border behind.
 */
export function SettingsGroup({
  title,
  trailing,
  children,
  className,
}: {
  title?: ReactNode
  /** Extra controls on the heading's right (Skills' spinner and filter). */
  trailing?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      {title ? <SettingsGroupHeading trailing={trailing}>{title}</SettingsGroupHeading> : null}
      <div className={SETTINGS_LIST_CARD_CLASS}>{children}</div>
    </section>
  )
}

/** Stacks groups with one rhythm across every section. */
export function SettingsGroups({ children }: { children: ReactNode }) {
  return <div className="space-y-10">{children}</div>
}

/** An input with the hint line under it ("1000–100000 lines (default)"). */
export function SettingsField({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 @2xl:w-auto @2xl:items-end">
      {children}
      {hint ? <div className="text-left text-xs text-muted-foreground @2xl:text-right">{hint}</div> : null}
    </div>
  )
}

type SettingsRowProps = {
  children: ReactNode
  alignStart?: boolean
  /** Indents a row that only exists because of the row above it. */
  nested?: boolean
  /**
   * Keeps a small control (a switch) beside the text at every width. Wide
   * controls instead drop under the text once the column gets narrow.
   */
  inlineControl?: boolean
  /** Overrides `def.description` when the rendered description is dynamic JSX. */
  description?: ReactNode
} & (
  | {
    /** Registry def: provides the anchor id (palette jump target) + title/description. */
    def: SettingsRowDef
    title?: string
  }
  | {
    def?: undefined
    title: string
    description: ReactNode
  }
)

export function SettingsRow({
  def,
  title,
  description,
  children,
  alignStart = false,
  nested = false,
  inlineControl = false,
}: SettingsRowProps) {
  return (
    <div
      id={def?.id}
      data-settings-row={def ? "" : undefined}
      className="scroll-mt-4 px-4"
    >
      <div
        className={cn(
          "flex py-3.5",
          inlineControl
            ? "items-center justify-between gap-4"
            : cn(
              "flex-col gap-3 @2xl:flex-row @2xl:justify-between @2xl:gap-8",
              alignStart ? "@2xl:items-start" : "@2xl:items-center",
            ),
          nested && "pl-6",
        )}
      >
        <div className="min-w-0 max-w-xl flex-1">
          <div className="text-sm font-medium text-foreground">{title ?? def?.title}</div>
          <div className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description ?? def?.description}</div>
        </div>
        <div
          className={cn(
            "flex items-center",
            inlineControl ? "shrink-0" : "w-full justify-start @2xl:w-auto @2xl:shrink-0 @2xl:justify-end",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
