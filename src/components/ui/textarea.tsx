import * as React from "react"

import { cn } from "@/lib/utils"
import { useI18n } from "@/i18n"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, placeholder, ...props }, ref) => {
    const { t } = useI18n()
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        placeholder={typeof placeholder === "string" ? t(placeholder) : placeholder}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
