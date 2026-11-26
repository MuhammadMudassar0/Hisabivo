"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {useLocale} from "../locale-provider";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;
export function DialogContent({ children, className, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const {locale}=useLocale();
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[3px]" /><DialogPrimitive.Content lang={locale} dir={locale==="ur"?"rtl":"ltr"} className={cn("dialog-content", className)} {...props}>{children}<DialogPrimitive.Close aria-label="Close dialog" className="dialog-close"><X size={20} /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal>;
}
