import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

import { getActiveTheme, isDarkTheme, subscribeTheme } from "@/services/theme"

const Toaster = ({ ...props }: ToasterProps) => {
  const mode = useSyncExternalStore(subscribeTheme, getActiveTheme)
  const theme: ToasterProps["theme"] = isDarkTheme(mode) ? "dark" : "light"

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      data-ws-part="app.toast"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          zIndex: "var(--ws-z-toast)",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
