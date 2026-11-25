import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn("flex h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base outline-none transition-shadow placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 disabled:opacity-50", className)} {...props} />;
}
