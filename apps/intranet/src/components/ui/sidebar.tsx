"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeft } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MobileDrawer } from "@/components/ui/mobile-drawer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "3.25rem";
const SIDEBAR_STORAGE_KEY = "advantis:sidebar";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  /** Customizing the nav — the page behind dims and blurs until it's done. */
  editing: boolean;
  setEditing: (editing: boolean) => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

export function SidebarProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = React.useState(false);
  const [open, setOpenState] = React.useState(true);
  const [editing, setEditingState] = React.useState(false);

  // Restore the desktop collapsed/expanded preference after mount so the
  // server and first client render agree (avoids a hydration mismatch).
  React.useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "collapsed") setOpenState(false);
  }, []);

  // The shell below is pinned to the viewport and <main> is the scroll
  // container, so the document must not scroll at all — see
  // `.app-shell-locked` in globals.css. Scoped to this provider's lifetime
  // because the pages outside the app shell scroll normally.
  React.useEffect(() => {
    document.documentElement.classList.add("app-shell-locked");
    return () => document.documentElement.classList.remove("app-shell-locked");
  }, []);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? "expanded" : "collapsed");
  }, []);

  // The icon rail has no room to rearrange anything, so editing opens it up
  // for the duration without touching the saved collapsed preference.
  const setEditing = React.useCallback((value: boolean) => {
    setEditingState(value);
    if (value) setOpenState(true);
    else if (window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed") setOpenState(false);
  }, []);

  React.useEffect(() => {
    if (!editing) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setEditing(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, setEditing]);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      setOpenMobile((o) => !o);
    } else {
      setOpen(!open);
    }
  }, [isMobile, open, setOpen]);

  // ⌘B / Ctrl-B toggles the sidebar.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      state: open ? "expanded" : "collapsed",
      open,
      setOpen,
      openMobile,
      setOpenMobile,
      isMobile,
      toggleSidebar,
      editing,
      setEditing,
    }),
    [open, setOpen, openMobile, isMobile, toggleSidebar, editing, setEditing],
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>
        <div
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            } as React.CSSProperties
          }
          // Pinned to the viewport so <main> can be the scroll container.
          // Height comes from `.app-shell-viewport` (dvh) rather than
          // `inset-0`, which would resolve against the large viewport and
          // hide the bottom nav under a phone's URL bar. Print has to undo
          // that: a fixed, overflow-hidden box is one viewport tall, so
          // everything below the fold is clipped and the job ends after
          // page one.
          className={cn(
            "app-shell-viewport fixed inset-x-0 top-0 flex overflow-hidden print:static print:block print:h-auto print:overflow-visible",
            className,
          )}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

/**
 * The sidebar surface. Renders as a slide-in Sheet on mobile and as a
 * collapsible (icon-rail) aside on desktop. The same children are used for
 * both so the navigation is defined once.
 */
export function Sidebar({
  children,
  className,
  ariaLabel = "Sidebar",
  "data-tour": dataTour,
}: {
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  "data-tour"?: string;
}) {
  const { isMobile, state, openMobile, setOpenMobile, editing, setEditing } = useSidebar();

  if (isMobile) {
    return (
      <MobileDrawer
        open={openMobile}
        onOpenChange={(value) => {
          setOpenMobile(value);
          if (!value) setEditing(false);
        }}
        ariaLabel={ariaLabel}
        data-tour={dataTour}
        className={cn("h-[94dvh]", editing && "ring-2 ring-sidebar-primary/50")}
      >
        {children}
      </MobileDrawer>
    );
  }

  return (
    <aside
      data-state={state}
      data-editing={editing ? "true" : undefined}
      data-tour={dataTour}
      aria-label={ariaLabel}
      className={cn(
        "group/sidebar relative z-30 hidden h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,box-shadow] duration-200 ease-linear print:hidden md:flex",
        state === "collapsed" ? "w-[var(--sidebar-width-icon)]" : "w-[var(--sidebar-width)]",
        editing &&
          "z-50 shadow-[0_24px_64px_-12px_rgb(0_0_0/0.45)] ring-1 ring-inset ring-sidebar-primary/40",
        className,
      )}
    >
      {children}
    </aside>
  );
}

/** Main content column that sits beside the sidebar. */
export function SidebarInset({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { editing, setEditing, isMobile } = useSidebar();
  return (
    <div className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col print:block", className)}>
      {children}
      {/* Clicking the dimmed page counts as "done". */}
      <div
        aria-hidden
        onClick={() => setEditing(false)}
        className={cn(
          "absolute inset-0 z-40 bg-background/40 backdrop-blur-[3px] transition-[opacity,backdrop-filter] duration-300",
          editing && !isMobile ? "opacity-100" : "pointer-events-none opacity-0 backdrop-blur-0",
        )}
      />
    </div>
  );
}

export function SidebarTrigger({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggleSidebar}
      aria-label="Toggle sidebar"
    >
      <PanelLeft className="h-5 w-5" />
    </Button>
  );
}

export function SidebarHeader({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-16 shrink-0 items-center gap-2 px-4 group-data-[state=collapsed]/sidebar:px-0 group-data-[state=collapsed]/sidebar:justify-center",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidebarContent({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-2 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidebarFooter({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // `shrink-0` so a long nav list eats into SidebarContent (which
        // scrolls) rather than compressing the footer's rows — the sidebar
        // and the mobile sheet both clip rather than scroll as a whole.
        "mt-auto flex shrink-0 flex-col gap-3 border-t border-sidebar-border px-4 py-3 group-data-[state=collapsed]/sidebar:items-center group-data-[state=collapsed]/sidebar:px-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidebarGroup({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div data-slot="sidebar-group" className={cn("flex flex-col gap-0.5 py-1", className)}>
      {children}
    </div>
  );
}

export function SidebarGroupLabel({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50 group-data-[state=collapsed]/sidebar:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SidebarMenu({ children, className }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("flex flex-col gap-0.5", className)}>{children}</ul>;
}

export function SidebarMenuItem({ children, className }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("relative", className)}>{children}</li>;
}

const sidebarMenuButtonVariants = cva(
  "group/menu-button flex w-full items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-left text-sm font-medium outline-none ring-sidebar-ring transition-colors focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-[18px] [&>svg]:shrink-0 group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-0",
  {
    variants: {
      active: {
        true: "bg-sidebar-accent text-sidebar-foreground [&>svg]:text-sidebar-primary",
        false: "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      },
    },
    defaultVariants: { active: false },
  },
);

interface SidebarMenuButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof sidebarMenuButtonVariants> {
  asChild?: boolean;
  tooltip?: string;
}

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ asChild = false, active, tooltip, className, children, ...props }, ref) => {
    const { state, isMobile } = useSidebar();
    const Comp = asChild ? Slot : "button";

    const button = (
      <Comp
        ref={ref}
        data-active={active ? "true" : undefined}
        className={cn(sidebarMenuButtonVariants({ active }), className)}
        {...props}
      >
        {children}
      </Comp>
    );

    if (!tooltip || isMobile || state !== "collapsed") {
      return button;
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" align="center">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    );
  },
);
SidebarMenuButton.displayName = "SidebarMenuButton";

export function SidebarMenuBadge({ children, className }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-[11px] font-semibold tabular-nums text-sidebar-primary-foreground group-data-[state=collapsed]/sidebar:hidden",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Label text that collapses away with the icon rail. */
export function SidebarLabel({ children, className }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("flex-1 truncate group-data-[state=collapsed]/sidebar:hidden", className)}>
      {children}
    </span>
  );
}
