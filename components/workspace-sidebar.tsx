"use client";

import Link from "next/link";
import {useLocale} from "./locale-provider";
import { useEffect, useId, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { BookOpen, Leaf, LoaderCircle, LogOut, Menu, PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from "lucide-react";
import "@/app/workspace-sidebar.css";

type Props = {
  items: readonly { id: string; name: string; icon: LucideIcon }[];
  activeView: string;
  onNavigate: (view: string) => void;
  profileName: string;
  purposeName: string;
  demo: boolean;
  onExit: () => void;
  exitBusy: boolean;
  disabled: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
};
export default function WorkspaceSidebar({ items, activeView, onNavigate, profileName, purposeName, demo, onExit, exitBusy, disabled, collapsed, onCollapsedChange }: Props) {
  const {locale}=useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 701px)");
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const id = useId();
  const navId = `${id}-navigation`;
  function navigate(view: string) { onNavigate(view); setMobileOpen(false); }
  const logo = <><span className="wss-logo-icon"><BookOpen size={23} strokeWidth={1.7} /></span><span className="wss-brand-word">hisabivo<i>.</i></span></>;
  function navigation(mobile = false) {
    return <><div className="wss-nav-label">YOUR MONEY SPACE</div><nav className="wss-nav" id={mobile ? `${navId}-mobile` : navId} aria-label={mobile ? "Mobile workspace navigation" : "Workspace navigation"}>{items.map(item => <button type="button" key={item.id} onClick={() => navigate(item.id)} aria-label={item.name} aria-current={activeView === item.id ? "page" : undefined} title={collapsed && !mobile ? item.name : undefined} className={activeView === item.id ? "is-active" : ""}><item.icon size={20} strokeWidth={1.7} /><span>{item.name}</span>{item.id === "insights" && <small>NEW</small>}</button>)}</nav><div className="wss-bottom"><div className="wss-habit"><span><Leaf size={21} /></span><strong>Small entries.<br />A bigger picture.</strong><p>A minute today can make the end of the month feel a little simpler.</p></div><div className="wss-profile"><span className="wss-avatar" title={profileName}>{profileName.trim().slice(0, 1).toUpperCase() || "H"}</span><div className="wss-profile-copy"><strong>{profileName}</strong><span>{demo ? "Demo workspace" : purposeName}</span></div><button type="button" className="wss-exit" aria-label={demo ? "Exit demo" : "Sign out"} title={demo ? "Exit demo" : "Sign out"} disabled={disabled || exitBusy} onClick={() => { setMobileOpen(false); onExit(); }}>{exitBusy ? <LoaderCircle size={18} className="animate-spin" /> : <LogOut size={18} />}</button></div></div></>;
  }

  return <><aside className={`workspace-sidebar wss-desktop${collapsed ? " is-collapsed" : ""}`}><div className="wss-desktop-header"><Link href="/" className="wss-brand" aria-label="Hisabivo home" title={collapsed ? "Hisabivo home" : undefined}>{logo}</Link><button type="button" className="wss-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls={navId} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => onCollapsedChange(!collapsed)}>{collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}</button></div>{navigation()}</aside><header className="wss-mobile-header"><Link href="/" className="wss-brand" aria-label="Hisabivo home">{logo}</Link><DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}><DialogPrimitive.Trigger asChild><button type="button" className="wss-menu-trigger" aria-label="Open workspace menu"><Menu size={22} /><span>Menu</span></button></DialogPrimitive.Trigger><DialogPrimitive.Portal><DialogPrimitive.Overlay className="wss-mobile-overlay" /><DialogPrimitive.Content lang={locale} dir={locale==="ur"?"rtl":"ltr"} className="workspace-sidebar wss-drawer"><DialogPrimitive.Title className="sr-only">Your workspace menu</DialogPrimitive.Title><DialogPrimitive.Description className="sr-only">Choose a page in your private money space.</DialogPrimitive.Description><div className="wss-drawer-header"><Link href="/" className="wss-brand" aria-label="Hisabivo home">{logo}</Link><DialogPrimitive.Close asChild><button type="button" className="wss-drawer-close" aria-label="Close workspace menu"><X size={22} /></button></DialogPrimitive.Close></div>{navigation(true)}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root></header></>;
}
