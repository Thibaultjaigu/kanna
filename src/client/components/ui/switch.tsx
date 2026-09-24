import { cn } from "../../lib/utils"

interface SwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

/**
 * A binary on/off control. Settings used an "Off | On" segmented control for
 * these, which read like a choice between two modes rather than a toggle.
 */
export function Switch({ checked, onCheckedChange, disabled, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={props["aria-label"]}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
        "transition-colors duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-slate-300 dark:bg-white/15",
        className,
      )}
    >
      {/* Primary is near-white in dark mode, so the thumb flips to the page
          background when on and stays light when off. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none block size-4 rounded-full shadow-sm",
          "transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)]",
          checked ? "translate-x-4 bg-background" : "translate-x-0 bg-white dark:bg-foreground/80",
        )}
      />
    </button>
  )
}
