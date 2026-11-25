import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 outline-none focus-visible:ring-[3px] focus-visible:ring-emerald-500/40 [&_svg]:pointer-events-none [&_svg]:size-4", {
  variants: {
    variant: { default: "bg-primary text-primary-foreground hover:bg-primary/90", outline: "border border-input bg-background hover:bg-muted", ghost: "hover:bg-muted", destructive: "bg-destructive text-white hover:bg-destructive/90" },
    size: { default: "h-10 px-4 py-2", sm: "h-9 px-3", lg: "h-12 px-6", icon: "size-9" },
  }, defaultVariants: { variant: "default", size: "default" },
});
function Button({ className, variant, size, asChild = false, type = "button", ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" type={asChild ? undefined : type} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { Button, buttonVariants };
