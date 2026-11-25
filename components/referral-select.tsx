"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronsUpDown, Ellipsis, Globe, MessageCircle, PlayCircle, Search, Users } from "lucide-react";
import { referralSources, type Profile } from "@/lib/profile";

type Source = Profile["referral_source"];
type Props = {
  value: Source | "";
  onChange: (value: Source) => void;
  disabled?: boolean;
  invalid?: boolean;
};
const sourceDetails = {
  search: { icon: Globe, helper: "You were looking for a clearer money picture" },
  social_media: { icon: MessageCircle, helper: "A post, story, or someone you follow" },
  friend: { icon: Users, helper: "A recommendation from someone you know" },
  youtube: { icon: PlayCircle, helper: "A video, tutorial, or creator you watch" },
  other: { icon: Ellipsis, helper: "There’s a different story behind it" },
} satisfies Record<Source, { icon: typeof Globe; helper: string }>;

export default function ReferralSelect({ value, onChange, disabled = false, invalid = false }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [side, setSide] = useState<"top" | "bottom">("bottom");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-referral-options`;
  const selected = referralSources.find(source => source.id === value);
  const SelectedIcon = selected ? sourceDetails[selected.id].icon : Globe;
  const filtered = referralSources.filter(source => `${source.name} ${sourceDetails[source.id].helper}`.toLowerCase().includes(query.trim().toLowerCase()));
  const activeSource = filtered[activeIndex];

  function updateSide() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop || 0;
    const viewportHeight = viewport?.height || window.innerHeight;
    const below = viewportTop + viewportHeight - rect.bottom;
    const above = rect.top - viewportTop;
    setSide(below < Math.min(340, viewportHeight - 24) && above > below ? "top" : "bottom");
  }

  function show(last = false) {
    if (disabled) return;
    setQuery("");
    const selectedIndex = referralSources.findIndex(source => source.id === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : last ? referralSources.length - 1 : 0);
    updateSide();
    setOpen(true);
  }
  function close(returnFocus = false) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }
  function choose(source: Source) {
    onChange(source);
    close(true);
  }
  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!filtered.length) return;
      setActiveIndex(current => (current + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length);
    } else if (event.key === "Home" && !event.shiftKey) {
      event.preventDefault(); setActiveIndex(0);
    } else if (event.key === "End" && !event.shiftKey) {
      event.preventDefault(); setActiveIndex(Math.max(0, filtered.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeSource) choose(activeSource.id);
    } else if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); close(true);
    } else if (event.key === "Tab") {
      // Let the browser move focus naturally before removing the search field.
      window.setTimeout(() => close(), 0);
    }
  }

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    function focusOutside(event: FocusEvent) {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focusOutside);
    window.addEventListener("resize", updateSide);
    window.visualViewport?.addEventListener("resize", updateSide);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focusOutside);
      window.removeEventListener("resize", updateSide);
      window.visualViewport?.removeEventListener("resize", updateSide);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (open && activeSource) document.getElementById(`${listId}-${activeSource.id}`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeSource, listId]);

  return <div className={`referral-select${open ? " is-open" : ""}`} ref={wrapperRef}>
    <button
      ref={triggerRef}
      type="button"
      className="referral-trigger"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listId}
      aria-labelledby="referral-label"
      aria-invalid={invalid || undefined}
      disabled={disabled}
      onClick={() => open ? close() : show()}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); show(event.key === "ArrowUp");
        } else if (event.key === "Escape" && open) {
          event.preventDefault(); close(true);
        }
      }}
    >
      <span className="referral-source-icon" aria-hidden="true"><SelectedIcon size={19} strokeWidth={1.7} /></span>
      {selected ? <span className="referral-trigger-label">{selected.name}</span> : <span className="referral-trigger-placeholder">Choose how you found us</span>}
      <ChevronsUpDown size={17} strokeWidth={1.8} aria-hidden="true" />
    </button>
    {open && <div className="referral-popover" data-side={side}>
      <div className="referral-search">
        <Search size={17} strokeWidth={1.8} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search referral sources"
          aria-controls={listId}
          aria-activedescendant={activeSource ? `${listId}-${activeSource.id}` : undefined}
          placeholder="Search sources…"
          autoComplete="off"
          value={query}
          onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
          onKeyDown={onSearchKeyDown}
        />
      </div>
      <div className="referral-options" id={listId} role="listbox" aria-labelledby="referral-label">
        {filtered.map((source, index) => {
          const { icon: Icon, helper } = sourceDetails[source.id];
          return <div
            key={source.id}
            id={`${listId}-${source.id}`}
            role="option"
            aria-selected={source.id === value}
            data-active={index === activeIndex || undefined}
            data-selected={source.id === value || undefined}
            className="referral-option"
            tabIndex={-1}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={event => event.preventDefault()}
            onClick={() => choose(source.id)}
          >
            <span className="referral-source-icon" aria-hidden="true"><Icon size={19} strokeWidth={1.7} /></span>
            <span className="referral-option-copy"><strong>{source.name}</strong><small>{helper}</small></span>
            {source.id === value && <Check className="referral-check" size={18} strokeWidth={2} aria-hidden="true" />}
          </div>;
        })}
      </div>
      {!filtered.length && <div className="referral-empty" role="status">No sources found. Try another search.</div>}
      <div className="referral-popover-footer">A little context helps us make Hisabivo better.</div>
    </div>}
  </div>;
}
