import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import {
  AppWindow,
  ArrowLeftRight,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clapperboard,
  ClipboardPaste,
  Columns2,
  Copy,
  Diff,
  File,
  FileArchive,
  FileCode,
  FilePlus,
  FileText,
  Files,
  Filter,
  Folder,
  FolderPlus,
  FolderSync,
  GitCompare,
  HardDrive,
  History,
  Image,
  LayoutGrid,
  Link,
  List,
  ListFilter,
  ListTree,
  Menu,
  Moon,
  Monitor,
  Music,
  PanelLeft,
  Pencil,
  RefreshCw,
  RotateCcw,
  Ruler,
  Scale,
  Scissors,
  Search,
  Star,
  Table,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import {
  barPercent,
  barScale,
  displayPath,
  driveOf,
  flagVisible,
  listing,
  shadows,
  defaultColumns,
  useFiles,
  type ColumnWidths,
  type ConflictPolicy,
  type SortKey,
  type DateFormat,
  type ListRow,
  type PaneModel,
  type RibbonTab,
  type TimeFormat,
  type UiPrefs,
  type ViewMode,
} from "@/lib/file-store";
import { childrenOf, driveCaption, formatDate, formatSize, pathIds, resolvePath, typeLabel, type FsNode } from "@/lib/vfs";
import { bitlockerOff, bitlockerOn, bitlockerReadKey, bitlockerSaveKey, bitlockerStatus, bitlockerUnlock, chooseFolder, chooseKeyFile, diskPath, dragOut, driveMask, earlierCopy, earlierEntries, earlierList, isDesktop, isDiskId, listSnapshots, mapNetwork, measurePath, mountVolume, openExternal, peekFile, recoveryClear, recoverySave, recoveryStart, recoveryStatus, recoveryStop, removeSnapshot, restoreSetup, restoreSnapshot, restoreStatus, withoutDisk, type BitLockerDrive, type DiskSnapshot, type EarlierCopy, type EarlierEntry, type ExactSize, type FilePeek, type RecoveryHit, type RecoveryStatus, type RestoreStatus } from "@/lib/disk";
import { aboutInfo, manualSections } from "@/lib/manual";

const UI_KEY = "data-finder-ui";
const CATALOG_KEY = "data-finder-catalog";
const MB = 1024 * 1024;
const NO_CHILDREN: string[] = [];

function iconMetrics(mode: ViewMode, width: number) {
  if (mode === "list") return { cols: 1, rowH: 36 };
  if (mode === "content" || mode === "tiles") return { cols: 1, rowH: 56 };
  const min = mode === "xlarge" ? 140 : mode === "small" ? 92 : mode === "large" ? 128 : 112;
  const rowH = mode === "xlarge" ? 156 : mode === "large" ? 136 : mode === "small" ? 100 : 120;
  return { cols: Math.max(1, Math.floor(Math.max(min, width) / min)), rowH };
}

function shownSize(bytes: number | null | undefined, approx?: boolean, blocked?: boolean) {
  if (blocked) return "No access";
  return formatSize(bytes);
}

let typedName = "";
let typedAt = 0;

function revealRow(index: 0 | 1, pos: number) {
  const scroller = document.querySelector(`[data-pane="${index}"] [data-scroller]`) as HTMLElement | null;
  if (!scroller || pos < 0) return;
  const cols = Math.max(1, Number(scroller.getAttribute("data-cols") || 1));
  const rowH = Number(scroller.getAttribute("data-row-h") || 36);
  const top = Math.floor(pos / cols) * rowH;
  const bottom = top + rowH;
  if (top < scroller.scrollTop) scroller.scrollTop = top;
  else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
}

function shownName(name: string, kind: string, showExt: boolean) {
  if (showExt || kind !== "file") return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function FolderMark({ className = "size-4 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" className={className} aria-hidden="true">
      <path d="M3 8.4A2.4 2.4 0 0 1 5.4 6h3.1l1.7 1.8h8.4A2.4 2.4 0 0 1 21 10.2v.5H3V8.4Z" fill="var(--color-folder-back)" />
      <path d="M3 10.4h18V17.7A2.3 2.3 0 0 1 18.7 20H5.3A2.3 2.3 0 0 1 3 17.7V10.4Z" fill="var(--color-folder)" />
    </svg>
  );
}

function Icon({ node, className = "size-4 shrink-0" }: { node: Pick<FsNode, "kind" | "note"> & { name?: string }; className?: string }) {
  if (node.kind === "computer") return <Monitor className={`${className} text-accent`} />;
  if (node.kind === "drive") return <HardDrive className={`${className} text-accent`} />;
  if (node.kind === "dir") return <FolderMark className={className} />;
  const [Glyph, tint] = glyphFor(node.name, node.note != null);
  return <Glyph className={`${className} ${tint}`} />;
}

function glyphFor(name: string | undefined, hasNote: boolean): [typeof File, string] {
  const dot = name?.lastIndexOf(".") ?? -1;
  const ext = dot > 0 ? name!.slice(dot + 1).toLowerCase() : "";
  if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico", "tif", "tiff"].includes(ext)) return [Image, "text-sky-600"];
  if (["mp4", "mkv", "avi", "mov", "wmv", "webm"].includes(ext)) return [Clapperboard, "text-violet-500"];
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) return [Music, "text-pink-500"];
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return [Table, "text-green-600"];
  if (["zip", "rar", "7z", "iso", "cab", "tar", "gz"].includes(ext)) return [FileArchive, "text-amber-700"];
  if (["js", "ts", "tsx", "jsx", "py", "json", "xml", "html", "css", "ps1", "ini", "cfg"].includes(ext)) return [FileCode, "text-indigo-500"];
  if (["exe", "msi", "dll", "sys", "com", "bat", "cmd", "scr"].includes(ext)) return [AppWindow, "text-accent"];
  if (hasNote || ["txt", "md", "rtf", "doc", "docx", "pdf", "log"].includes(ext)) return [FileText, "text-sky-700"];
  return [File, "text-muted"];
}

function RibbonButton({
  label,
  icon,
  onClick,
  active,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={label}
      onClick={onClick}
      className={
        "flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] whitespace-nowrap " +
        (active ? "bg-select" : "hover:bg-header")
      }
    >
      {icon}
      <span className="leading-none">{label}</span>
    </button>
  );
}

function GroupBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col border-r border-ribbon-edge px-1">
      <div className="flex items-center">{children}</div>
      <div className="pb-0.5 text-center text-[11px] text-muted">{title}</div>
    </div>
  );
}

function SectionMenu({ label, children }: { label: string; children: ReactNode }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        className={"flex h-8 items-center gap-1 rounded-md px-2 text-[13px] " + (box ? "bg-select" : "hover:bg-header")}
        onClick={() => {
          if (box) {
            setBox(null);
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (!rect) return;
          setBox({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 252)), top: rect.bottom + 4 });
        }}
      >
        {label}
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      {box && (
        <>
          <button type="button" aria-label={`Close ${label}`} className="fixed inset-0 z-40 cursor-default" onClick={() => setBox(null)} />
          <div className="fixed z-50 max-h-[70vh] w-60 overflow-auto rounded-lg border border-line bg-menu p-1 shadow-xl" style={{ left: box.left, top: box.top }} onClick={() => setBox(null)}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

function MenuAction({ label, icon, disabled, onClick }: { label: string; icon?: ReactNode; disabled?: boolean; onClick: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-select disabled:opacity-40">
      <span className="grid size-4 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function MenuPop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div className="menu-card absolute top-full left-0 z-30 max-h-80 min-w-56 overflow-auto border border-line bg-menu p-1">{children}</div>
    </>
  );
}

function PlacesMenu({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const places = useFiles((s) => s.quickPlaces);
  const pins = useFiles((s) => s.pins);
  const nodes = useFiles((s) => s.nodes);
  const active = useFiles((s) => s.active);
  const openPath = (path: string) => {
    void useFiles.getState().openTypedPath(path);
    onClose();
  };
  const rows = places.length
    ? places
    : pins.map((path) => ({ name: path.split(/[/\\]/).filter(Boolean).pop() || path, path }));
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 280));
  return (
    <>
      <button type="button" aria-label="Close places" className="fixed inset-0 z-30 cursor-default" onClick={onClose} />
      <div className="menu-card fixed z-40 max-h-[70vh] w-64 overflow-auto border border-line bg-menu p-1" style={{ left, top: anchor.bottom + 4 }}>
        {rows.length === 0 && <p className="px-2 py-2 text-sm text-muted">No folders yet</p>}
        {rows.map((place) => (
          <button key={place.path} type="button" className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-select" title={place.path} onClick={() => openPath(place.path)}>
            <FolderMark className="size-4 shrink-0" />
            <span className="truncate">{place.name}</span>
          </button>
        ))}
        {rows.length === 0 && Object.values(nodes).filter((node) => node.kind === "dir").slice(0, 8).map((node) => (
          <button key={node.id} type="button" className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-select" onClick={() => { useFiles.getState().navigate(active, node.id); onClose(); }}>
            <FolderMark className="size-4 shrink-0" />
            <span className="truncate">{node.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function Chip({ on, children, onClick }: { on?: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "min-h-11 rounded-sm border px-3 text-sm " +
        (on ? "border-select-edge bg-select" : "border-line bg-pane hover:bg-header")
      }
    >
      {children}
    </button>
  );
}

function formatWhen(ts: number, date: DateFormat, time: TimeFormat) {
  if (!ts) return "";
  const value = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = value.getFullYear();
  const m = value.getMonth() + 1;
  const d = value.getDate();
  const datePart = date === "ymd" ? `${y}-${pad(m)}-${pad(d)}` : date === "dmy" ? `${pad(d)}/${pad(m)}/${y}` : `${m}/${d}/${y}`;
  if (time === "none") return datePart;
  const minutes = pad(value.getMinutes());
  if (time === "24") return `${datePart} ${pad(value.getHours())}:${minutes}`;
  const hours = value.getHours();
  return `${datePart} ${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

function LabeledSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="flex h-14 min-w-28 flex-col justify-center px-2 text-xs">
      <span className="text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 border border-line bg-pane px-1 text-sm text-ink">
        {children}
      </select>
    </label>
  );
}

function ViewMenu() {
  const viewMode = useFiles((s) => s.viewMode);
  const detailsOpen = useFiles((s) => s.detailsOpen);
  const previewOpen = useFiles((s) => s.previewOpen);
  const showNav = useFiles((s) => s.showNav);
  const compact = useFiles((s) => s.compact);
  const itemChecks = useFiles((s) => s.itemChecks);
  const showExt = useFiles((s) => s.showExt);
  const showHidden = useFiles((s) => s.filters.showHidden);
  const showReadonly = useFiles((s) => s.filters.showReadonly);
  const showSystem = useFiles((s) => s.filters.showSystem);
  const showBlocked = useFiles((s) => s.filters.showBlocked);
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const showRef = useRef<HTMLDivElement>(null);
  const showMenuRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const [showBox, setShowBox] = useState<{ left: number; top: number } | null>(null);
  const set = useFiles.getState().setOptions;
  const filters = useFiles.getState().setFilters;
  const keepShow = () => {
    if (showTimer.current != null) window.clearTimeout(showTimer.current);
  };
  const queueHideShow = () => {
    keepShow();
    showTimer.current = window.setTimeout(() => setShow(false), 400);
  };
  const placeShow = () => {
    const rect = showRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 248;
    const left = window.innerWidth - rect.right >= width ? rect.right - 12 : Math.max(8, rect.left - width + 12);
    setShowBox({ left, top: Math.max(8, Math.min(rect.top, window.innerHeight - 320)) });
    setShow(true);
    keepShow();
  };
  const row = (on: boolean, label: string, fn: () => void, icon?: ReactNode) => (
    <button
      type="button"
      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-select"
      onClick={fn}
    >
      <span className="grid w-4 shrink-0 place-items-center">{on ? <Check className="size-4" /> : null}</span>
      <span className="grid w-5 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
    </button>
  );
  const layouts: Array<[ViewMode, string, ReactNode]> = [
    ["xlarge", "Extra large icons", <LayoutGrid className="size-4" />],
    ["large", "Large icons", <LayoutGrid className="size-4" />],
    ["medium", "Medium icons", <LayoutGrid className="size-3.5" />],
    ["small", "Small icons", <LayoutGrid className="size-3" />],
    ["list", "List", <List className="size-4" />],
    ["details", "Details", <ListTree className="size-4" />],
    ["tiles", "Tiles", <Columns2 className="size-4" />],
    ["content", "Content", <FileText className="size-4" />],
  ];
  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        className={"flex h-8 items-center gap-1 rounded-md px-2 text-[13px] " + (open ? "bg-select" : "hover:bg-header")}
        onClick={() => {
          if (open) {
            setOpen(false);
            setShow(false);
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (!rect) return;
          setBox({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 272)), top: rect.bottom + 4 });
          setOpen(true);
        }}
      >
        <List className="size-4" />
        View
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      {open && box && (
        <>
          <button type="button" aria-label="Close view menu" className="fixed inset-0 z-40 cursor-default" onClick={() => { setOpen(false); setShow(false); }} />
          <div className="fixed z-50 max-h-[70vh] w-64 overflow-auto rounded-lg border border-line bg-menu p-1 shadow-xl" style={{ left: box.left, top: box.top }}>
            {layouts.map(([id, label, icon]) => (
              <span key={id}>{row(viewMode === id, label, () => { set({ viewMode: id }); setOpen(false); setShow(false); }, icon)}</span>
            ))}
            <div className="my-1 h-px bg-line" />
            {row(detailsOpen, "Details pane", () => set({ detailsOpen: !detailsOpen }), <PanelLeft className="size-4" />)}
            {row(previewOpen, "Preview pane", () => set({ previewOpen: !previewOpen }), <File className="size-4" />)}
            <div className="my-1 h-px bg-line" />
            <div
              ref={showRef}
              onMouseEnter={placeShow}
              onMouseLeave={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && showMenuRef.current?.contains(next)) return;
                queueHideShow();
              }}
            >
              <button
                type="button"
                className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-select"
                onClick={() => { if (show) setShow(false); else placeShow(); }}
              >
                <span className="grid w-4 shrink-0 place-items-center" />
                <span className="grid w-5 shrink-0 place-items-center text-muted"><List className="size-4" /></span>
                <span className="min-w-0 flex-1">Show</span>
                <ChevronRight className="size-3.5 text-muted" />
              </button>
            </div>
          </div>
          {show && showBox && (
            <div
              ref={showMenuRef}
              className="fixed z-[60] w-60 rounded-lg border border-line bg-menu p-1 shadow-xl"
              style={{ left: showBox.left, top: showBox.top }}
              onMouseEnter={keepShow}
              onMouseLeave={(event) => {
                const next = event.relatedTarget;
                if (next instanceof Node && showRef.current?.contains(next)) return;
                queueHideShow();
              }}
            >
              {row(showNav, "Navigation pane", () => set({ showNav: !showNav }), <PanelLeft className="size-4" />)}
              {row(compact, "Compact view", () => set({ compact: !compact }), <List className="size-4" />)}
              {row(itemChecks, "Item check boxes", () => set({ itemChecks: !itemChecks }), <Check className="size-4" />)}
              {row(showExt, "File name extensions", () => set({ showExt: !showExt }), <FileText className="size-4" />)}
              {row(showHidden, "Hidden items", () => filters({ showHidden: !showHidden }), <EyeOffIcon />)}
              {row(showReadonly, "Read-only items", () => filters({ showReadonly: !showReadonly }), <File className="size-4" />)}
              {row(showSystem, "System items", () => filters({ showSystem: !showSystem }), <HardDrive className="size-4" />)}
              {row(showBlocked, "No access folders", () => filters({ showBlocked: !showBlocked }), <Folder className="size-4" />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4" />
      <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9.5 4.5 10.5 7-0.4 1-1.2 2.3-2.3 3.5M6.1 6.1C4.2 7.4 2.8 9.2 1.5 12c1 2.5 5 7 10.5 7 1.3 0 2.5-.3 3.6-.8" />
    </svg>
  );
}

function TabRow() {
  const tab = useFiles((s) => s.tab);
  const reading = useFiles((s) => s.reading);
  const dark = useFiles((s) => s.dark);
  const [menu, setMenu] = useState(false);
  const tabs: Array<[RibbonTab, string]> = [
    ["home", "Home"],
    ["inspect", "Find"],
    ["keeps", "Keeps"],
    ["recovery", "Recovery"],
    ["decrypt", "Decryption"],
    ["resources", "Help"],
  ];
  const go = (id: RibbonTab) => useFiles.getState().setTab(id);
  return (
    <div className="flex shrink-0 items-end gap-1 bg-tab px-2 pt-1.5">
      <div className="relative mb-1 ml-0.5">
        <button type="button" aria-label="Application menu" className="grid size-8 place-items-center rounded-lg bg-accent text-accent-ink" onClick={() => setMenu((open) => !open)}>
          <Menu className="size-4" />
        </button>
        {menu && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setMenu(false)} />
            <div className="menu-card absolute top-full left-0 z-30 min-w-56 border border-line bg-menu py-1">
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { useFiles.getState().setOptions({ dark: !dark }); setMenu(false); }}>{dark ? "Light mode" : "Dark mode"}</button>
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { go("resources"); setMenu(false); }}>Help</button>
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { const state = useFiles.getState(); state.setTab("resources"); state.setHelpPage("about"); setMenu(false); }}>About</button>
            </div>
          </>
        )}
      </div>
      <div className="flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-selected={tab === id}
          onClick={() => go(id)}
          className={"app-tab shrink-0 text-sm " + (tab === id ? "font-semibold text-ink" : "text-muted hover:bg-header")}
        >
          {label}
        </button>
      ))}
      </div>
      {reading && (
        <button type="button" className="mb-1 ml-auto shrink-0 px-2 text-xs text-tab-ink" onClick={() => useFiles.getState().setOptions({ reading: false })}>
          Exit reading
        </button>
      )}
    </div>
  );
}

function Ribbon() {
  const tab = useFiles((s) => s.tab);
  return (
    <div className="shrink-0 border-b border-ribbon-edge bg-ribbon">
      {tab === "home" && <HomeRibbon />}
      {tab === "inspect" && <InspectRibbon />}
      {tab === "keeps" && <KeepsRibbon />}
      {tab === "recovery" && <RecoveryRibbon />}
      {tab === "decrypt" && <DecryptionRibbon />}
      {tab === "tools" && <ToolsRibbon />}
      {tab === "options" && <OptionsRibbon />}
      {tab === "resources" && <ResourcesRibbon />}
    </div>
  );
}

const dragSelect = { moved: false };
let desktopDragIds: string[] | null = null;

function dragPaths(ids: string[]) {
  const nodes = useFiles.getState().nodes;
  return ids
    .filter((id) => {
      const node = nodes[id];
      return node && (node.kind === "file" || node.kind === "dir");
    })
    .map((id) => diskPath(id))
    .filter((path): path is string => Boolean(path));
}

function armDesktopDrag(event: ReactPointerEvent, index: 0 | 1, nodeId: string | null | undefined) {
  if (!isDesktop() || event.button !== 0 || !nodeId) return;
  const state = useFiles.getState();
  const node = state.nodes[nodeId];
  if (!node || (node.kind !== "file" && node.kind !== "dir")) return;
  const selected = state.panes[index].selected;
  const ids = selected.includes(nodeId) ? selected.filter((id) => dragPaths([id]).length) : [nodeId];
  const paths = dragPaths(ids);
  if (!paths.length) return;
  event.stopPropagation();
  const startX = event.clientX;
  const startY = event.clientY;
  const move = (ev: PointerEvent) => {
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    dragSelect.moved = true;
    if (!useFiles.getState().panes[index].selected.includes(nodeId)) useFiles.getState().selectOnly(index, nodeId);
    const liveIds = useFiles.getState().panes[index].selected.includes(nodeId) ? useFiles.getState().panes[index].selected : [nodeId];
    const livePaths = dragPaths(liveIds);
    useFiles.getState().setDrag(liveIds);
    desktopDragIds = liveIds;
    void dragOut(livePaths.length ? livePaths : paths)
      .catch((cause: unknown) => useFiles.setState({ status: cause instanceof Error ? cause.message : "The drag did not start" }))
      .finally(() => {
        window.setTimeout(() => {
          desktopDragIds = null;
          useFiles.getState().setDrag(null);
        }, 400);
      });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function freshName(base: string) {
  const state = useFiles.getState();
  const parent = state.panes[state.active].pathId;
  const names = new Set((state.order[parent] ?? []).map((id) => state.nodes[id]?.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let n = 2;
  while (names.has(`${stem} (${n})${ext}`.toLowerCase())) n += 1;
  return `${stem} (${n})${ext}`;
}

function DriveMenu() {
  const nodes = useFiles((s) => s.nodes);
  const order = useFiles((s) => s.order);
  const showAll = useFiles((s) => s.showAllDrives);
  const pathId = useFiles((s) => s.panes[s.active].pathId);
  const drive = driveOf({ nodes, order }, pathId);
  const waiting = (order.pc ?? [])
    .map((id) => nodes[id])
    .filter((node) => node?.kind === "drive" && node.mounted === false && !node.name.endsWith(":"));
  const store = useFiles.getState;
  return (
    <SectionMenu label="Drives">
      <MenuAction label={`${showAll ? "✓ " : ""}Show every drive`} icon={<HardDrive className="size-4" />} onClick={() => store().setShowAllDrives(!showAll)} />
      <div className="my-1 h-px bg-line" />
      {waiting.length === 0 && <p className="px-2 py-1 text-xs text-muted">No drives are waiting for a letter</p>}
      {waiting.map((node) => (
        <MenuAction
          key={node.id}
          label={`Mount ${driveCaption(node)}`}
          icon={<HardDrive className="size-4" />}
          onClick={() => {
            const path = diskPath(node.id);
            if (!path) return;
            void mountVolume(path).then(() => store().reloadDrives()).catch((error: unknown) => store().openDialog({ kind: "preview", title: "Mount", body: error instanceof Error ? error.message : "Could not mount that drive" }));
          }}
        />
      ))}
      <div className="my-1 h-px bg-line" />
      <MenuAction label="Map network drive" icon={<HardDrive className="size-4" />} onClick={() => store().openDialog({ kind: "network", location: false })} />
      <MenuAction label="Add network location" icon={<FolderPlus className="size-4" />} onClick={() => store().openDialog({ kind: "network", location: true })} />
      <MenuAction label="Disconnect" disabled={!drive || drive.note !== "Network Drive"} icon={<Unplug className="size-4" />} onClick={() => drive && store().openDialog({ kind: "unmount", id: drive.id })} />
    </SectionMenu>
  );
}

function SortMenu() {
  const active = useFiles((s) => s.active);
  const sortKey = useFiles((s) => s.panes[s.active].sortKey);
  const sortDir = useFiles((s) => s.panes[s.active].sortDir);
  const sort = (key: "name" | "size" | "date" | "type", label: string) => (
    <MenuAction label={`${sortKey === key ? "✓ " : ""}${label}${sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}`} onClick={() => useFiles.getState().setSort(active, key)} />
  );
  return (
    <SectionMenu label="Sort">
      {sort("name", "Name")}
      {sort("size", "Size")}
      {sort("date", "Date modified")}
      {sort("type", "Type")}
    </SectionMenu>
  );
}

function FilterMenu() {
  const active = useFiles((s) => s.active);
  const sortKey = useFiles((s) => s.panes[s.active].sortKey);
  const sortDir = useFiles((s) => s.panes[s.active].sortDir);
  const filters = useFiles((s) => s.filters);
  const set = useFiles.getState().setFilters;
  const sort = (key: "name" | "size" | "date" | "type", label: string) => (
    <MenuAction
      label={`${sortKey === key ? "✓ " : ""}${label}${sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}`}
      onClick={() => useFiles.getState().setSort(active, key)}
    />
  );
  const narrow = (label: string, on: boolean, patch: Partial<typeof filters>) => (
    <MenuAction label={`${on ? "✓ " : ""}${label}`} onClick={() => set({ kind: "all", group: "", ext: "", minBytes: 0, ...patch })} />
  );
  return (
    <SectionMenu label="Filter">
      <p className="px-2 py-1 text-xs text-muted">Sort</p>
      {sort("name", "Name")}
      {sort("size", "Size")}
      {sort("date", "Date modified")}
      {sort("type", "Type")}
      <div className="my-1 h-px bg-line" />
      <p className="px-2 py-1 text-xs text-muted">Show</p>
      {narrow("Everything", filters.kind === "all" && !filters.group && !filters.minBytes, {})}
      {narrow("Folders", filters.kind === "dir", { kind: "dir" })}
      {narrow("Files", filters.kind === "file" && !filters.group && !filters.minBytes, { kind: "file" })}
      {narrow("Documents", filters.group === "docs", { kind: "file", group: "docs" })}
      {narrow("Pictures", filters.group === "images", { kind: "file", group: "images" })}
      {narrow("Music", filters.group === "audio", { kind: "file", group: "audio" })}
      {narrow("Videos", filters.group === "video", { kind: "file", group: "video" })}
      {narrow("Programs", filters.group === "programs", { kind: "file", group: "programs" })}
      {narrow("Archives", filters.group === "archives", { kind: "file", group: "archives" })}
      {narrow("100 MB and up", filters.minBytes > 0, { kind: "file", minBytes: 100 * MB })}
      <MenuAction label={`${filters.showBlocked ? "✓ " : ""}No access folders`} onClick={() => set({ showBlocked: !filters.showBlocked })} />
      <div className="my-1 h-px bg-line" />
      <p className="px-2 py-1 text-xs text-muted">Changed</p>
      <MenuAction label={`${filters.maxAgeDays === 0 ? "✓ " : ""}Any time`} onClick={() => set({ maxAgeDays: 0 })} />
      <MenuAction label={`${filters.maxAgeDays === 1 ? "✓ " : ""}Today`} onClick={() => set({ maxAgeDays: 1 })} />
      <MenuAction label={`${filters.maxAgeDays === 7 ? "✓ " : ""}Past week`} onClick={() => set({ maxAgeDays: 7 })} />
      <MenuAction label={`${filters.maxAgeDays === 30 ? "✓ " : ""}Past month`} onClick={() => set({ maxAgeDays: 30 })} />
      <div className="my-1 h-px bg-line" />
      <MenuAction label="Clear filters" icon={<X className="size-4" />} onClick={() => useFiles.getState().clearFilters()} />
    </SectionMenu>
  );
}

function HomeRibbon() {
  const active = useFiles((s) => s.active);
  const selected = useFiles((s) => s.panes[s.active].selected);
  const split = useFiles((s) => s.split);
  const pathId = useFiles((s) => s.panes[s.active].pathId);
  const nodes = useFiles((s) => s.nodes);
  const order = useFiles((s) => s.order);
  const drive = driveOf({ nodes, order }, pathId);
  const dark = useFiles((s) => s.dark);
  const reading = useFiles((s) => s.reading);
  const calcDirs = useFiles((s) => s.calcDirs);
  const [desktop, setDesktop] = useState(false);
  const store = useFiles.getState;
  useEffect(() => setDesktop(isDesktop()), []);

  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1">
      <SectionMenu label="New">
        <MenuAction label="Folder" icon={<FolderPlus className="size-4" />} onClick={() => store().newItem(freshName("New folder"), false)} />
        <MenuAction label="Text document" icon={<FileText className="size-4" />} onClick={() => store().newItem(freshName("New Text Document.txt"), true)} />
        <MenuAction label="Markdown" icon={<FileText className="size-4" />} onClick={() => store().newItem(freshName("Notes.md"), true)} />
        <MenuAction label="Spreadsheet" icon={<Table className="size-4" />} onClick={() => store().newItem(freshName("Sheet.csv"), true)} />
        <MenuAction label="Web page" icon={<FileCode className="size-4" />} onClick={() => store().newItem(freshName("Page.html"), true)} />
        <MenuAction label="JSON" icon={<FileCode className="size-4" />} onClick={() => store().newItem(freshName("Data.json"), true)} />
        <MenuAction label="Settings" icon={<File className="size-4" />} onClick={() => store().newItem(freshName("Settings.ini"), true)} />
        <MenuAction label="PowerShell script" icon={<FileCode className="size-4" />} onClick={() => store().newItem(freshName("Script.ps1"), true)} />
        <MenuAction label="Batch file" icon={<AppWindow className="size-4" />} onClick={() => store().newItem(freshName("Script.bat"), true)} />
        <MenuAction label="Log" icon={<FileText className="size-4" />} onClick={() => store().newItem(freshName("Log.log"), true)} />
        <MenuAction label="Empty file" icon={<FilePlus className="size-4" />} onClick={() => store().newItem(freshName("New file"), true)} />
      </SectionMenu>
      <SectionMenu label="Go">
        <MenuAction label="Up" icon={<ArrowUp className="size-4" />} onClick={() => store().goUp()} />
        <MenuAction label={desktop ? "This computer" : "Open folder"} icon={<HardDrive className="size-4" />} onClick={() => void store().openFolder()} />
        <MenuAction label="Refresh" icon={<RefreshCw className="size-4" />} onClick={() => store().refresh()} />
        <MenuAction label="Jump to path" icon={<Search className="size-4" />} onClick={() => store().openDialog({ kind: "goto" })} />
      </SectionMenu>
      <DriveMenu />
      <FilterMenu />
      <SectionMenu label="Tools">
        <MenuAction label="Save snapshot" icon={<History className="size-4" />} onClick={() => store().takeSnapshot()} />
        <MenuAction label="Keeps" icon={<History className="size-4" />} onClick={() => store().setTab("keeps")} />
        <div className="my-1 h-px bg-line" />
        <MenuAction label="Disk use" icon={<HardDrive className="size-4" />} onClick={() => openSpaceReport()} />
        <MenuAction label="Copy list" icon={<FileText className="size-4" />} onClick={() => void copyListing()} />
        <MenuAction label="Queue" icon={<ClipboardPaste className="size-4" />} onClick={() => store().toggleTransfers()} />
        <MenuAction label="Activity" icon={<FileText className="size-4" />} onClick={() => store().toggleLog()} />
      </SectionMenu>
      <SectionMenu label="Settings">
        <MenuAction label={dark ? "Light mode" : "Dark mode"} icon={<Moon className="size-4" />} onClick={() => store().setOptions({ dark: !dark })} />
        <MenuAction label={reading ? "Normal text" : "Larger text"} icon={<FileText className="size-4" />} onClick={() => store().setOptions({ reading: !reading })} />
        <MenuAction label={calcDirs ? "Stop measuring folders" : "Measure folders"} icon={<Ruler className="size-4" />} onClick={() => store().setOptions({ calcDirs: !calcDirs })} />
        <MenuAction label="Unmount this drive" disabled={!drive || drive.mounted === false || drive.system} icon={<Unplug className="size-4" />} onClick={() => { if (drive && !drive.system) store().openDialog({ kind: "unmount", id: drive.id }); }} />
        <MenuAction label="Format this drive" disabled={!drive || drive.mounted === false || drive.system || !drive.name.endsWith(":")} icon={<Trash2 className="size-4" />} onClick={() => { if (drive && !drive.system && drive.name.endsWith(":")) store().openDialog({ kind: "format", id: drive.id }); }} />
      </SectionMenu>
      <span className="mx-1 h-5 w-px bg-ribbon-edge" />
      <RibbonButton label="Cut" disabled={!selected.length} icon={<Scissors className="size-4" />} onClick={() => store().cut()} />
      <RibbonButton label="Copy" disabled={!selected.length} icon={<Copy className="size-4" />} onClick={() => store().copy()} />
      <RibbonButton label="Paste" icon={<ClipboardPaste className="size-4" />} onClick={() => store().paste()} />
      <RibbonButton label="Rename" disabled={selected.length !== 1} icon={<Pencil className="size-4" />} onClick={() => {
        const node = nodes[selected[0]];
        if (node) store().openDialog({ kind: "rename", id: node.id, name: node.name });
      }} />
      <RibbonButton label="Delete" disabled={!selected.length} icon={<Trash2 className="size-4" />} onClick={() => selected.length && store().openDialog({ kind: "delete", ids: selected })} />
      <SortMenu />
      <ViewMenu />
      <RibbonButton label={split ? "One pane" : "Two panes"} icon={<Columns2 className="size-4" />} onClick={() => store().toggleSplit()} />
      <div className="ml-auto flex shrink-0 items-center pl-2">
        <HeaderSearch />
      </div>
    </div>
  );
}

function includeValue(filters: { kind: string; ext: string; attr: string; minBytes: number }) {
  if (filters.attr !== "any") return `attr:${filters.attr}`;
  if (filters.ext) return `ext:${filters.ext}`;
  if (filters.minBytes >= 100 * MB) return "large";
  if (filters.kind !== "all") return filters.kind;
  return "all";
}

function InspectRibbon() {
  const filters = useFiles((s) => s.filters);
  const active = useFiles((s) => s.active);
  const query = useFiles((s) => s.panes[active].query);
  const set = useFiles.getState().setFilters;
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto px-1 py-1">
      <GroupBox title="Find">
        <label className="flex h-14 flex-col justify-center px-2 text-xs">
          <span className="text-muted">Find</span>
          <input
            id="find-box"
            value={query}
            onChange={(e) => useFiles.getState().setQuery(active, e.target.value)}
            className="h-8 w-44 border border-line bg-pane px-2 text-sm text-ink outline-none"
            aria-label="Find in this folder"
          />
        </label>
        <LabeledSelect label="Look in" value={filters.findColumn} onChange={(findColumn) => set({ findColumn: findColumn as typeof filters.findColumn })}>
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="type">Type</option>
          <option value="date">Date</option>
        </LabeledSelect>
      </GroupBox>
      <GroupBox title="Narrow">
        <ViewMenu />
        <RibbonButton label="Deep search" icon={<Search className="size-4" />} onClick={() => useFiles.getState().openDialog({ kind: "search" })} />
        <RibbonButton label="Pattern" icon={<ListFilter className="size-4" />} onClick={() => useFiles.getState().openDialog({ kind: "mask" })} />
        <RibbonButton label="Rule" icon={<Filter className="size-4" />} onClick={() => useFiles.getState().openDialog({ kind: "custom" })} />
        <LabeledSelect label="Kind" value={includeValue(filters)} onChange={(value) => {
          const reset = { kind: "all" as const, ext: "", attr: "any" as const, minBytes: 0, group: "" as const };
          if (value === "dir" || value === "file") set({ ...reset, kind: value });
          else if (value.startsWith("ext:")) set({ ...reset, ext: value.slice(4) });
          else if (value === "large") set({ ...reset, kind: "file", minBytes: 100 * MB });
          else set(reset);
        }}>
          <option value="all">Anything</option>
          <option value="dir">Folders</option>
          <option value="file">Files</option>
          <option value="ext:exe">EXE</option>
          <option value="ext:dll">DLL</option>
          <option value="ext:sys">SYS</option>
          <option value="ext:zip">ZIP</option>
          <option value="ext:pdf">PDF</option>
          <option value="ext:txt">TXT</option>
          <option value="large">100 MB+</option>
        </LabeledSelect>
        <LabeledSelect label="Skip" value={filters.exclude} onChange={(exclude) => set({ exclude })}>
          <option value="">Nothing</option>
          <option value=".tmp">.tmp</option>
          <option value=".log">.log</option>
          <option value=".dll">.dll</option>
          <option value=".sys">.sys</option>
        </LabeledSelect>
        <LabeledSelect label="Sets" value={filters.group || (filters.kind === "dir" ? "folders" : "")} onChange={(value) => {
          useFiles.getState().clearFilters();
          const apply = useFiles.getState().setFilters;
          if (value === "folders") apply({ kind: "dir" });
          else if (value === "docs") apply({ group: "docs", kind: "file" });
          else if (value === "programs") apply({ group: "programs", kind: "file" });
          else if (value === "images") apply({ group: "images", kind: "file" });
          else if (value === "large") apply({ kind: "file", minBytes: 100 * MB });
          else if (value === "hidden") apply({ showHidden: true, showReadonly: false, showSystem: false });
          else if (value === "system") apply({ showSystem: true, showHidden: false, showReadonly: false });
        }}>
          <option value="">All items</option>
          <option value="folders">Folders</option>
          <option value="docs">Documents</option>
          <option value="programs">Programs</option>
          <option value="images">Pictures</option>
          <option value="large">Large files</option>
          <option value="hidden">Hidden</option>
          <option value="system">System</option>
        </LabeledSelect>
        <LabeledSelect label="Matches" value={filters.highlight ? "on" : "off"} onChange={(value) => set({ highlight: value === "on" })}>
          <option value="off">Hide the rest</option>
          <option value="on">Tint hits</option>
        </LabeledSelect>
        <RibbonButton label="Reset" icon={<X className="size-4" />} onClick={() => useFiles.getState().clearFilters()} />
        <RibbonButton label="Totals" icon={<Ruler className="size-4" />} onClick={() => useFiles.getState().openDialog({ kind: "counter" })} />
      </GroupBox>
    </div>
  );
}

function ToolsRibbon() {
  const active = useFiles((s) => s.active);
  const pathId = useFiles((s) => s.panes[active].pathId);
  const shadowId = useFiles((s) => s.shadowId);
  const nodes = useFiles((s) => s.nodes);
  const dupes = useFiles((s) => s.dupes);
  const split = useFiles((s) => s.split);
  const transfersOpen = useFiles((s) => s.transfersOpen);
  const logOpen = useFiles((s) => s.logOpen);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [placesBox, setPlacesBox] = useState<DOMRect | null>(null);
  const placesRef = useRef<HTMLDivElement>(null);
  const snaps = useFiles((s) => s.snaps);
  const labels: Record<string, string> = { c: "C:", users: "Users", downloads: "Downloads", pf: "Program Files" };
  const here = diskPath(pathId) || (nodes[pathId] ? displayPath({ nodes, order: useFiles.getState().order }, pathId) : "");
  const mine = snaps.filter((item) => item.folderId === pathId || item.path === here);
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto px-1 py-1">
      <GroupBox title="Look up">
        <RibbonButton label="Jump" icon={<Search className="size-4" />} onClick={() => useFiles.getState().openDialog({ kind: "goto" })} />
        <RibbonButton label="Disk use" icon={<HardDrive className="size-4" />} onClick={() => openSpaceReport()} />
        <RibbonButton label="Copy list" icon={<FileText className="size-4" />} onClick={() => void copyListing()} />
        <RibbonButton label="Same size" icon={<Files className="size-4" />} active={dupes} onClick={() => useFiles.getState().toggleDupes()} />
        <RibbonButton label="Line up" disabled={!split} icon={<GitCompare className="size-4" />} onClick={() => useFiles.getState().compare()} />
      </GroupBox>
      <GroupBox title="Snapshots">
        <RibbonButton label="Save snapshot" icon={<History className="size-4" />} onClick={() => useFiles.getState().takeSnapshot()} />
        <RibbonButton label="Keeps" icon={<History className="size-4" />} onClick={() => useFiles.getState().setTab("keeps")} />
        <RibbonButton label="User folders" icon={<Folder className="size-4" />} onClick={() => useFiles.getState().openDialog({ kind: "snap-user" })} />
        {shadows.map((item) => (
          <RibbonButton key={item.id} label={`${labels[item.folderId] ?? "Folder"} · ${new Date(item.taken).toLocaleDateString()}`} icon={<History className="size-4" />} active={shadowId === item.id} onClick={() => useFiles.getState().openShadow(active, item.id)} />
        ))}
        {mine.map((item) => (
          <RibbonButton key={item.id} label={new Date(item.taken).toLocaleString()} icon={<History className="size-4" />} active={shadowId === item.id} onClick={() => useFiles.getState().openShadow(active, item.id)} />
        ))}
        <RibbonButton label="Bring back" disabled={!shadowId} icon={<RotateCcw className="size-4" />} onClick={() => void useFiles.getState().restoreShadow()} />
        {shadowId && <RibbonButton label="Close" icon={<X className="size-4" />} onClick={() => useFiles.getState().clearShadow()} />}
      </GroupBox>
      <GroupBox title="Records">
        <div ref={placesRef}>
          <RibbonButton label="Shortcuts" icon={<Folder className="size-4" />} active={placesOpen} onClick={() => { setPlacesBox(placesRef.current?.getBoundingClientRect() ?? null); setPlacesOpen((open) => !open); }} />
          {placesOpen && placesBox && <PlacesMenu anchor={placesBox} onClose={() => setPlacesOpen(false)} />}
        </div>
        <RibbonButton label="Queue" icon={<ClipboardPaste className="size-4" />} active={transfersOpen} onClick={() => useFiles.getState().toggleTransfers()} />
        <RibbonButton label="Activity" icon={<FileText className="size-4" />} active={logOpen} onClick={() => useFiles.getState().toggleLog()} />
      </GroupBox>
      <span className="sr-only">{nodes[pathId]?.name}</span>
    </div>
  );
}

function OptionsRibbon() {
  const barMode = useFiles((s) => s.barMode);
  const calcDirs = useFiles((s) => s.calcDirs);
  const dark = useFiles((s) => s.dark);
  const dateFormat = useFiles((s) => s.dateFormat);
  const timeFormat = useFiles((s) => s.timeFormat);
  const reading = useFiles((s) => s.reading);
  const set = useFiles.getState().setOptions;
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto px-1 py-1">
      <GroupBox title="Look">
        <RibbonButton label={dark ? "Light" : "Dark"} icon={<Moon className="size-4" />} active={dark} onClick={() => set({ dark: !dark })} />
        <RibbonButton label="Larger text" icon={<FileText className="size-4" />} active={reading} onClick={() => set({ reading: !reading })} />
      </GroupBox>
      <GroupBox title="Bars">
        <label className="flex h-14 items-center gap-2 px-2 text-sm">
          <input type="checkbox" checked={calcDirs} onChange={(e) => set({ calcDirs: e.target.checked })} />
          Measure folders
        </label>
        <LabeledSelect label="Bar style" value={barMode} onChange={(value) => set({ barMode: value as "linear" | "log" })}>
          <option value="linear">Even</option>
          <option value="log">Compressed</option>
        </LabeledSelect>
      </GroupBox>
      <GroupBox title="Catalog">
        <RibbonButton label="Restore sample" icon={<RotateCcw className="size-4" />} onClick={() => useFiles.getState().openDialog({ kind: "restore" })} />
      </GroupBox>
      <GroupBox title="Dates">
        <LabeledSelect label="Date style" value={dateFormat} onChange={(value) => set({ dateFormat: value as DateFormat })}>
          <option value="mdy">M/D/YYYY</option>
          <option value="dmy">D/M/YYYY</option>
          <option value="ymd">YYYY-MM-DD</option>
        </LabeledSelect>
        <LabeledSelect label="Clock" value={timeFormat} onChange={(value) => set({ timeFormat: value as TimeFormat })}>
          <option value="12">12-hour</option>
          <option value="24">24-hour</option>
          <option value="none">Date only</option>
        </LabeledSelect>
      </GroupBox>
    </div>
  );
}

function ResourcesRibbon() {
  const page = useFiles((s) => s.helpPage);
  const query = useFiles((s) => s.helpQuery);
  const go = (helpPage: "manual" | "about") => useFiles.getState().setHelpPage(helpPage);
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <button type="button" className={"h-8 rounded-md px-3 text-sm " + (page === "manual" ? "bg-select" : "hover:bg-header")} onClick={() => go("manual")}>Manual</button>
      <button type="button" className={"h-8 rounded-md px-3 text-sm " + (page === "about" ? "bg-select" : "hover:bg-header")} onClick={() => go("about")}>About</button>
      <input
        value={query}
        onChange={(e) => useFiles.getState().setHelpQuery(e.target.value)}
        placeholder="Search the manual"
        aria-label="Search the manual"
        className="h-8 w-56 rounded-md border border-line bg-pane px-2 text-sm outline-none"
      />
    </div>
  );
}

function ManualPage() {
  const query = useFiles((s) => s.helpQuery).trim().toLowerCase();
  const sections = manualSections.flatMap((section) => {
    if (!query) return [section];
    if (section.title.toLowerCase().includes(query)) return [section];
    const paragraphs = section.paragraphs?.filter((text) => text.toLowerCase().includes(query));
    const items = section.items?.filter((text) => text.toLowerCase().includes(query));
    const links = section.links?.filter((link) => link.label.toLowerCase().includes(query));
    if (!paragraphs?.length && !items?.length && !links?.length) return [];
    return [{ ...section, paragraphs, items, links }];
  });
  return (
    <div className="flex min-h-0 flex-1 bg-pane">
      <nav className="hidden w-52 shrink-0 overflow-auto border-r border-line bg-tree p-3 sm:block">
        <p className="px-2 text-xs font-semibold text-muted">Contents</p>
        <ul className="mt-2 space-y-1">
          {sections.map((section) => (
            <li key={section.title}>
              <a
                href={`#manual-${section.title}`}
                className="block rounded-md px-2 py-1 text-sm hover:bg-select"
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(`manual-${section.title}`)?.scrollIntoView({ block: "start" });
                }}
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <h2 className="text-lg font-semibold">Manual</h2>
        <div className="mt-4 max-w-3xl space-y-6">
          {sections.length === 0 && <p className="text-sm text-muted">Nothing in the manual matches that search.</p>}
          {sections.map((section) => (
            <section key={section.title} id={`manual-${section.title}`}>
              <h3 className="text-sm font-semibold">{section.title}</h3>
              {section.paragraphs?.map((text) => (
                <p key={text} className="mt-1 text-sm text-muted">{text}</p>
              ))}
              {section.items && (
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.links && (
                <ul className="mt-2 space-y-1 text-sm">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} className="text-accent underline" onClick={(event) => {
                        event.preventDefault();
                        void openExternal(link.href).catch((error: unknown) => {
                          useFiles.setState({ status: error instanceof Error ? error.message : "Could not open that link" });
                        });
                      }}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </article>
    </div>
  );
}

function AboutPage() {
  return (
    <article className="min-h-0 flex-1 overflow-auto bg-pane px-6 py-5">
      <h2 className="text-lg font-semibold">About {aboutInfo.name}</h2>
      <dl className="mt-4 max-w-xl space-y-3 text-sm">
        <div><dt className="text-muted">Created</dt><dd>{aboutInfo.created}</dd></div>
        <div><dt className="text-muted">Created by</dt><dd>{aboutInfo.author}</dd></div>
        <div><dt className="text-muted">Rights</dt><dd>{aboutInfo.rights}</dd></div>
        <div><dt className="text-muted">Version</dt><dd>{aboutInfo.version}</dd></div>
        <div><dt className="text-muted">This copy updated</dt><dd>{aboutInfo.updated}</dd></div>
        <div>
          <dt className="text-muted">Latest version</dt>
          <dd className="mt-1 space-y-1">
            <button type="button" className="block text-accent underline" onClick={() => void openExternal(aboutInfo.latest)}>Project page</button>
            <button type="button" className="block text-accent underline" onClick={() => void openExternal(aboutInfo.setup)}>Data-Finder-Setup.exe</button>
            <button type="button" className="block text-accent underline" onClick={() => void openExternal(aboutInfo.portable)}>Data-Finder.exe</button>
            <button type="button" className="block text-accent underline" onClick={() => void openExternal(aboutInfo.releases)}>Older versions</button>
          </dd>
        </div>
      </dl>
    </article>
  );
}

function openSpaceReport() {
  const state = useFiles.getState();
  const drive = driveOf(state, state.panes[state.active].pathId);
  if (!drive) {
    state.openDialog({ kind: "preview", title: "Disk use", body: "Open a drive folder first." });
    return;
  }
  const freePct = drive.capacity ? Math.round(((drive.free ?? 0) / drive.capacity) * 100) : 0;
  const lines = childrenOf(state, drive.id)
    .map((node) => `${(formatSize(node.bytes) || "—").padEnd(10, " ")}  ${node.name}`)
    .join("\n");
  state.openDialog({
    kind: "preview",
    title: `${drive.name}\\ disk use`,
    body: `${drive.note ?? "Disk"}\n${formatSize(drive.capacity)} · ${freePct}% free\n\n${lines}`,
  });
}

async function copyListing() {
  const state = useFiles.getState();
  const view = listing(state, state.active);
  const path = displayPath(state, state.panes[state.active].pathId);
  const body = [path, ...view.rows.map((row) => `${row.name}\t${formatSize(row.bytes) || ""}\t${typeLabel({ kind: row.kind, name: row.name } as FsNode)}`)].join("\n");
  let copied = false;
  try {
    await navigator.clipboard.writeText(body);
    copied = true;
  } catch {
    copied = false;
  }
  useFiles.setState({ status: copied ? `List copied · ${path}` : path });
  state.openDialog({ kind: "preview", title: "Folder list", body });
}

function NavPlaces({ pane }: { pane: 0 | 1 }) {
  const pins = useFiles((s) => s.pins);
  const pinsOpen = useFiles((s) => s.pinsOpen[pane]);
  const recent = useFiles((s) => s.recentPaths);
  const [recentOpen, setRecentOpen] = useState(false);
  const open = (path: string) => void useFiles.getState().openTypedPath(path);
  const unpin = (path: string) => {
    useFiles.setState((state) => ({
      pins: state.pins.filter((item) => item.toLowerCase() !== path.toLowerCase()),
      status: "Unpinned",
    }));
  };
  const row = (path: string, label: string, withUnpin = false) => (
    <div key={path} className="flex items-center pr-1">
      <button type="button" className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1 text-left text-sm hover:bg-select" title={path} onClick={() => open(path)}>
        <Folder className="size-3.5 shrink-0 text-muted" />
        <span className="truncate">{label}</span>
      </button>
      {withUnpin && (
        <button type="button" aria-label={`Unpin ${label}`} className="grid size-6 shrink-0 place-items-center text-muted hover:text-ink" title="Unpin" onClick={() => unpin(path)}>
          <X className="size-3" />
        </button>
      )}
    </div>
  );
  return (
    <>
      <div className="border-b border-line py-1">
        <button type="button" className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-semibold text-muted" onClick={() => useFiles.getState().setPinsOpen(pane, !pinsOpen)}>
          {pinsOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Pinned
        </button>
        {pinsOpen && pins.length === 0 && <p className="px-2 pb-1 text-xs text-muted">None yet</p>}
        {pinsOpen && pins.map((path) => row(path, path.split(/[/\\]/).filter(Boolean).pop() || path, true))}
      </div>
      <div className="border-b border-line py-1">
        <button type="button" className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-semibold text-muted" onClick={() => setRecentOpen((open) => !open)}>
          {recentOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Recent
        </button>
        {recentOpen && recent.length === 0 && <p className="px-2 pb-1 text-xs text-muted">None yet</p>}
        {recentOpen && recent.slice(0, 8).map((path) => row(path, path.split(/[/\\]/).filter(Boolean).pop() || path))}
      </div>
      <TreeBranch id="pc" depth={0} pane={pane} />
    </>
  );
}

function TreeBranch({ id, depth, pane }: { id: string; depth: number; pane: 0 | 1 }) {
  const node = useFiles((s) => s.nodes[id]);
  const childIds = useFiles((s) => s.order[id]) ?? NO_CHILDREN;
  const nodes = useFiles((s) => s.nodes);
  const pathId = useFiles((s) => s.panes[pane].pathId);
  const filters = useFiles((s) => s.filters);
  const showAll = useFiles((s) => s.showAllDrives);
  const pins = useFiles((s) => s.pins);
  const reading = useFiles((s) => s.reading);
  const [open, setOpen] = useState(depth < 1 || id === "c");
  const inPath = pathIds({ nodes, order: {} }, pathId).includes(id);
  useEffect(() => {
    if (inPath) setOpen(true);
  }, [inPath]);
  if (!node) return null;
  const folders = childIds
    .map((cid) => nodes[cid])
    .filter((item) => item && item.kind !== "file" && flagVisible(item, filters) && (showAll || item.kind !== "drive" || item.mounted !== false));
  const here = pathId === id;
  const label = node.kind === "drive" ? driveCaption(node) : node.name;
  const folderPath = diskPath(id) || (node.kind !== "file" && node.kind !== "computer" ? displayPath({ nodes, order: useFiles.getState().order }, id) : "");
  const pinned = !!folderPath && pins.some((item) => item.toLowerCase() === folderPath.toLowerCase());
  return (
    <div>
      <button
        type="button"
        className={"flex w-full items-center gap-1 py-2 pr-2 text-left hover:bg-select sm:py-1 " + (reading ? "text-base " : "text-sm ") + (here ? "bg-select" : "")}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => {
          if (folders.length) setOpen((v) => !v);
          useFiles.getState().navigate(pane, id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          useFiles.getState().setActive(pane);
          useFiles.getState().openMenu({ x: e.clientX, y: e.clientY, id });
        }}
        onPointerUp={(e) => {
          if (e.button !== 2) return;
          e.preventDefault();
          e.stopPropagation();
          useFiles.getState().setActive(pane);
          useFiles.getState().openMenu({ x: e.clientX, y: e.clientY, id });
        }}
      >
        {folders.length ? (
          open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />
        ) : (
          <span className="inline-block w-3.5" />
        )}
        <Icon node={node} />
        <span className="truncate">{label}</span>
        {node.kind !== "file" && node.kind !== "computer" && folderPath && (
          <span
            role="button"
            aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
            title={pinned ? "Unpin" : "Pin"}
            className="ml-auto grid size-5 shrink-0 place-items-center"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              pinNode(id);
            }}
          >
            <Star className={"size-3 " + (pinned ? "fill-current text-accent" : "text-muted")} />
          </span>
        )}
      </button>
      {open && folders.map((folder) => <TreeBranch key={folder.id} id={folder.id} depth={depth + 1} pane={pane} />)}
    </div>
  );
}

function IconBoard({ index, rows, mode, columns, cellHeight }: { index: 0 | 1; rows: ListRow[]; mode: ViewMode; columns?: number; cellHeight?: number }) {
  const nodes = useFiles((s) => s.nodes);
  const selectedIds = useFiles((s) => s.panes[index].selected);
  const showExt = useFiles((s) => s.showExt);
  const itemChecks = useFiles((s) => s.itemChecks);
  const clipboard = useFiles((s) => s.clipboard);
  const icon = mode === "xlarge" ? "size-16" : mode === "large" ? "size-12" : mode === "medium" ? "size-8" : "size-5";
  const wide = mode === "list" || mode === "content" || mode === "tiles";
  const grid = !wide && columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined;
  return (
    <div
      className={wide ? "flex flex-col gap-0.5 p-1" : "grid p-2 " + (cellHeight ? "gap-0" : "gap-1")}
      style={grid}
    >
      {rows.length === 0 && <p className="col-span-full px-3 py-8 text-center text-muted">This folder is empty.</p>}
      {rows.map((row) => {
        const selected = selectedIds.includes(row.id);
        const cut = clipboard?.mode === "cut" && row.nodeId && clipboard.ids.includes(row.nodeId);
        const label = row.kind === "drive" && row.nodeId && nodes[row.nodeId] ? driveCaption(nodes[row.nodeId]) : shownName(row.name, row.kind, showExt);
        return (
          <div
            key={row.id}
            data-row={row.id}
            onPointerDown={(event) => armDesktopDrag(event, index, row.nodeId)}
            className={
              "flex overflow-hidden rounded-md " +
              (wide ? "items-center gap-2 px-2 py-1" : "flex-col items-center gap-1 px-2 py-2") +
              (selected ? " bg-select" : " hover:bg-header") +
              (cut ? " opacity-50" : "")
            }
            style={!wide && cellHeight ? { height: cellHeight } : undefined}
          >
            {itemChecks && (
              <input
                type="checkbox"
                checked={selected}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onChange={() => useFiles.getState().toggleSelect(index, row.id)}
                aria-label={`Select ${row.name}`}
              />
            )}
            <button
              type="button"
              className={"flex min-w-0 flex-1 text-left " + (wide ? "items-center gap-2" : "flex-col items-center gap-1 text-center")}
              onClick={(e) => {
                if (dragSelect.moved) {
                  dragSelect.moved = false;
                  return;
                }
                const ids = rows.map((item) => item.id);
                if (e.shiftKey) useFiles.getState().selectRange(index, row.id, ids);
                else if (e.metaKey || e.ctrlKey) useFiles.getState().toggleSelect(index, row.id);
                else useFiles.getState().selectOnly(index, row.id);
              }}
              onDoubleClick={(event) => {
                if ((event.ctrlKey || event.metaKey) && row.nodeId && row.kind !== "file") {
                  useFiles.getState().openTab(index, row.nodeId);
                  return;
                }
                row.nodeId && useFiles.getState().openItem(index, row.nodeId);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                useFiles.getState().setActive(index);
                if (row.nodeId && !useFiles.getState().panes[index].selected.includes(row.nodeId)) useFiles.getState().selectOnly(index, row.nodeId);
                useFiles.getState().openMenu({ x: e.clientX, y: e.clientY, id: row.nodeId ?? null });
              }}
            >
            <Icon node={{ kind: row.kind, name: row.name, note: row.note }} className={icon + " shrink-0"} />
            <span className={wide ? "min-w-0 flex-1" : "w-full"}>
              <span className={"block truncate " + (wide ? "" : "text-xs")} title={row.name}>{label}</span>
              {(mode === "content" || mode === "tiles") && (
                <span className="block truncate text-xs text-muted">{typeLabel(row.nodeId && nodes[row.nodeId] ? nodes[row.nodeId] : ({ kind: row.kind, name: row.name } as FsNode))}</span>
              )}
            </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function PreviewPane({ index }: { index: 0 | 1 }) {
  const pane = useFiles((s) => s.panes[index]);
  const nodes = useFiles((s) => s.nodes);
  const showExt = useFiles((s) => s.showExt);
  const id = pane.selected[0];
  const node = id ? nodes[id] : undefined;
  const [peek, setPeek] = useState<FilePeek | null>(null);
  useEffect(() => {
    if (!node || node.kind !== "file" || !isDesktop()) {
      setPeek(null);
      return;
    }
    const path = diskPath(node.id);
    if (!path) {
      setPeek(null);
      return;
    }
    let cancel = false;
    setPeek(null);
    void peekFile(path)
      .then((next) => {
        if (!cancel) setPeek(next);
      })
      .catch(() => {
        if (!cancel) setPeek(null);
      });
    return () => {
      cancel = true;
    };
  }, [id, node?.kind, node?.name]);
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-tree p-4 lg:flex">
      {node ? (
        <>
          {peek?.kind === "image" ? (
            <img src={peek.body} alt="" className="max-h-52 w-full rounded-md object-contain" />
          ) : (
            <Icon node={node} className="size-16" />
          )}
          <h2 className="mt-3 truncate text-sm font-semibold" title={node.name}>{node.kind === "drive" ? driveCaption(node) : shownName(node.name, node.kind, showExt)}</h2>
          <p className="mt-1 text-xs text-muted">{typeLabel(node)}</p>
          <p className="mt-3 text-sm">{node.kind === "file" ? formatSize(node.bytes) : shownSize(node.bytes, node.approx) || "Folder"}</p>
          {peek?.note && <p className="mt-2 text-xs text-muted">{peek.note}</p>}
          {peek?.kind === "text" && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">{peek.body}</pre>}
          {node.note && <p className="mt-2 text-sm text-muted">{node.note}</p>}
        </>
      ) : (
        <p className="text-sm text-muted">Select a file to preview it.</p>
      )}
    </aside>
  );
}

function samePane(a: ReturnType<typeof useFiles.getState>, b: ReturnType<typeof useFiles.getState>, index: 0 | 1) {
  const other = index === 0 ? 1 : 0;
  return a.nodes === b.nodes
    && a.order === b.order
    && a.panes[index] === b.panes[index]
    && a.panes[other].flat === b.panes[other].flat
    && a.panes[other].pathId === b.panes[other].pathId
    && a.filters === b.filters
    && a.dupes === b.dupes
    && a.diff === b.diff
    && a.split === b.split
    && a.showAllDrives === b.showAllDrives
    && a.calcDirs === b.calcDirs
    && a.searchPane === b.searchPane
    && a.searchHits === b.searchHits
    && a.searchQuery === b.searchQuery
    && a.shadowPane === b.shadowPane
    && a.shadowId === b.shadowId
    && a.snaps === b.snaps
    && a.columns === b.columns
    && a.viewMode === b.viewMode
    && a.compact === b.compact
    && a.reading === b.reading
    && a.showNav === b.showNav
    && a.showExt === b.showExt
    && a.itemChecks === b.itemChecks
    && a.detailsOpen === b.detailsOpen
    && a.previewOpen === b.previewOpen
    && a.dateFormat === b.dateFormat
    && a.timeFormat === b.timeFormat
    && a.barMode === b.barMode
    && a.clipboard === b.clipboard
    && a.active === b.active;
}

function PaneView({ index }: { index: 0 | 1 }) {
  const [, redraw] = useState(0);
  useEffect(() => useFiles.subscribe((next, prev) => {
    if (!prev || !samePane(next, prev, index)) redraw((n) => n + 1);
  }), [index]);
  const state = useFiles.getState();
  const pane = state.panes[index];
  const active = state.active;
  const nodes = state.nodes;
  const order = state.order;
  const barMode = state.barMode;
  const clipboard = state.clipboard;
  const view = useMemo(() => listing(state, index), [state, index]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [places, setPlaces] = useState(false);
  const [over, setOver] = useState(false);
  const [band, setBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const snap = { nodes, order };
  const drive = driveOf(snap, pane.pathId);
  const freePct = drive?.capacity ? Math.round(((drive.free ?? 0) / drive.capacity) * 100) : 0;
  const chain = pathIds(snap, pane.pathId);
  const max = barScale(view.rows);
  const hiddenCount = view.total - view.rows.length;
  const md = useMinWidth(768);
  const lg = useMinWidth(1024);
  const cols = { ...defaultColumns, ...state.columns };
  const rowHeight = state.compact ? 28 : 36;
  const scroller = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(640);
  const [windowed, setWindowed] = useState({ start: 0, end: 80 });
  const icon = iconMetrics(state.viewMode, paneWidth);
  const unit = state.viewMode === "details" ? rowHeight : icon.rowH;
  const stride = state.viewMode === "details" ? 1 : icon.cols;
  useEffect(() => {
    const onPath = () => {
      if (useFiles.getState().active !== index) return;
      const current = useFiles.getState();
      setDraft(displayPath(current, current.panes[index].pathId));
      setEditing(true);
    };
    window.addEventListener("datafinder-path", onPath);
    return () => window.removeEventListener("datafinder-path", onPath);
  }, [index]);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = 0;
    setWindowed({ start: 0, end: 80 });
  }, [pane.pathId, state.viewMode]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      setPaneWidth((width) => (Math.abs(width - el.clientWidth) > 16 ? el.clientWidth : width));
      const startUnit = Math.max(0, Math.floor(el.scrollTop / unit) - 2);
      const count = Math.ceil(el.clientHeight / unit) + 6;
      const start = startUnit * stride;
      const end = (startUnit + count) * stride;
      setWindowed((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [pane.pathId, state.viewMode, unit, stride, view.rows.length]);
  const virtual = view.rows.length > 80 && !band;
  const shownRows = virtual ? view.rows.slice(windowed.start, windowed.end) : view.rows;
  const tableWidth =
    cols.name +
    cols.size +
    cols.viz +
    (lg ? cols.type : 0) +
    (md ? cols.date + cols.h + cols.r + cols.s : 0);

  const openRow = (row: ListRow) => {
    if (row.nodeId) {
      useFiles.getState().openItem(index, row.nodeId);
      return;
    }
    useFiles.getState().openDialog({
      kind: "preview",
      title: row.name,
      body: row.note ?? "This name exists only in the saved copy. Bring back to copy missing names into the live folder.",
    });
  };

  return (
    <section
      data-pane={index}
      className={"relative flex h-full min-h-0 flex-1 flex-col bg-pane " + (active === index ? "border-l-4 border-l-accent" : "border-l-4 border-l-transparent")}
      onMouseDown={() => useFiles.getState().setActive(index)}
    >
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line bg-header px-1">
        {(pane.tabs?.length ? pane.tabs : [{ key: pane.tab, pathId: pane.pathId }]).map((tab) => {
          const tabNode = nodes[tab.pathId];
          const label = tabNode ? (tabNode.kind === "drive" ? driveCaption(tabNode) : tabNode.name) : "Folder";
          const on = tab.key === pane.tab;
          return (
            <span key={tab.key} className={"flex h-8 max-w-40 shrink-0 items-center rounded-t-md " + (on ? "bg-pane text-ink" : "text-muted")}>
              <button type="button" className="min-w-0 flex-1 truncate px-2 text-left text-xs" title={label} onClick={() => useFiles.getState().selectTab(index, tab.key)}>{label}</button>
              {pane.tabs.length > 1 && (
                <button type="button" className="px-1 text-xs text-muted hover:text-ink" aria-label={`Close ${label}`} onClick={() => useFiles.getState().closeTab(index, tab.key)}>×</button>
              )}
            </span>
          );
        })}
        <button type="button" className="grid size-7 shrink-0 place-items-center rounded-md text-sm text-muted hover:bg-select" aria-label="New tab" onClick={() => useFiles.getState().openTab(index, pane.pathId)}>+</button>
      </div>
      <div className="flex items-center gap-1 border-b border-line bg-header px-1">
        <IconButton label="Back" disabled={!pane.back.length} onClick={() => useFiles.getState().goBack(index)}><ChevronLeft className="size-4" /></IconButton>
        <IconButton label="Forward" disabled={!pane.forward.length} onClick={() => useFiles.getState().goForward(index)}><ChevronRight className="size-4" /></IconButton>
        <IconButton label="Up" onClick={() => useFiles.getState().goUp(index)}><ArrowUp className="size-4" /></IconButton>
        <IconButton label="Refresh" onClick={() => useFiles.getState().refresh(index)}><RefreshCw className="size-4" /></IconButton>
        <button type="button" className="min-h-11 px-2 text-sm sm:hidden" onClick={() => setPlaces((v) => !v)}>Folders</button>
        {editing ? (
          <form
            className="min-w-0 flex-1 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              useFiles.getState().setActive(index);
              void useFiles.getState().openTypedPath(draft).then((ok) => {
                if (ok) setEditing(false);
              });
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => setEditing(false)}
              aria-label="Folder path"
              className="h-9 w-full border border-line bg-pane px-2 text-sm outline-none"
            />
          </form>
        ) : (
          <button
            type="button"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 text-left text-sm"
            onClick={() => {
              setDraft(displayPath(snap, pane.pathId));
              setEditing(true);
            }}
          >
            {chain.map((id, i) => {
              const node = nodes[id];
              if (!node) return null;
              const label = node.kind === "drive" ? driveCaption(node) : node.name;
              return (
                <span key={id} className="flex shrink-0 items-center gap-1">
                  {i > 0 && <ChevronRight className="size-3 text-muted" />}
                  <span
                    className="hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      useFiles.getState().navigate(index, id);
                    }}
                  >
                    {label}
                  </span>
                </span>
              );
            })}
          </button>
        )}
      </div>
      {view.banner && (
        <div className="flex items-center gap-2 border-b border-line bg-diff px-2 py-1 text-xs">
          <span className="min-w-0 flex-1 truncate">{view.banner}</span>
          <button type="button" className="shrink-0 underline" onClick={() => {
            const store = useFiles.getState();
            if (store.shadowPane === index) store.clearShadow();
            else if (store.searchPane === index) store.clearSearch();
            else store.toggleFlat(index);
          }}>
            Close
          </button>
        </div>
      )}
      <div
        className={"flex min-h-0 flex-1 " + (over ? "bg-select" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const ids = useFiles.getState().dragIds;
          if (!ids?.length) return;
          useFiles.getState().transferTo(ids, pane.pathId, e.ctrlKey || e.metaKey ? "copy" : "move");
        }}
      >
        <aside className={!state.showNav ? "hidden" : (places ? "absolute inset-0 z-10 w-full " : "hidden ") + "overflow-auto border-r border-line bg-tree sm:static sm:block sm:w-56 sm:shrink-0"}>
          <NavPlaces pane={index} />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref={scroller}
          data-scroller=""
          data-row-h={unit}
          data-cols={stride}
          className="relative min-h-0 min-w-0 flex-1 overflow-auto"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const target = event.target as HTMLElement;
            if (target.closest("th, input, a")) return;
            const rowId = target.closest("[data-row]")?.getAttribute("data-row") ?? "";
            if (rowId && pane.selected.includes(rowId)) return;
            const startX = event.clientX;
            const startY = event.clientY;
            dragSelect.moved = false;
            const pick = (ev: PointerEvent) => {
              const x = Math.min(startX, ev.clientX);
              const y = Math.min(startY, ev.clientY);
              const w = Math.abs(ev.clientX - startX);
              const h = Math.abs(ev.clientY - startY);
              if (w + h < 6) return;
              dragSelect.moved = true;
              setBand({ x, y, w, h });
              const hits: string[] = [];
              document.querySelectorAll(`[data-pane="${index}"] [data-row]`).forEach((el) => {
                const rect = el.getBoundingClientRect();
                const id = el.getAttribute("data-row");
                if (!id) return;
                if (rect.left < x + w && rect.right > x && rect.top < y + h && rect.bottom > y) hits.push(id);
              });
              useFiles.getState().selectIds(index, hits);
            };
            const end = () => {
              setBand(null);
              window.removeEventListener("pointermove", pick);
              window.removeEventListener("pointerup", end);
              window.removeEventListener("pointercancel", end);
            };
            window.addEventListener("pointermove", pick);
            window.addEventListener("pointerup", end);
            window.addEventListener("pointercancel", end);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            useFiles.getState().setActive(index);
            useFiles.getState().openMenu({ x: e.clientX, y: e.clientY, id: null });
          }}
        >
          {band && <div className="pointer-events-none fixed z-50 border border-accent bg-accent/20" style={{ left: band.x, top: band.y, width: band.w, height: band.h }} />}
          {pane.notice && (
            <div className="flex items-center justify-between gap-2 border-b border-line bg-header px-3 py-2 text-sm">
              <span>{pane.notice}</span>
              <button type="button" className="rounded-md px-2 py-1 hover:bg-select" onClick={() => useFiles.getState().refresh(index)}>Try again</button>
            </div>
          )}
          {state.viewMode === "details" ? (
          <table
            className={"table-fixed border-collapse text-left " + (state.reading ? "text-base" : "text-sm")}
            style={{ width: `max(${tableWidth}px, 100%)` }}
          >
            <thead className="sticky top-0 z-10 bg-header text-xs text-muted">
              <tr>
                <Th label="Name" width={cols.name} column="name" sort={{ pane, index, key: "name" }} />
                <Th label="Size" width={cols.size} column="size" sort={{ pane, index, key: "size" }} />
                <Th label="Size bar" width={cols.viz} column="viz" />
                <Th label="Type" width={cols.type} column="type" className="hidden lg:table-cell" sort={{ pane, index, key: "type" }} />
                <Th label="Modified" width={cols.date} column="date" className="hidden md:table-cell" sort={{ pane, index, key: "date" }} />
                <Th label="Hidden" width={cols.h} column="h" className="hidden md:table-cell" />
                <Th label="Read-only" width={cols.r} column="r" className="hidden md:table-cell" />
                <Th label="System" width={cols.s} column="s" className="hidden md:table-cell" />
              </tr>
            </thead>
            <tbody>
              {virtual && windowed.start > 0 && (
                <tr aria-hidden="true">
                  <td colSpan={8} style={{ height: windowed.start * rowHeight, padding: 0, border: 0 }} />
                </tr>
              )}
              {shownRows.map((row) => {
                const selected = pane.selected.includes(row.id);
                const pct = barPercent(row.bytes, max, barMode);
                const cut = clipboard?.mode === "cut" && row.nodeId && clipboard.ids.includes(row.nodeId);
                const kind = typeLabel(row.nodeId && nodes[row.nodeId] ? nodes[row.nodeId] : ({ kind: row.kind, name: row.name } as FsNode));
                const when = formatWhen(row.modified, state.dateFormat, state.timeFormat);
                return (
                  <tr
                    key={row.id}
                    data-row={row.id}
                    draggable={!isDesktop() && Boolean(row.nodeId)}
                    onPointerDown={(event) => armDesktopDrag(event, index, row.nodeId)}
                    aria-selected={selected}
                    className={
                      "file-row" +
                      (state.compact ? "" : "") +
                      (cut ? " opacity-50" : "")
                    }
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("input")) return;
                      if (dragSelect.moved) {
                        dragSelect.moved = false;
                        return;
                      }
                      const ids = view.rows.map((item) => item.id);
                      if (e.shiftKey) useFiles.getState().selectRange(index, row.id, ids);
                      else if (e.metaKey || e.ctrlKey) useFiles.getState().toggleSelect(index, row.id);
                      else useFiles.getState().selectOnly(index, row.id);
                    }}
                    onDoubleClick={(event) => {
                      if ((event.ctrlKey || event.metaKey) && row.nodeId && row.kind !== "file") {
                        useFiles.getState().openTab(index, row.nodeId);
                        return;
                      }
                      openRow(row);
                    }}
                    onDragStart={(e) => {
                      if (dragSelect.moved || !row.nodeId) {
                        e.preventDefault();
                        return;
                      }
                      const ids = pane.selected.includes(row.nodeId) ? pane.selected : [row.nodeId];
                      e.dataTransfer.setData("text/plain", ids.join("\n"));
                      e.dataTransfer.effectAllowed = "copyMove";
                      useFiles.getState().setDrag(ids);
                    }}
                    onDragEnd={() => useFiles.getState().setDrag(null)}
                    onDragOver={(e) => {
                      if (row.kind !== "file") e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (!row.nodeId || row.kind === "file") return;
                      e.preventDefault();
                      e.stopPropagation();
                      setOver(false);
                      const ids = useFiles.getState().dragIds;
                      if (!ids?.length) return;
                      useFiles.getState().transferTo(ids, row.nodeId, e.ctrlKey || e.metaKey ? "copy" : "move");
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      useFiles.getState().setActive(index);
                      if (row.nodeId && !pane.selected.includes(row.nodeId)) useFiles.getState().selectOnly(index, row.nodeId);
                      useFiles.getState().openMenu({ x: e.clientX, y: e.clientY, id: row.nodeId ?? null });
                    }}
                    onPointerUp={(e) => {
                      if (e.button !== 2) return;
                      e.preventDefault();
                      e.stopPropagation();
                      useFiles.getState().setActive(index);
                      if (row.nodeId && !pane.selected.includes(row.nodeId)) useFiles.getState().selectOnly(index, row.nodeId);
                      useFiles.getState().openMenu({ x: e.clientX, y: e.clientY, id: row.nodeId ?? null });
                    }}
                  >
                    <td className={"overflow-hidden px-2 " + (state.compact ? "py-0.5" : "py-1.5")} style={columnBox(cols.name)}>
                      <span className="flex items-center gap-2">
                        {state.itemChecks && (
                          <input
                            type="checkbox"
                            checked={selected}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => useFiles.getState().toggleSelect(index, row.id)}
                            aria-label={`Select ${row.name}`}
                          />
                        )}
                        <Icon node={{ kind: row.kind, name: row.name, note: row.note }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate" title={row.kind === "drive" && row.nodeId && nodes[row.nodeId] ? driveCaption(nodes[row.nodeId]) : row.name}>
                            {row.kind === "drive" && row.nodeId && nodes[row.nodeId] ? driveCaption(nodes[row.nodeId]) : shownName(row.name, row.kind, state.showExt)}
                          </span>
                          {row.path && <span className="block truncate text-xs text-muted" title={row.path}>{row.path}</span>}
                          {row.onlyHere && <span className="text-xs text-accent">Missing opposite</span>}
                          {row.dupe && <span className="text-xs text-accent">Twin size</span>}
                          {row.hit && <span className="text-xs text-accent">Hit</span>}
                        </span>
                      </span>
                    </td>
                    <td className="overflow-hidden px-2 py-1" style={columnBox(cols.size)} title={shownSize(row.bytes, row.approx, row.blocked) || "Not measured"}>
                      <span className="block truncate tabular-nums">{shownSize(row.bytes, row.approx, row.blocked)}</span>
                    </td>
                    <td className="overflow-hidden px-2 py-1" style={columnBox(cols.viz)}>
                      <div className="h-3 w-full overflow-hidden bg-bar-track" title={shownSize(row.bytes, row.approx) || "Not measured"}>
                        {pct > 0 && <div className="h-full bg-bar" style={{ width: `${pct}%` }} />}
                      </div>
                    </td>
                    <td className="hidden overflow-hidden px-2 py-1 lg:table-cell" style={columnBox(cols.type)} title={kind}>
                      <span className="block truncate">{kind}</span>
                    </td>
                    <td className="hidden overflow-hidden px-2 py-1 md:table-cell" style={columnBox(cols.date)} title={when}>
                      <span className="block truncate">{when}</span>
                    </td>
                    <td className="hidden overflow-hidden px-2 md:table-cell" style={columnBox(cols.h)} title={row.hidden ? "Hidden" : ""}>
                      <span className="block truncate">{row.hidden ? "Hidden" : ""}</span>
                    </td>
                    <td className="hidden overflow-hidden px-2 md:table-cell" style={columnBox(cols.r)} title={row.readonly ? "Read-only" : ""}>
                      <span className="block truncate">{row.readonly ? "Read-only" : ""}</span>
                    </td>
                    <td className="hidden overflow-hidden px-2 md:table-cell" style={columnBox(cols.s)} title={row.system ? "System" : ""}>
                      <span className="block truncate">{row.system ? "System" : ""}</span>
                    </td>
                  </tr>
                );
              })}
              {virtual && windowed.end < view.rows.length && (
                <tr aria-hidden="true">
                  <td colSpan={8} style={{ height: (view.rows.length - windowed.end) * rowHeight, padding: 0, border: 0 }} />
                </tr>
              )}
              {view.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    {view.banner ? "No matches." : hiddenCount > 0 ? "Nothing matches these flags." : "This folder is empty."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          ) : (
            <>
            {virtual && windowed.start > 0 && <div aria-hidden="true" style={{ height: Math.floor(windowed.start / stride) * unit }} />}
            <IconBoard index={index} rows={virtual ? shownRows : view.rows} mode={state.viewMode} columns={icon.cols} cellHeight={virtual ? icon.rowH : undefined} />
            {virtual && windowed.end < view.rows.length && <div aria-hidden="true" style={{ height: Math.ceil((view.rows.length - windowed.end) / stride) * unit }} />}
            </>
          )}
        </div>
        {state.detailsOpen && <DetailsStrip index={index} compact className={state.split ? "flex 2xl:hidden" : "flex lg:hidden"} />}
        </div>
        {state.detailsOpen && <DetailsStrip index={index} className={state.split ? "hidden shrink-0 2xl:flex" : "hidden shrink-0 lg:flex"} />}
        {state.previewOpen && <PreviewPane index={index} />}
      </div>
      <footer className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-status px-2 text-xs">
        <span className="min-w-0 flex-1 truncate">
          {view.rows.filter((row) => pane.selected.includes(row.id)).length} of {view.rows.length} items selected
          {hiddenCount > 0 ? ` · ${hiddenCount} filtered` : ""}
        </span>
        {!state.detailsOpen ? (
          <button type="button" className="shrink-0 rounded-md px-2 py-0.5 hover:bg-header" onClick={() => useFiles.getState().setOptions({ detailsOpen: true })}>
            Details
          </button>
        ) : (
          <button type="button" className="shrink-0 rounded-md bg-select px-2 py-0.5" onClick={() => useFiles.getState().setOptions({ detailsOpen: false })}>
            Hide details
          </button>
        )}
        {drive && (
          <span className="flex shrink-0 items-center gap-2">
            <span className="tabular-nums">
              {drive.name.endsWith(":") ? driveCaption(drive) : drive.name}{drive.mounted !== false && drive.capacity ? ` · ${formatSize(drive.capacity)} (${freePct}% free)` : ""}
            </span>
            {drive.mounted !== false && !!drive.capacity && (
              <span className="h-3 w-28 overflow-hidden border border-line bg-pane">
                <span className="block h-full bg-free" style={{ width: `${freePct}%` }} />
              </span>
            )}
          </span>
        )}
      </footer>
    </section>
  );
}

function DetailsStrip({ index, compact = false, className = "" }: { index: 0 | 1; compact?: boolean; className?: string }) {
  const pane = useFiles((s) => s.panes[index]);
  const nodes = useFiles((s) => s.nodes);
  const order = useFiles((s) => s.order);
  const height = useFiles((s) => s.detailHeight);
  const width = useFiles((s) => s.detailWidth);
  const picked = [...pane.selected].reverse().find((id) => nodes[id]);
  const id = picked ?? pane.pathId;
  const node = nodes[id];
  if (!node) return null;
  const chosen = pane.selected.map((item) => nodes[item]).filter((item): item is FsNode => Boolean(item));
  const items = chosen.length ? chosen : [node];
  const total = items.reduce((sum, item) => sum + (item.bytes ?? 0), 0);
  const unknown = items.some((item) => item.bytes == null);
  const approx = items.some((item) => item.approx);
  const makeup = (folderId: string) => {
    const groups = new Map<string, { count: number; bytes: number; missing: boolean }>();
    for (const child of (order[folderId] ?? []).map((item) => nodes[item]).filter((item): item is FsNode => Boolean(item))) {
      const label = typeLabel(child);
      const group = groups.get(label) ?? { count: 0, bytes: 0, missing: false };
      group.count += 1;
      if (child.bytes == null) group.missing = true;
      else group.bytes += child.bytes;
      groups.set(label, group);
    }
    return [...groups.entries()];
  };
  const flags = [node.hidden && "Hidden", node.readonly && "Read-only", node.system && "System"].filter(Boolean).join(", ") || "Normal";
  const place = displayPath({ nodes, order }, items.length === 1 ? items[0].id : id);
  const note = node.note?.trim() ? node.note : "No note. Click to add one.";
  const openNote = () => useFiles.getState().openReader(items.length === 1 ? items[0].id : node.id);
  const resize = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = compact ? height : width;
    const origin = compact ? event.clientY : event.clientX;
    const move = (ev: PointerEvent) => {
      const delta = (compact ? origin - ev.clientY : origin - ev.clientX);
      useFiles.getState().setDetailSize(compact ? { height: start + delta } : { width: start + delta });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  return (
    <aside
      style={compact ? { height } : { width }}
      className={"relative min-w-0 flex-col gap-1 overflow-auto border-line bg-header p-2 text-xs " + (compact ? "shrink-0 border-t " : "min-h-0 self-stretch border-l ") + className}
    >
      <span
        role="separator"
        aria-orientation={compact ? "horizontal" : "vertical"}
        aria-label="Resize details"
        title="Drag to resize"
        className={"absolute z-10 touch-none " + (compact ? "inset-x-0 -top-1.5 h-3 cursor-row-resize" : "inset-y-0 -left-1.5 w-3 cursor-col-resize")}
        onPointerDown={resize}
      >
        <span className={compact ? "absolute inset-x-2 top-1/2 h-px bg-line" : "absolute inset-y-2 left-1/2 w-px bg-line"} />
      </span>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 font-semibold">
          {items.length > 1 ? `${items.length} selected` : items[0].kind === "drive" ? driveCaption(items[0]) : items[0].name}
        </div>
        <button
          type="button"
          aria-label="Close details"
          title="Close"
          className="grid size-8 shrink-0 place-items-center hover:bg-select"
          onClick={() => useFiles.getState().setOptions({ detailsOpen: false })}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="font-semibold tabular-nums">
        Total {unknown && total === 0 ? "Not measured" : `${shownSize(total, approx) || "0 B"}${unknown ? " +" : ""}`}
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const parts = makeup(item.id);
          const name = item.kind === "drive" ? driveCaption(item) : item.name;
          return (
            <li key={item.id}>
              <div className="truncate font-semibold" title={name}>{name}</div>
              <div className="text-muted">{typeLabel(item)} · {shownSize(item.bytes, item.approx) || "Not measured"}</div>
              {item.kind !== "file" && (
                parts.length === 0 ? (
                  <div className="text-muted">Contents are not loaded yet.</div>
                ) : (
                  <ul className="mt-0.5 space-y-0.5 pl-2">
                    {parts.map(([label, group]) => (
                      <li key={label} className="truncate text-muted">
                        {label} · {group.count} · {group.missing && group.bytes === 0 ? "Not measured" : `${formatSize(group.bytes) || "0 B"}${group.missing ? " +" : ""}`}
                      </li>
                    ))}
                  </ul>
                )
              )}
            </li>
          );
        })}
      </ul>
      {items.length === 1 && (
        <>
          <div className="flex flex-wrap gap-x-3">
            {node.kind === "drive" && node.mounted === false && <span>No letter</span>}
            <span className="text-muted">{flags}</span>
          </div>
          <div className="break-all text-muted" title={place}>{place}</div>
          <button type="button" className="min-h-11 w-full whitespace-pre-wrap break-words text-left hover:underline" title={node.note || "Add a note"} onClick={openNote}>
            {note}
          </button>
        </>
      )}
    </aside>
  );
}

function useMinWidth(px: number) {
  const [matches, setMatches] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${px}px)`);
    const apply = () => setMatches(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [px]);
  return matches;
}

function columnBox(px: number): CSSProperties {
  return { width: px, minWidth: px, maxWidth: px };
}

function Th({
  label,
  width,
  column,
  className = "",
  title,
  align = "left",
  sort,
}: {
  label: string;
  width: number;
  column: keyof ColumnWidths;
  className?: string;
  title?: string;
  align?: "left" | "center";
  sort?: { pane: PaneModel; index: 0 | 1; key: SortKey };
}) {
  const mark = sort && sort.pane.sortKey === sort.key ? (sort.pane.sortDir === "asc" ? " ▲" : " ▼") : "";
  const hint = title ?? label;
  return (
    <th
      className={"relative py-1.5 font-semibold " + (align === "center" ? "px-1 text-center " : "px-2 ") + className}
      style={columnBox(width)}
      title={hint}
    >
      {sort ? (
        <button type="button" className="max-w-full truncate hover:underline" title={hint} onClick={() => useFiles.getState().setSort(sort.index, sort.key)}>
          {label}{mark}
        </button>
      ) : (
        <span className="block truncate">{label}</span>
      )}
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${hint}`}
        title="Drag to resize"
        className="absolute top-0 -right-1.5 z-10 h-full w-3 cursor-col-resize touch-none"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const start = width;
          const move = (ev: PointerEvent) => useFiles.getState().setColumn(column, start + ev.clientX - startX);
          const end = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            window.removeEventListener("pointercancel", end);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", end);
          window.addEventListener("pointercancel", end);
        }}
      >
        <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
      </span>
    </th>
  );
}

function IconButton({ children, label, onClick, disabled }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-11 place-items-center rounded-sm hover:bg-select">
      {children}
    </button>
  );
}

function policyHint(policy: ConflictPolicy) {
  if (policy === "old") return "The name already there is renamed with a .old suffix, then the incoming item takes the original name.";
  if (policy === "overwrite") return "The name already there is replaced.";
  if (policy === "newer") return "The name already there is replaced only when the incoming item is newer.";
  return "Names that are already there are left untouched.";
}

function CollisionDialog({ ids, dest, mode, names }: { ids: string[]; dest: string; mode: "copy" | "move"; names: string[] }) {
  const [merge, setMerge] = useState(false);
  const [policy, setPolicy] = useState<ConflictPolicy>("old");
  const extra = names.length > 1 ? ` and ${names.length - 1} more` : "";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        useFiles.getState().transferTo(ids, dest, mode, { policy: merge ? policy : "alongside" });
      }}
    >
      <h2 className="text-base font-semibold">Name already there</h2>
      <p className="mt-2 text-sm font-semibold">"{names[0]}"{extra} is already in that folder</p>
      <p className="mt-1 text-sm text-muted">This only changes the catalog.</p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="radio" name="collision" className="mt-1" checked={merge} onChange={() => setMerge(true)} />
        <span className="min-w-0 flex-1">
          <span className="font-semibold">Replace or skip</span>
          {merge && (
            <select aria-label="Merge policy" value={policy} onChange={(e) => setPolicy(e.target.value as ConflictPolicy)} className="mt-2 h-11 w-full border border-line bg-pane px-2">
              <option value="old">Rename existing to .old</option>
              <option value="overwrite">Overwrite existing</option>
              <option value="newer">Update only if source is newer</option>
              <option value="skip">Skip existing</option>
            </select>
          )}
          {merge && <span className="mt-1 block text-xs text-muted">{policyHint(policy)}</span>}
        </span>
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input type="radio" name="collision" className="mt-1" checked={!merge} onChange={() => setMerge(false)} />
        <span>
          <span className="font-semibold">Keep both copies</span>
          <span className="mt-1 block text-xs text-muted">Names are suffixed with (2). This is the default.</span>
        </span>
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
        <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">Continue</button>
      </div>
    </form>
  );
}

const QUICK_TYPES: Array<[string, string[]]> = [
  ["Docs", ["pdf", "docx", "txt", "xlsx", "csv"]],
  ["Music", ["mp3", "wav", "flac"]],
  ["Video", ["mp4", "mkv", "avi"]],
  ["Pictures", ["jpg", "jpeg", "png", "gif", "webp"]],
  ["Mail", ["eml", "msg"]],
  ["Archives", ["zip", "iso", "7z"]],
];

function SearchDialog() {
  const activePath = useFiles((s) => displayPath(s, s.panes[s.active].pathId));
  const [page, setPage] = useState<"search" | "attr" | "date" | "advanced">("search");
  const [query, setQuery] = useState("");
  const [path, setPath] = useState(activePath);
  const [exts, setExts] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const [readonly, setReadonly] = useState(false);
  const [system, setSystem] = useState(false);
  const [minBytes, setMinBytes] = useState(0);
  const [maxDays, setMaxDays] = useState(0);
  const [notes, setNotes] = useState(true);
  const [exclude, setExclude] = useState("");
  const toggleExt = (group: string[]) => {
    setExts((current) => {
      const on = group.every((ext) => current.includes(ext));
      return on ? current.filter((ext) => !group.includes(ext)) : [...new Set([...current, ...group])];
    });
  };
  const pages: Array<["search" | "attr" | "date" | "advanced", string]> = [
    ["search", "Search"],
    ["attr", "Flags"],
    ["date", "Date / size"],
    ["advanced", "Advanced"],
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        useFiles.getState().runSearch({ query, path, exts, hidden, readonly, system, minBytes, maxDays, notes, exclude });
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Search the catalog</h2>
        <button type="button" aria-label="Close" onClick={() => useFiles.getState().openDialog(null)}><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex min-h-64 border border-line">
        <div className="flex w-32 shrink-0 flex-col border-r border-line bg-header">
          {pages.map(([id, label]) => (
            <button key={id} type="button" className={"min-h-11 px-3 text-left text-sm " + (page === id ? "bg-accent text-accent-ink" : "hover:bg-select")} onClick={() => setPage(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-3">
          {page === "search" && (
            <div className="space-y-3">
              <label className="block text-sm">
                Search query
                <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="mt-1 h-11 w-full border border-line px-2 outline-none" aria-label="Search query" />
              </label>
              <div>
                <p className="text-xs text-muted">Quick add</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {QUICK_TYPES.map(([label, group]) => (
                    <button key={label} type="button" className={"min-h-9 border px-2 text-xs " + (group.every((ext) => exts.includes(ext)) ? "border-select-edge bg-select" : "border-line")} onClick={() => toggleExt(group)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-sm">
                Search in
                <span className="mt-1 flex gap-2">
                  <input value={path} onChange={(e) => setPath(e.target.value)} className="h-11 min-w-0 flex-1 border border-line px-2 outline-none" aria-label="Search path" />
                  <button type="button" className="min-h-11 shrink-0 border border-line px-3" onClick={() => setPath(displayPath(useFiles.getState(), useFiles.getState().panes[useFiles.getState().active].pathId))}>This folder</button>
                </span>
              </label>
            </div>
          )}
          {page === "attr" && (
            <div className="space-y-2 text-sm">
              <p className="text-muted">Require these flags. Leave them off to ignore flags.</p>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hidden</label>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={readonly} onChange={(e) => setReadonly(e.target.checked)} /> Read-only</label>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={system} onChange={(e) => setSystem(e.target.checked)} /> System</label>
            </div>
          )}
          {page === "date" && (
            <div className="space-y-3 text-sm">
              <label className="block">
                Modified
                <select value={maxDays} onChange={(e) => setMaxDays(Number(e.target.value))} className="mt-1 h-11 w-full border border-line bg-pane px-2">
                  <option value={0}>Any time</option>
                  <option value={1}>Past day</option>
                  <option value={7}>Past week</option>
                  <option value={31}>Past month</option>
                  <option value={365}>Past year</option>
                </select>
              </label>
              <label className="block">
                Size
                <select value={minBytes} onChange={(e) => setMinBytes(Number(e.target.value))} className="mt-1 h-11 w-full border border-line bg-pane px-2">
                  <option value={0}>Any size</option>
                  <option value={MB}>1 MB or larger</option>
                  <option value={100 * MB}>100 MB or larger</option>
                  <option value={1024 * MB}>1 GB or larger</option>
                </select>
              </label>
            </div>
          )}
          {page === "advanced" && (
            <div className="space-y-3 text-sm">
              <label className="flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={notes} onChange={(e) => setNotes(e.target.checked)} />
                Also match text notes
              </label>
              <label className="block">
                Exclude names containing
                <input value={exclude} onChange={(e) => setExclude(e.target.value)} className="mt-1 h-11 w-full border border-line px-2 outline-none" aria-label="Exclude" />
              </label>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
        <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">Search</button>
      </div>
    </form>
  );
}

function OperationDialog() {
  const [page, setPage] = useState<"op" | "copy" | "log">("op");
  const [sourceMode, setSourceMode] = useState<"clipboard" | "path">("clipboard");
  const [sourcePath, setSourcePath] = useState("");
  const [destMode, setDestMode] = useState<"here" | "path">("here");
  const [destPath, setDestPath] = useState("C:\\");
  const [policy, setPolicy] = useState<ConflictPolicy>("alongside");
  const [logging, setLogging] = useState(true);
  const clip = useFiles((s) => s.clipboard);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const state = useFiles.getState();
        let ids: string[] = [];
        if (sourceMode === "clipboard") {
          ids = state.clipboard?.ids ?? [];
          if (!ids.length) {
            useFiles.setState({ status: "Nothing held" });
            return;
          }
        } else {
          const hit = resolvePath(state, sourcePath);
          const id = hit?.selectId ?? hit?.folderId;
          if (!hit || !id || id === "pc") {
            useFiles.setState({ status: "Source path not found" });
            return;
          }
          ids = [id];
        }
        let dest = state.panes[state.active].pathId;
        if (destMode === "path") {
          const hit = resolvePath(state, destPath);
          if (!hit || hit.selectId) {
            useFiles.setState({ status: "Destination must be a folder" });
            return;
          }
          dest = hit.folderId;
        }
        state.transferTo(ids, dest, "copy", { policy, log: logging });
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Copy between folders</h2>
        <button type="button" aria-label="Close" onClick={() => useFiles.getState().openDialog(null)}><X className="size-4" /></button>
      </div>
      <div className="mt-3 flex min-h-56 border border-line">
        <div className="flex w-32 shrink-0 flex-col border-r border-line bg-header">
          {(["op", "copy", "log"] as const).map((id) => (
            <button key={id} type="button" className={"min-h-11 px-3 text-left text-sm " + (page === id ? "bg-accent text-accent-ink" : "hover:bg-select")} onClick={() => setPage(id)}>
              {id === "op" ? "From / to" : id === "copy" ? "Name clash" : "Record"}
            </button>
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-3 text-sm">
          {page === "op" && (
            <>
              <label className="block">
                Source
                <span className="mt-1 flex gap-2">
                  <select value={sourceMode} onChange={(e) => setSourceMode(e.target.value as "clipboard" | "path")} className="h-11 border border-line bg-pane px-2">
                    <option value="clipboard">Held items</option>
                    <option value="path">Path</option>
                  </select>
                  {sourceMode === "path" ? (
                    <input value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} placeholder="C:\Users\Owner\Documents" className="h-11 min-w-0 flex-1 border border-line px-2 outline-none" aria-label="Source path" />
                  ) : (
                    <span className="flex h-11 min-w-0 flex-1 items-center truncate border border-line px-2 text-muted">{clip ? `${clip.ids.length} item(s) held` : "Nothing held"}</span>
                  )}
                </span>
              </label>
              <label className="block">
                Destination
                <span className="mt-1 flex gap-2">
                  <select value={destMode} onChange={(e) => setDestMode(e.target.value as "here" | "path")} className="h-11 border border-line bg-pane px-2">
                    <option value="here">This folder</option>
                    <option value="path">Path</option>
                  </select>
                  {destMode === "path" ? (
                    <input value={destPath} onChange={(e) => setDestPath(e.target.value)} className="h-11 min-w-0 flex-1 border border-line px-2 outline-none" aria-label="Destination path" />
                  ) : (
                    <span className="flex h-11 min-w-0 flex-1 items-center truncate border border-line px-2 text-muted">Copy into the active pane</span>
                  )}
                </span>
              </label>
            </>
          )}
          {page === "copy" && (
            <label className="block">
              If the name exists
              <select value={policy} onChange={(e) => setPolicy(e.target.value as ConflictPolicy)} className="mt-1 h-11 w-full border border-line bg-pane px-2">
                <option value="alongside">Keep both — add (2)</option>
                <option value="old">Rename existing to .old</option>
                <option value="overwrite">Overwrite existing</option>
                <option value="newer">Update only if source is newer</option>
                <option value="skip">Skip existing</option>
              </select>
            </label>
          )}
          {page === "log" && (
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={logging} onChange={(e) => setLogging(e.target.checked)} />
              Write this copy to the activity list
            </label>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
        <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">OK</button>
      </div>
    </form>
  );
}

function NetworkDialog({ location }: { location: boolean }) {
  const [path, setPath] = useState("\\\\");
  const [letter, setLetter] = useState(location ? "" : "Z");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void mapNetwork(path.trim(), location ? "" : letter.trim())
          .then((message) => {
            useFiles.getState().openDialog(null);
            useFiles.setState({ status: message });
            void useFiles.getState().reloadDrives();
          })
          .catch((error: unknown) => useFiles.setState({ status: error instanceof Error ? error.message : "Could not add that network place" }));
      }}
    >
      <h2 className="text-base font-semibold">{location ? "Add a network location" : "Map a network drive"}</h2>
      <p className="mt-1 text-sm text-muted">Use a path like \\server\share.</p>
      <input autoFocus value={path} onChange={(e) => setPath(e.target.value)} aria-label="Network path" className="mt-3 h-11 w-full border border-line px-2 text-sm outline-none" />
      {!location && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          Letter
          <input value={letter} onChange={(e) => setLetter(e.target.value.slice(0, 1))} aria-label="Drive letter" className="h-9 w-16 border border-line px-2 outline-none" />
        </label>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
        <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">{location ? "Add" : "Map"}</button>
      </div>
    </form>
  );
}

function SnapshotWindow({ embedded = false }: { embedded?: boolean }) {
  const [rows, setRows] = useState<DiskSnapshot[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const status = useFiles((s) => s.status);
  const load = () => {
    void listSnapshots().then((items) => {
      setRows(items);
      setPicked((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id ?? null);
    }).catch(() => setRows([]));
  };
  useEffect(load, [status]);
  const current = rows.find((item) => item.id === picked);
  return (
    <div className={embedded ? "" : "w-[42rem] max-w-[90vw]"}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Saved copies</h2>
        {!embedded && <button type="button" aria-label="Close" onClick={() => useFiles.getState().openDialog(null)}><X className="size-4" /></button>}
      </div>
      <p className="mt-1 text-sm text-muted">A saved copy is the folder as it is right now, stored where you choose. That can be an external drive.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[16rem_1fr]">
        <ul className={"overflow-auto border border-line " + (embedded ? "max-h-[50vh]" : "max-h-72")}>
          {rows.length === 0 && <li className="px-2 py-3 text-sm text-muted">No saved copies yet</li>}
          {rows.map((item) => (
            <li key={item.id}>
              <button type="button" className={"block w-full px-2 py-2 text-left text-sm " + (item.id === picked ? "bg-select" : "hover:bg-header")} onClick={() => setPicked(item.id)}>
                <span className="block">{new Date(item.taken).toLocaleString()}</span>
                <span className="text-xs text-muted">{item.files} files · {formatSize(item.bytes)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="text-sm">
          {!current && <p className="text-muted">Save the folder you have open, or copy your user folders.</p>}
          {current && (
            <>
              <p>{current.files} files · {formatSize(current.bytes)}{current.skipped ? ` · ${current.skipped} skipped` : ""}</p>
              <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-auto pl-5">
                {current.sources.map((source) => <li key={source} className="break-all">{source}</li>)}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="min-h-11 px-3" disabled={!current} onClick={() => current && void removeSnapshot(current.id).then(load)}>Remove</button>
        <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink" disabled={!current} onClick={() => current && void restoreSnapshot(current.id).then((message) => { useFiles.setState({ status: message }); useFiles.getState().refresh(); })}>Restore</button>
      </div>
    </div>
  );
}

function EarlierDialog({ embedded = false }: { embedded?: boolean }) {
  const nodes = useFiles((s) => s.nodes);
  const [rows, setRows] = useState<EarlierCopy[] | null>(null);
  const [restore, setRestore] = useState<RestoreStatus | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<EarlierCopy | null>(null);
  const [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<EarlierEntry[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [dest, setDest] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [drive, setDrive] = useState("C");
  const load = () => {
    void earlierList().then((items) => {
      setRows(items);
      setError("");
    }).catch((cause: unknown) => {
      setRows([]);
      setError(cause instanceof Error ? cause.message : "Could not read earlier copies");
    });
    if (!isDesktop()) return;
    void restoreStatus().then(setRestore).catch(() => setRestore({ drive: "C", enabled: "unknown" }));
  };
  useEffect(load, []);
  const letters = Array.from(new Set(
    Object.values(nodes)
      .filter((node) => node.kind === "drive" && node.name.endsWith(":") && node.mounted !== false)
      .map((node) => node.name.replace(":", "").toUpperCase()),
  ));
  const choices = letters.length ? letters : ["C"];
  const preferred = restore?.drive?.toUpperCase() ?? "";
  const selectedDrive = choices.includes(drive) ? drive : (choices.includes(preferred) ? preferred : choices[0]);
  const needsSetup = isDesktop() && !picked && rows !== null && rows.length === 0 && restore !== null && restore.enabled !== "yes";
  const canCreate = isDesktop() && !picked && rows !== null && rows.length === 0 && !error && restore?.enabled === "yes";
  const turnOn = () => {
    setBusy(true);
    setNote("Turning on restore points. Windows may ask for permission. This can take a few minutes.");
    void restoreSetup(selectedDrive)
      .then((message) => {
        setNote(message);
        setError("");
        setRows(null);
        load();
      })
      .catch((cause: unknown) => setNote(cause instanceof Error ? cause.message : "Could not turn on restore points"))
      .finally(() => setBusy(false));
  };
  const openCopy = (copy: EarlierCopy, path: string) => {
    setPicked(copy);
    setFolder(path);
    setSelected({});
    setNote("");
    void earlierEntries(copy.device, path).then(setEntries).catch((cause: unknown) => {
      setEntries([]);
      setNote(cause instanceof Error ? cause.message : "Could not open that folder");
    });
  };
  const names = entries.filter((entry) => selected[entry.name]).map((entry) => entry.name);
  const copyOut = () => {
    if (!picked) return;
    if (!names.length) {
      setNote("Select a file or folder");
      return;
    }
    if (!dest.trim()) {
      setNote("Choose a folder to copy into");
      return;
    }
    setBusy(true);
    void earlierCopy(picked.device, folder, names, dest.trim())
      .then((message) => setNote(message))
      .catch((cause: unknown) => setNote(cause instanceof Error ? cause.message : "Could not copy those items"))
      .finally(() => setBusy(false));
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Earlier copies</h2>
        {!embedded && <button type="button" aria-label="Close" onClick={() => useFiles.getState().openDialog(null)}><X className="size-4" /></button>}
      </div>
      <p className="mt-1 text-sm text-muted">A snapshot copies a folder as it is right now. Earlier copies are restore points Windows already saved. Copy files out of one. The restore point is not changed.</p>
      {error && !needsSetup && <p className="mt-2 text-sm text-danger">{error}</p>}
      {!picked && !needsSetup && (
        <ul className="mt-3 max-h-72 overflow-auto border border-line">
          {rows === null && <li className="px-2 py-3 text-sm text-muted">Reading restore points…</li>}
          {rows?.length === 0 && !error && !needsSetup && <li className="px-2 py-3 text-sm text-muted">Windows has no earlier copies on this PC.</li>}
          {rows?.map((copy) => (
            <li key={copy.id}>
              <button type="button" className="block w-full px-2 py-2 text-left text-sm hover:bg-header" onClick={() => openCopy(copy, "")}>
                <span className="block">{copy.volume} · {copy.created || "Restore point"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {needsSetup && (
        <div className="mt-3 border border-line p-3">
          <p className="text-sm">Restore points are not turned on, so Earlier copies has nothing to open yet.</p>
          <label className="mt-3 block text-sm">
            Drive
            <select value={selectedDrive} onChange={(e) => setDrive(e.target.value)} aria-label="Drive for restore points" className="mt-1 h-9 w-full border border-line bg-pane px-2">
              {choices.map((letter) => <option key={letter} value={letter}>{letter}:</option>)}
            </select>
          </label>
          <button type="button" className="mt-3 min-h-11 bg-accent px-3 text-accent-ink disabled:opacity-40" disabled={busy} onClick={turnOn}>Turn on restore points</button>
          <p className="mt-2 text-sm text-muted">Windows asks for permission, sets aside some disk space, and saves the first restore point. Later ones show up here, and Earlier copies can open them.</p>
        </div>
      )}
      {canCreate && (
        <div className="mt-3">
          <button type="button" className="min-h-11 border border-line px-3 disabled:opacity-40" disabled={busy} onClick={turnOn}>Create a restore point</button>
        </div>
      )}
      {picked && (
        <>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <button type="button" className="min-h-9 px-2" onClick={() => { setPicked(null); setEntries([]); setFolder(""); }}>All copies</button>
            <button type="button" className="min-h-9 px-2" disabled={!folder} onClick={() => openCopy(picked, folder.split("\\").filter(Boolean).slice(0, -1).join("\\"))}>Up</button>
            <span className="truncate text-muted">{picked.volume}{folder ? `\\${folder}` : "\\"}</span>
          </div>
          <ul className="mt-2 max-h-64 overflow-auto border border-line">
            {entries.length === 0 && <li className="px-2 py-3 text-sm text-muted">This folder is empty.</li>}
            {entries.map((entry) => (
              <li key={entry.name} className="flex items-center gap-2 border-t border-line px-2 py-1 text-sm first:border-t-0">
                <input type="checkbox" checked={!!selected[entry.name]} aria-label={`Select ${entry.name}`} onChange={() => setSelected((current) => ({ ...current, [entry.name]: !current[entry.name] }))} />
                {entry.kind === "dir" ? (
                  <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => openCopy(picked, folder ? `${folder}\\${entry.name}` : entry.name)}>{entry.name}</button>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                )}
                <span className="shrink-0 tabular-nums text-muted">{entry.kind === "dir" ? "Folder" : formatSize(entry.bytes) || "0 B"}</span>
              </li>
            ))}
          </ul>
          <label className="mt-3 block text-sm">
            Copy to
            <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="D:\Restored" className="mt-1 h-11 w-full border border-line px-2" aria-label="Folder to copy into" />
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="min-h-11 px-3" onClick={() => void chooseFolder().then(setDest).catch((cause: unknown) => setNote(cause instanceof Error ? cause.message : "No folder was chosen"))}>Choose folder</button>
            <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink disabled:opacity-40" disabled={busy || names.length === 0} onClick={copyOut}>Copy {names.length || ""} selected</button>
          </div>
        </>
      )}
      {note && <p className="mt-2 text-sm">{note}</p>}
    </div>
  );
}

function Dialogs() {
  const dialog = useFiles((s) => s.dialog);
  const nodes = useFiles((s) => s.nodes);
  const [text, setText] = useState("");
  useEffect(() => {
    if (dialog?.kind === "rename") setText(dialog.name);
    else if (dialog?.kind === "new") setText(dialog.file ? "New file.txt" : "New folder");
    else if (dialog?.kind === "preview") setText(dialog.body);
    else if (dialog?.kind === "goto") setText("C:\\");
    else if (dialog?.kind === "custom" || dialog?.kind === "snap-dest" || dialog?.kind === "snap-user") setText("");
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-scrim p-4" onMouseDown={() => useFiles.getState().openDialog(null)}>
      <div role="dialog" aria-modal="true" className={"w-full border border-line bg-pane p-4 shadow-lg " + (dialog.kind === "compare" || dialog.kind === "snaps" || dialog.kind === "earlier" ? "max-w-3xl" : dialog.kind === "search" || dialog.kind === "operation" ? "max-w-2xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
        {(dialog.kind === "new" || dialog.kind === "rename") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog.kind === "new") useFiles.getState().newItem(text, dialog.file, dialog.parentId);
              else useFiles.getState().rename(dialog.id, text);
            }}
          >
            <h2 className="text-base font-semibold">{dialog.kind === "new" ? (dialog.file ? "New file" : "New folder") : "Rename"}</h2>
            {dialog.kind === "new" && dialog.parentId && nodes[dialog.parentId] && (
              <p className="mt-1 text-sm text-muted">Inside {nodes[dialog.parentId].name}</p>
            )}
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="mt-3 h-11 w-full border border-line px-2 text-sm outline-none" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
              <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">OK</button>
            </div>
          </form>
        )}
        {dialog.kind === "delete" && (
          <div>
            <h2 className="text-base font-semibold">Delete {dialog.ids.length} item(s)?</h2>
            <p className="mt-2 text-sm text-muted">Removes them from this catalog only. Your real disks are not touched.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
              <button type="button" className="min-h-11 bg-danger px-3 text-accent-ink" onClick={() => useFiles.getState().remove(dialog.ids)}>Delete</button>
            </div>
          </div>
        )}
        {dialog.kind === "format" && <FormatDialog id={dialog.id} />}
        {dialog.kind === "unmount" && nodes[dialog.id] && !nodes[dialog.id].system && (
          <div>
            <h2 className="text-base font-semibold">Unmount {driveCaption(nodes[dialog.id]) }?</h2>
            <p className="mt-2 text-sm text-muted">
              {nodes[dialog.id].system
                ? "Windows is running from this drive, so it stays mounted."
                : "Open files on it will close. A removable drive is ejected. The Windows drive cannot be unmounted."}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
              <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink" onClick={() => void useFiles.getState().unmountDrive(dialog.id)}>Unmount</button>
            </div>
          </div>
        )}
        {dialog.kind === "props" && nodes[dialog.id] && <Props id={dialog.id} />}
        {dialog.kind === "restore" && (
          <div>
            <h2 className="text-base font-semibold">Restore the sample catalog?</h2>
            <p className="mt-2 text-sm text-muted">Puts the original folders back. Renames, new items, and notes saved in this browser are removed.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
              <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink" onClick={() => useFiles.getState().restoreSample()}>Restore</button>
            </div>
          </div>
        )}
        {dialog.kind === "preview" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (dialog.id) useFiles.getState().saveNote(dialog.id, text);
              else useFiles.getState().openDialog(null);
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="truncate text-base font-semibold">{dialog.title}</h2>
              <button type="button" aria-label="Close" onClick={() => useFiles.getState().openDialog(null)}><X className="size-4" /></button>
            </div>
            {dialog.id ? (
              <textarea value={text} onChange={(e) => setText(e.target.value)} className="mt-3 h-48 w-full border border-line bg-header p-3 text-sm outline-none" />
            ) : (
              <pre className="mt-3 max-h-64 overflow-auto border border-line bg-header p-3 text-sm whitespace-pre-wrap">{dialog.body}</pre>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Close</button>
              {dialog.id && <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">Save</button>}
            </div>
          </form>
        )}
        {dialog.kind === "help" && (
          <div>
            <h2 className="text-base font-semibold">Data Finder</h2>
            <p className="mt-2 text-sm text-muted">The full manual is on the Help tab.</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Close</button>
              <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink" onClick={() => { useFiles.getState().openDialog(null); useFiles.getState().setTab("resources"); }}>Open manual</button>
            </div>
          </div>
        )}
        {dialog.kind === "network" && <NetworkDialog location={dialog.location} />}
        {dialog.kind === "snaps" && <SnapshotWindow />}
        {dialog.kind === "earlier" && <EarlierDialog />}
        {dialog.kind === "snap-user" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void useFiles.getState().saveUserSnapshot(text.trim());
            }}
          >
            <h2 className="text-base font-semibold">Snapshot your folders?</h2>
            <p className="mt-2 text-sm text-muted">This copies Desktop, Documents, Downloads, Pictures, Music, and Videos. Choose where to store the copy. Leave it blank to keep it on this PC, or pick an external drive.</p>
            <label className="mt-3 block text-sm">
              Save to
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="E:\Snapshots" className="mt-1 h-11 w-full border border-line px-2" aria-label="Snapshot folder" />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
              <button type="button" className="min-h-11 px-3" onClick={() => void chooseFolder().then(setText).catch((error: unknown) => useFiles.setState({ status: error instanceof Error ? error.message : "No folder was chosen" }))}>Choose folder</button>
              <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">Copy them</button>
            </div>
          </form>
        )}
        {dialog.kind === "snap-dest" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void useFiles.getState().saveSnapshotTo(text.trim());
            }}
          >
            <h2 className="text-base font-semibold">Save snapshot</h2>
            <p className="mt-2 text-sm text-muted">Choose a folder for this copy. Leave it blank to keep it on this PC, or pick an external drive.</p>
            <label className="mt-3 block text-sm">
              Save to
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="E:\Snapshots" className="mt-1 h-11 w-full border border-line px-2" aria-label="Snapshot folder" />
            </label>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
              <button type="button" className="min-h-11 px-3" onClick={() => void chooseFolder().then(setText).catch((error: unknown) => useFiles.setState({ status: error instanceof Error ? error.message : "No folder was chosen" }))}>Choose folder</button>
              <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">Save</button>
            </div>
          </form>
        )}
        {dialog.kind === "compare" && nodes[dialog.leftId] && nodes[dialog.rightId] && (
          <ComparePane leftId={dialog.leftId} rightId={dialog.rightId} />
        )}
        {dialog.kind === "counter" && <ValueCounter />}
        {dialog.kind === "goto" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void useFiles.getState().openTypedPath(text);
            }}
          >
            <h2 className="text-base font-semibold">Jump to path</h2>
            <p className="mt-1 text-sm text-muted">Type a path such as C:\Users. On a real disk, folders along the way are read as needed.</p>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="mt-3 h-11 w-full border border-line px-2 text-sm outline-none" aria-label="Path" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
              <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">Go</button>
            </div>
          </form>
        )}
        {dialog.kind === "custom" && <CustomFilter text={text} setText={setText} />}
        {dialog.kind === "collision" && <CollisionDialog ids={dialog.ids} dest={dialog.dest} mode={dialog.mode} names={dialog.names} />}
        {dialog.kind === "search" && <SearchDialog />}
        {dialog.kind === "operation" && <OperationDialog />}
        {dialog.kind === "mask" && <MaskDialog />}
      </div>
    </div>
  );
}

function MaskDialog() {
  const [text, setText] = useState("*.sys");
  const apply = (pattern: string) => useFiles.getState().selectMask(pattern);
  const presets = ["*.sys", "*.dll", "*.exe", "*.txt", ">100MB", ">1GB"];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply(text);
      }}
    >
      <h2 className="text-base font-semibold">Pick by pattern</h2>
      <p className="mt-1 text-sm text-muted">Selects matching rows in the current folder. Everything else stays on screen.</p>
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="mt-3 h-11 w-full border border-line px-2 text-sm outline-none"
        aria-label="Selection pattern"
        placeholder="*.dll or >100MB"
      />
      <div className="mt-2 flex flex-wrap gap-1">
        {presets.map((preset) => (
          <button key={preset} type="button" className="min-h-11 border border-line px-2 text-sm hover:bg-select" onClick={() => apply(preset)}>
            {preset}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Separate patterns with a space. With no unit, the number is megabytes, so over 100 means over 100 MB.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
        <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">Select</button>
      </div>
    </form>
  );
}

function ValueCounter() {
  const state = useFiles();
  const view = listing(state, state.active);
  const column = state.filters.findColumn;
  const counts = new Map<string, number>();
  for (const row of view.rows) {
    const key = column === "size"
      ? formatSize(row.bytes) || "(blank)"
      : column === "type"
        ? typeLabel({ kind: row.kind, name: row.name } as FsNode)
        : column === "date"
          ? formatWhen(row.modified, state.dateFormat, state.timeFormat)
          : row.name;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return (
    <div>
      <h2 className="text-base font-semibold">Add up values</h2>
      <p className="mt-1 text-sm text-muted">{column} · {view.rows.length} visible items · {ranked.length} distinct</p>
      <ul className="mt-3 max-h-64 overflow-auto border border-line">
        {ranked.map(([value, count]) => (
          <li key={value} className="flex items-center justify-between gap-3 border-t border-line px-2 py-1 text-sm first:border-t-0">
            <span className="min-w-0 truncate">{value}</span>
            <span className="shrink-0 tabular-nums">{count}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink" onClick={() => useFiles.getState().openDialog(null)}>Close</button>
      </div>
    </div>
  );
}

function CustomFilter({ text, setText }: { text: string; setText: (value: string) => void }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const raw = text.trim();
        const lower = raw.toLowerCase();
        const apply = useFiles.getState().setFilters;
        if (!raw) return;
        if (lower.startsWith("ext:")) apply({ ext: lower.slice(4).replace(/^\./, ""), kind: "file", group: "" });
        else if (lower.startsWith("hide:") || lower.startsWith("exclude:")) apply({ exclude: lower.slice(lower.indexOf(":") + 1) });
        else if (lower.startsWith("min:")) {
          const amount = Number(lower.replace(/[^\d.]/g, "")) || 0;
          const bytes = lower.includes("gb") ? amount * 1024 * MB : amount * MB;
          apply({ minBytes: bytes, kind: "file" });
        } else useFiles.getState().setQuery(useFiles.getState().active, raw);
        useFiles.getState().openDialog(null);
      }}
    >
      <h2 className="text-base font-semibold">Name rule</h2>
      <p className="mt-1 text-sm text-muted">A name, or ext:pdf, hide:.tmp, min:100mb.</p>
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} className="mt-3 h-11 w-full border border-line px-2 text-sm outline-none" aria-label="Name rule" />
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
        <button type="submit" className="min-h-11 bg-accent px-3 text-accent-ink">Apply</button>
      </div>
    </form>
  );
}

function markLines(lines: string[], other: string[]) {
  const counts = new Map<string, number>();
  for (const line of other) counts.set(line, (counts.get(line) ?? 0) + 1);
  return lines.map((line) => {
    const left = counts.get(line) ?? 0;
    if (left > 0) {
      counts.set(line, left - 1);
      return { line, same: true };
    }
    return { line, same: false };
  });
}

function itemLines(node: FsNode, names: string[]): string[] {
  if (node.note) return node.note.split(/\r?\n/);
  if (node.kind !== "file") return names.length ? names : ["(empty folder)"];
  return [
    formatSize(node.bytes) || "Not measured",
    formatDate(node.modified),
    [node.hidden && "Hidden", node.readonly && "Read-only", node.system && "System"].filter(Boolean).join(", ") || "Normal",
  ];
}

function ComparePane({ leftId, rightId }: { leftId: string; rightId: string }) {
  const nodes = useFiles((s) => s.nodes);
  const order = useFiles((s) => s.order);
  const left = nodes[leftId];
  const right = nodes[rightId];
  if (!left || !right) return null;
  const names = (id: string) => (order[id] ?? []).map((child) => nodes[child]?.name).filter((name): name is string => Boolean(name));
  const leftRows = markLines(itemLines(left, names(leftId)), itemLines(right, names(rightId)));
  const rightRows = markLines(itemLines(right, names(rightId)), itemLines(left, names(leftId)));
  const differ = leftRows.some((row) => !row.same) || rightRows.some((row) => !row.same);
  return (
    <div>
      <h2 className="text-base font-semibold">Line up</h2>
      <p className="mt-1 text-sm text-muted">{differ ? "Lines that differ are highlighted." : "These two match."}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          [displayPath({ nodes, order }, leftId), leftRows],
          [displayPath({ nodes, order }, rightId), rightRows],
        ].map(([title, rows]) => (
          <div key={String(title)} className="min-w-0">
            <p className="truncate text-xs text-muted">{title as string}</p>
            <ul className="mt-1 max-h-64 overflow-auto border border-line bg-header p-2 text-sm">
              {(rows as Array<{ line: string; same: boolean }>).map((row, i) => (
                <li key={`${row.line}-${i}`} className={row.same ? "" : "bg-diff"}>{row.line || " "}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink" onClick={() => useFiles.getState().openDialog(null)}>Close</button>
      </div>
    </div>
  );
}

function Props({ id }: { id: string }) {
  const node = useFiles((s) => s.nodes[id]);
  const nodes = useFiles((s) => s.nodes);
  const order = useFiles((s) => s.order);
  const [exact, setExact] = useState<ExactSize | null>(null);
  const [measuring, setMeasuring] = useState(false);
  useEffect(() => {
    const path = diskPath(id);
    if (!path || !isDesktop()) return;
    let live = true;
    setMeasuring(true);
    setExact(null);
    void measurePath(path).then((result) => {
      if (!live) return;
      setExact(result);
      useFiles.setState((state) => {
        const current = state.nodes[id];
        if (!current) return {};
        return {
          nodes: {
            ...state.nodes,
            [id]: {
              ...current,
              bytes: result.blocked && result.bytes === 0 ? null : result.bytes,
              approx: !result.exact,
              blocked: result.blocked && result.bytes === 0,
            },
          },
        };
      });
    }).catch(() => {
      if (live) setExact(null);
    }).finally(() => {
      if (live) setMeasuring(false);
    });
    return () => { live = false; };
  }, [id]);
  if (!node) return null;
  const snap = { nodes, order };
  const kids = node.kind === "file" ? 0 : childrenOf(snap, id).length;
  const sizeText = exact
    ? exact.blocked && exact.bytes === 0
      ? "No access"
      : `${exact.bytes.toLocaleString()} bytes (${formatSize(exact.bytes) || "0 B"})`
    : shownSize(node.bytes, node.approx, node.blocked) || "Not measured";
  const rows: Array<[string, string]> = [
    ["Name", node.kind === "drive" ? driveCaption(node) : node.name],
    ["Type", typeLabel(node)],
    ["Location", displayPath(snap, id)],
    ["Size", measuring ? "Measuring the exact size…" : sizeText],
    ["Exact", exact ? (exact.exact ? "Yes" : exact.blocked ? "No — this item could not be read" : "No — some items inside could not be read") : measuring ? "Measuring" : "Not measured yet"],
    ["Contains", exact && node.kind !== "file" ? `${exact.files.toLocaleString()} files, ${exact.folders.toLocaleString()} folders` : node.kind === "file" ? "—" : `${kids} direct items`],
    ["Mounted", node.kind === "drive" ? (node.mounted === false ? "Not mounted" : "Mounted") : "—"],
    ["Modified", formatDate(node.modified)],
    ["Flags", [node.hidden && "Hidden", node.readonly && "Read-only", node.system && "System", node.blocked && "No access"].filter(Boolean).join(", ") || "Normal"],
  ];
  return (
    <div>
      <h2 className="text-base font-semibold">Info</h2>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([key, value]) => (
          <div key={key} className="grid grid-cols-3 gap-2">
            <dt className="text-muted">{key}</dt>
            <dd className="col-span-2 break-all">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex justify-end">
        <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink" onClick={() => useFiles.getState().openDialog(null)}>Close</button>
      </div>
    </div>
  );
}

function FormatDialog({ id }: { id: string }) {
  const node = useFiles((s) => s.nodes[id]);
  const [filesystem, setFilesystem] = useState("NTFS");
  const [label, setLabel] = useState(node?.label || node?.note || "");
  if (!node || node.system) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void useFiles.getState().formatDrive(id, filesystem, label);
      }}
    >
      <h2 className="text-base font-semibold">Format {driveCaption(node)}?</h2>
      <p className="mt-2 text-sm text-muted">Everything on this drive is erased. The Windows drive cannot be formatted.</p>
      <label className="mt-3 block text-sm">
        File system
        <select value={filesystem} onChange={(e) => setFilesystem(e.target.value)} className="mt-1 h-11 w-full border border-line bg-pane px-2">
          <option value="NTFS">NTFS</option>
          <option value="exFAT">exFAT</option>
          <option value="FAT32">FAT32</option>
        </select>
      </label>
      <label className="mt-3 block text-sm">
        Drive name
        <input value={label} onChange={(e) => setLabel(e.target.value)} className="mt-1 h-11 w-full border border-line px-2 outline-none" aria-label="Drive name" />
      </label>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="min-h-11 px-3" onClick={() => useFiles.getState().openDialog(null)}>Cancel</button>
        <button type="submit" className="min-h-11 bg-danger px-3 text-accent-ink">Erase and format</button>
      </div>
    </form>
  );
}

function isPinned(id: string) {
  const state = useFiles.getState();
  const node = state.nodes[id];
  const path = diskPath(id) || (node && node.kind !== "file" ? displayPath(state, id) : "");
  if (!path) return state.favorites.includes(id);
  return state.pins.some((item) => item.toLowerCase() === path.toLowerCase());
}

function pinNode(id: string) {
  const state = useFiles.getState();
  const node = state.nodes[id];
  const path = diskPath(id) || (node && node.kind !== "file" && node.kind !== "computer" && /^[A-Za-z]:\\/.test(displayPath(state, id)) ? displayPath(state, id) : "");
  if (!path) {
    state.toggleFavorite(id);
    state.openMenu(null);
    return;
  }
  const has = state.pins.some((item) => item.toLowerCase() === path.toLowerCase());
  useFiles.setState({
    pins: has ? state.pins.filter((item) => item.toLowerCase() !== path.toLowerCase()) : [...state.pins, path],
    menu: null,
    status: has ? "Unpinned" : "Pinned",
  });
}

function ContextMenu() {
  const menu = useFiles((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const pad = 8;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width || 220;
    const height = rect.height || 320;
    const left = Math.max(pad, Math.min(menu.x, window.innerWidth - width - pad));
    const top = Math.max(pad, Math.min(menu.y, window.innerHeight - Math.min(height, window.innerHeight - pad * 2) - pad));
    setBox({ left, top, maxHeight: window.innerHeight - top - pad });
  }, [menu]);
  if (!menu) return null;
  const id = menu.id;
  const state = useFiles.getState();
  const node = id ? state.nodes[id] : undefined;
  const active = state.active;
  const selected = state.panes[active].selected;
  const createIn = node && node.kind !== "file" ? node.id : state.panes[active].pathId;
  const canDelete = !!node && node.kind !== "drive" && node.kind !== "computer";
  const item = (label: string, fn: () => void, icon?: ReactNode, danger?: boolean) => (
    <button
      type="button"
      className={"flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-select " + (danger ? "text-danger" : "")}
      onClick={() => {
        fn();
        useFiles.getState().openMenu(null);
      }}
    >
      <span className="grid size-4 shrink-0 place-items-center text-muted">{icon}</span>
      <span>{label}</span>
    </button>
  );
  const rule = <div className="my-1 h-px bg-line" />;
  const place = box ?? {
    left: Math.max(8, Math.min(menu.x, (typeof window === "undefined" ? 800 : window.innerWidth) - 232)),
    top: Math.max(8, menu.y),
    maxHeight: 480,
  };
  return (
    <>
      <button type="button" aria-label="Close menu" className="fixed inset-0 z-30" onMouseDown={(e) => { if (e.button === 0) useFiles.getState().openMenu(null); }} onContextMenu={(e) => e.preventDefault()} />
      <div ref={ref} className="fixed z-40 w-56 overflow-auto rounded-lg border border-line bg-menu p-1 shadow-xl" style={{ left: place.left, top: place.top, maxHeight: place.maxHeight }}>
        {id && item("Open", () => state.openItem(active, id), <Folder className="size-4" />)}
        {id && node && node.kind !== "file" && item("Open in new tab", () => state.openTab(active, id), <FolderPlus className="size-4" />)}
        {id && node?.kind !== "drive" && item("Show in folder", () => state.reveal(active, id), <Folder className="size-4" />)}
        {rule}
        {item("Cut", () => state.cut(), <Scissors className="size-4" />)}
        {item("Copy", () => state.copy(), <Copy className="size-4" />)}
        {item("Paste", () => state.paste(), <ClipboardPaste className="size-4" />)}
        {rule}
        {node && item("Rename", () => state.openDialog({ kind: "rename", id: node.id, name: node.name }), <Pencil className="size-4" />)}
        {canDelete && item("Delete", () => state.openDialog({ kind: "delete", ids: selected.length ? selected : [id!] }), <Trash2 className="size-4" />, true)}
        {rule}
        {item("New folder", () => state.openDialog({ kind: "new", file: false, parentId: createIn }), <FolderPlus className="size-4" />)}
        {item("New file", () => state.openDialog({ kind: "new", file: true, parentId: createIn }), <FilePlus className="size-4" />)}
        {rule}
        {item("Copy location", () => void state.copyPath(id ?? state.panes[active].pathId), <Link className="size-4" />)}
        {id && item("Info", () => state.openDialog({ kind: "props", id }), <FileText className="size-4" />)}
        {node && item("Read note", () => state.openReader(node.id), <FileText className="size-4" />)}
        {node && node.kind !== "file" && item(isPinned(node.id) ? "Unpin" : "Pin", () => pinNode(node.id), <Star className="size-4" />)}
        {node?.kind === "file" && node.name.toLowerCase().endsWith(".iso") && item("Mount image", () => void state.mountImage(node.id), <HardDrive className="size-4" />)}
        {node?.kind === "drive" && node.mounted === false && !node.name.endsWith(":") && item("Mount", () => {
          const path = diskPath(node.id);
          if (!path) return;
          void mountVolume(path).then(() => state.reloadDrives()).catch((error: unknown) => state.openDialog({ kind: "preview", title: "Mount", body: error instanceof Error ? error.message : "Could not mount that drive" }));
        }, <HardDrive className="size-4" />)}
        {node?.kind === "drive" && node.note === "Network Drive" && item("Disconnect", () => state.openDialog({ kind: "unmount", id: node.id }), <Unplug className="size-4" />)}
        {node?.kind === "drive" && !node.system && node.mounted !== false && node.note !== "Network Drive" && item("Unmount", () => state.openDialog({ kind: "unmount", id: node.id }), <Unplug className="size-4" />)}
        {node?.kind === "drive" && !node.system && node.mounted !== false && node.name.endsWith(":") && item("Format", () => state.openDialog({ kind: "format", id: node.id }), <Trash2 className="size-4" />)}
        {item("Refresh", () => state.refresh(), <RefreshCw className="size-4" />)}
        {item("Save snapshot", () => state.takeSnapshot(), <History className="size-4" />)}
        {item("Keeps", () => state.setTab("keeps"), <History className="size-4" />)}
      </div>
    </>
  );
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function Transfers() {
  const open = useFiles((s) => s.transfersOpen);
  const items = useFiles((s) => s.transfers);
  const selectedId = useFiles((s) => s.transferSel);
  if (!open) return null;
  const selected = items.find((item) => item.id === selectedId) ?? items[items.length - 1];
  const store = useFiles.getState;
  const tool = (label: string, fn: () => void, disabled?: boolean) => (
    <button type="button" disabled={disabled} onClick={fn} className="min-h-9 px-2 text-xs hover:bg-select disabled:opacity-40">{label}</button>
  );
  return (
    <section className="max-h-64 shrink-0 overflow-auto border-t border-line bg-pane">
      <div className="sticky top-0 flex flex-wrap items-center gap-1 border-b border-line bg-ribbon px-2 py-1">
        <strong className="mr-2 text-xs">Queue</strong>
        {tool("Back", () => store().toggleTransfers())}
        {tool("Abort", () => store().abortTransfer(selected?.id), !selected || selected.done)}
        {tool(selected?.status === "Paused" ? "Resume" : "Pause", () => store().pauseTransfer(selected?.id), !selected || (selected.status !== "Running" && selected.status !== "Paused"))}
        {tool("Repeat", () => store().repeatTransfer(selected?.id), !selected)}
        {tool("Ignore", () => store().ignoreTransfer(selected?.id), !selected || selected.status === "Succeeded")}
        {tool("From", () => selected && store().jumpTransfer("source", selected.id), !selected)}
        {tool("To", () => selected && store().jumpTransfer("dest", selected.id), !selected)}
        {tool("Activity", () => store().toggleLog())}
      </div>
      {items.length === 0 && <p className="px-3 py-2 text-xs text-muted">Copy, move, or bring back to queue a write. The catalog updates immediately; the bar is the record of that write.</p>}
      {items.length > 0 && (
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead className="bg-header text-muted">
            <tr>
              {["#", "Action", "From", "To", "Avg speed", "Size", "Status", "%", "Elapsed"].map((label) => (
                <th key={label} className="px-2 py-1 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...items].reverse().map((item) => (
              <tr key={item.id} className={"cursor-pointer border-t border-line " + (selected?.id === item.id ? "bg-select" : "hover:bg-header")} onClick={() => store().selectTransfer(item.id)}>
                <td className="px-2 py-1 tabular-nums">{item.n}</td>
                <td className="px-2 py-1">{item.op}</td>
                <td className="max-w-40 truncate px-2 py-1">{item.source}</td>
                <td className="max-w-40 truncate px-2 py-1">{item.destination}</td>
                <td className="px-2 py-1 whitespace-nowrap">{item.speed ? `${formatSize(item.speed)}/s` : "—"}</td>
                <td className="px-2 py-1 whitespace-nowrap">{item.done ? formatSize(item.bytes) : `${formatSize(Math.round(item.bytes * item.progress / 100))} / ${formatSize(item.bytes)}`}</td>
                <td className="px-2 py-1">{item.status}</td>
                <td className="px-2 py-1 tabular-nums">{item.progress.toFixed(0)}%</td>
                <td className="px-2 py-1 tabular-nums">{formatElapsed(item.elapsed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selected && (
        <dl className="grid grid-cols-[9rem_1fr] gap-x-3 border-t border-line px-3 py-2 text-xs">
          <dt className="text-muted">From</dt><dd className="truncate">{selected.source}</dd>
          <dt className="text-muted">To</dt><dd className="truncate">{selected.destination}</dd>
          <dt className="text-muted">Action</dt><dd>{selected.op}</dd>
          <dt className="text-muted">Name clash</dt><dd>{selected.policy}</dd>
          <dt className="text-muted">Keep flags</dt><dd>Yes</dd>
          <dt className="text-muted">Keep dates</dt><dd>Yes</dd>
          <dt className="text-muted">Keep permissions</dt><dd>No — this catalog has no access lists</dd>
        </dl>
      )}
    </section>
  );
}

function LogDrawer() {
  const open = useFiles((s) => s.logOpen);
  const log = useFiles((s) => s.log);
  if (!open) return null;
  return (
    <aside className="max-h-36 shrink-0 overflow-auto border-t border-line bg-pane px-3 py-2 text-xs">
      <div className="mb-1 flex items-center justify-between">
        <strong>Activity</strong>
        <button type="button" aria-label="Close log" onClick={() => useFiles.getState().toggleLog()}><X className="size-3.5" /></button>
      </div>
      {[...log].reverse().slice(0, 40).map((line, i) => (
        <div key={`${line}-${i}`} className="text-muted">{line}</div>
      ))}
    </aside>
  );
}

function StatusBar() {
  const status = useFiles((s) => s.status);
  const clip = useFiles((s) => s.clipboard);
  const active = useFiles((s) => s.active);
  const selected = useFiles((s) => s.panes[active].selected);
  const nodes = useFiles((s) => s.nodes);
  const known = selected.every((id) => nodes[id]?.bytes != null);
  const bytes = selected.reduce((sum, id) => sum + (nodes[id]?.bytes ?? 0), 0);
  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-t border-line bg-status px-3 text-xs text-muted">
      <span className="min-w-0 flex-1 truncate">{status}</span>
      {selected.length > 0 && (
        <span className="shrink-0">{selected.length} selected{known ? ` · ${formatSize(bytes)}` : ""}</span>
      )}
      {clip && <span className="shrink-0 text-muted">{clip.mode === "cut" ? "Cut" : "Copied"} {clip.ids.length}</span>}
    </div>
  );
}

function NotePane({ id }: { id: string }) {
  const node = useFiles((s) => s.nodes[id]);
  const order = useFiles((s) => s.order);
  const nodes = useFiles((s) => s.nodes);
  const [text, setText] = useState(node?.note ?? "");
  const textRef = useRef(text);
  textRef.current = text;
  useEffect(() => {
    setText(useFiles.getState().nodes[id]?.note ?? "");
    return () => {
      const current = useFiles.getState().nodes[id];
      if (current && (current.note ?? "") !== textRef.current) useFiles.getState().saveNote(id, textRef.current);
    };
  }, [id]);
  if (!node) return null;
  const place = displayPath({ nodes, order }, id);
  return (
    <aside className="absolute inset-0 z-20 flex min-h-0 flex-col border-l border-line bg-pane sm:static sm:w-[28rem] sm:shrink-0">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{node.name}</div>
          <div className="truncate text-xs text-muted" title={place}>{place}</div>
        </div>
        <button type="button" aria-label="Close note" title="Close" className="grid size-11 place-items-center hover:bg-select" onClick={() => useFiles.getState().openReader(null)}>
          <X className="size-4" />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a note"
        className="min-h-0 flex-1 resize-none bg-pane p-3 text-sm leading-6 outline-none"
        aria-label={`Note for ${node.name}`}
        onBlur={() => {
          const current = useFiles.getState().nodes[id];
          if (current && (current.note ?? "") !== text) useFiles.getState().saveNote(id, text);
        }}
      />
    </aside>
  );
}

function driveWords(drive: BitLockerDrive) {
  if (drive.lock === "Locked") return "Locked";
  if (drive.state === "DecryptionInProgress") return `Decrypting · ${drive.percent}%`;
  if (drive.state === "EncryptionInProgress") return `Encrypting · ${drive.percent}%`;
  if (drive.state === "DecryptionPaused" || drive.state === "EncryptionPaused" || drive.state === "Paused") return `Paused · ${drive.percent}% encrypted`;
  if (drive.state === "FullyEncrypted" || drive.protection === "On" || drive.percent > 0) return "Encrypted, and you can open it";
  if (drive.state === "Unknown") return "Encryption was not read";
  return "Not encrypted";
}

function stillEncrypted(drive: BitLockerDrive) {
  return drive.lock === "Locked" || drive.protection === "On" || drive.percent > 0 || drive.state === "FullyEncrypted" || drive.state.includes("Progress") || drive.state.includes("Paused");
}

function DecryptionRibbon() {
  return (
    <div className="flex items-center px-3 py-2 text-sm text-muted">
      A locked drive shows its Key ID. Unlock it with the key that matches that ID.
    </div>
  );
}

type KeyPlace = "personal" | "school" | "work" | "ad" | "intune" | "gone";

const KEY_PLACES: Array<{ id: KeyPlace; label: string; steps: string[]; links?: Array<{ label: string; href: string }> }> = [
  {
    id: "personal",
    label: "Personal",
    steps: [
      "Sign in with the Microsoft account that was used on that PC. The recovery keys for that account are listed there. Match the Key ID from the blue screen. A key for a different drive will not work.",
      "Look for a printed page, a USB stick, or a file named BitLocker Recovery Key. Check Documents, email, OneDrive, and any second drive.",
      "If you can already open the drive, such as C: after you sign in, Read the key asks Windows for the recovery password it stored.",
    ],
    links: [{ label: "Microsoft account recovery keys", href: "https://account.microsoft.com/devices/recoverykey" }],
  },
  {
    id: "school",
    label: "School",
    steps: [
      "A school PC is managed by the school. The recovery key is held by school IT, not by a personal Microsoft account.",
      "Contact the school help desk. Give them the computer name and the Key ID from the blue BitLocker screen.",
      "If the school uses Microsoft 365 or Intune, only a school admin can open the key. A student account usually cannot.",
      "Do not format the drive. The school can unlock it. Formatting erases the files and does not bring them back.",
    ],
  },
  {
    id: "work",
    label: "Work",
    steps: [
      "Ask the company help desk, or the person who set up the PC. Give them the Key ID from the blue screen.",
      "A work account does not list the key on the personal Microsoft account page. That page is only for a personal Microsoft account.",
      "If you administer the company tenant, open the Entra admin center, then Devices, then that PC, then BitLocker keys. You can also search BitLocker keys by the Key ID.",
      "If you can sign in and open the drive, Read the key asks Windows for the recovery password already on it.",
    ],
    links: [{ label: "Microsoft Entra admin center", href: "https://entra.microsoft.com" }],
  },
  {
    id: "ad",
    label: "Active Directory",
    steps: [
      "On a domain PC, Group Policy can store the recovery password on the computer object in Active Directory.",
      "On a PC with the Active Directory tools, open Active Directory Users and Computers, find that computer, and open the BitLocker Recovery tab. Match the Key ID.",
      "A domain admin can also read msFVE-RecoveryPassword from the recovery objects under that computer.",
      "If that tab is empty, the domain never stored a key. Ask whoever turned BitLocker on. The TPM unlocks the drive at sign-in. It is not a key you can type on the blue screen.",
    ],
  },
  {
    id: "intune",
    label: "Intune",
    steps: [
      "In the Intune admin center, open Devices, then the Windows device, then Recovery keys. The same key is often under that device in Entra ID.",
      "Intune only has the key if the disk encryption policy saves recovery information to Entra ID.",
      "A normal user does not see this page. An Intune admin does. Search by the Key ID from the blue screen.",
      "Self-service is off unless an admin turned it on. If you are not the admin, the organization has to read the key for you.",
    ],
    links: [
      { label: "Intune admin center", href: "https://intune.microsoft.com" },
      { label: "Entra admin center", href: "https://entra.microsoft.com" },
    ],
  },
  {
    id: "gone",
    label: "No key at all",
    steps: [
      "Write down the Key ID before you do anything else. That is how a key found later is matched to this drive.",
      "Check each place once: the personal Microsoft account, a printed page, a USB stick, email, another PC on the same account, school or work help desk, Active Directory, and Intune.",
      "If a copy of the files exists somewhere else, use that copy. OneDrive, a backup, a Keeps snapshot, or another computer is a copy. It is not inside the locked drive.",
      "If the drive is locked and every key is gone, the files on it cannot be opened. Data Finder does not guess a missing key.",
      "Formatting makes an empty drive. It does not recover the old files. Do not format if you still want those files.",
    ],
  },
];

function keyIdList(raw: string) {
  return raw.split(",").map((item) => item.trim().toUpperCase()).filter((item) => /^[0-9A-F]{8}$/.test(item));
}

function KeyIdRow({ ids, onElevate }: { ids: string; onElevate?: () => void }) {
  const list = keyIdList(ids);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = list.join(", ");
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    };
    void navigator.clipboard.writeText(text).then(done).catch(() => {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      done();
    });
  };
  if (list.length === 0) {
    return (
      <div className="mt-3">
        <p className="text-sm">Windows did not show a recovery key ID. Read the eight characters on the blue BitLocker screen, or give Windows permission and look again.</p>
        {onElevate && <button type="button" className="mt-2 min-h-11 border border-line px-3 text-sm" onClick={onElevate}>Give Windows permission</button>}
      </div>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-sm">Key ID. This is the eight characters on the blue BitLocker screen. The recovery key has to match it.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {list.map((id) => <span key={id} className="border border-line bg-pane px-2 py-2 font-mono text-sm">{id}</span>)}
        <button type="button" className="min-h-11 border border-line px-3 text-sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </div>
  );
}

function presentReadKeys(raw: string) {
  return raw
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.lastIndexOf(" ");
      const pass = space >= 0 ? line.slice(space + 1) : line;
      const id = space >= 0 ? line.slice(0, space).replace(/[{}]/g, "") : "";
      const short = id.replace(/-/g, "").slice(0, 8).toUpperCase();
      return short ? `Key ID ${short}\n${pass}` : pass;
    })
    .join("\n\n");
}

function KeyGuide() {
  const [place, setPlace] = useState<KeyPlace>("personal");
  const current = KEY_PLACES.find((item) => item.id === place) ?? KEY_PLACES[0];
  return (
    <section className="mt-6 max-w-3xl border border-line p-3">
      <h3 className="text-sm font-semibold">Where to find the key</h3>
      <p className="mt-1 text-sm text-muted">A recovery key is 48 digits. The blue BitLocker screen also shows a Key ID, eight characters. The key you use has to match that ID.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Where the key might be">
        {KEY_PLACES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={place === item.id}
            className={`min-h-11 border px-3 text-sm ${place === item.id ? "border-accent bg-accent text-accent-ink" : "border-line"}`}
            onClick={() => setPlace(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        {current.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      {current.links && (
        <div className="mt-3 flex flex-wrap gap-3">
          {current.links.map((link) => (
            <button key={link.href} type="button" className="min-h-11 text-sm text-accent underline" onClick={() => void openExternal(link.href)}>
              {link.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function DecryptionPage() {
  const [rows, setRows] = useState<BitLockerDrive[] | null>(null);
  const [letter, setLetter] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"recovery" | "password" | "bek">("recovery");
  const [secret, setSecret] = useState("");
  const [key, setKey] = useState("");
  const [keyDrive, setKeyDrive] = useState("");
  const [asked, setAsked] = useState(false);
  const [checking, setChecking] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const loadGen = useRef(0);
  useEffect(() => {
    if (!isDesktop()) return;
    let stop = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/event").then(({ listen }) => {
      if (stop) return;
      void listen<{ done: number; total: number; label: string }>("bitlocker-progress", (event) => {
        setProgress(event.payload);
      }).then((fn) => {
        if (stop) fn();
        else unlisten = fn;
      });
    });
    return () => {
      stop = true;
      unlisten?.();
    };
  }, []);
  const load = (elevate: boolean) => {
    const ticket = loadGen.current + 1;
    loadGen.current = ticket;
    const text = elevate ? "Scanning for drives. Windows may ask for permission." : "Scanning for drives…";
    setChecking(text);
    setProgress({ done: 4, total: 100, label: "Listing drives" });
    if (useFiles.getState().tab === "decrypt") useFiles.setState({ status: text });
    void bitlockerStatus(elevate).then((items) => {
      if (ticket !== loadGen.current) return;
      setRows(items);
      setError("");
      setLetter((current) => current && items.some((item) => item.letter === current) ? current : items[0]?.letter ?? "");
      if (useFiles.getState().tab === "decrypt") {
        useFiles.setState({ status: items.length === 0 ? "No drive was found" : `Scan finished · ${items.length} drive${items.length === 1 ? "" : "s"}` });
      }
    }).catch((cause: unknown) => {
      if (ticket !== loadGen.current) return;
      const message = cause instanceof Error ? cause.message : "Could not read BitLocker";
      setError(message);
      setRows((current) => current ?? []);
      if (useFiles.getState().tab === "decrypt") useFiles.setState({ status: message });
    }).finally(() => {
      if (ticket === loadGen.current) {
        setChecking("");
        setProgress(null);
      }
    });
  };
  const current = rows?.find((item) => item.letter === letter) ?? null;
  const locked = current?.lock === "Locked";
  const encrypted = current ? stillEncrypted(current) : false;
  const run = (work: Promise<string>, after?: (message: string) => void) => {
    setBusy(true);
    setNote("");
    void work
      .then((message) => {
        if (after) after(message);
        else setNote(message);
        load(false);
      })
      .catch((cause: unknown) => setNote(cause instanceof Error ? cause.message : "Windows could not finish that"))
      .finally(() => setBusy(false));
  };
  if (!isDesktop()) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
        <h2 className="text-lg font-semibold">Decryption</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">Unlock, decrypt, and turn BitLocker on run in the Windows program. Scan for drives there. A locked drive shows its Key ID. The example below is the eight characters you match to a recovery key.</p>
        <div className="mt-4 max-w-xl border border-line p-3">
          <p className="text-sm font-semibold">Example</p>
          <p className="mt-1 text-sm">This drive is locked. Enter the key that belongs to it.</p>
          <KeyIdRow ids="A1B2C3D4" />
        </div>
        <KeyGuide />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <h2 className="text-lg font-semibold">Decryption</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted">Scan looks for every local drive, including a locked BitLocker drive. It does not run when you open this tab. A locked drive opens when you enter its recovery key, password, or key file. Data Finder does not guess that key. If Windows already unlocked the drive, Decrypt removes BitLocker and leaves the files in place.</p>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {checking && (
        <div className="mt-3 max-w-xl" role="status" aria-live="polite">
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <RefreshCw className="size-4 animate-spin" />
              {progress?.label || checking}
            </span>
            <span className="tabular-nums text-muted">{Math.min(100, Math.round(((progress?.done ?? 0) / (progress?.total || 100)) * 100))}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bar-track" aria-hidden="true">
            <div className="h-full rounded-full bg-bar transition-[width] duration-300" style={{ width: `${Math.min(100, Math.round(((progress?.done ?? 0) / (progress?.total || 100)) * 100))}%` }} />
          </div>
        </div>
      )}
      {error && !asked && <button type="button" className="mt-2 min-h-11 self-start border border-line px-3 text-sm" onClick={() => { setAsked(true); load(true); }}>Give Windows permission</button>}
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {rows && rows.length > 0 && (
          <label className="text-sm">
            <span className="mb-1 block text-muted">Drive</span>
            <select value={letter} onChange={(e) => { setLetter(e.target.value); setKey(""); setNote(""); }} aria-label="BitLocker drive" className="h-9 min-w-24 rounded-md border border-line bg-pane px-2">
              {rows.map((item) => <option key={item.letter} value={item.letter}>{item.letter}:</option>)}
            </select>
          </label>
        )}
        <button type="button" className="h-9 rounded-md bg-accent px-3 text-sm text-accent-ink disabled:opacity-40" disabled={!!checking} onClick={() => load(false)}>{checking ? "Scanning…" : rows === null ? "Scan for drives" : "Scan again"}</button>
        {current && <p className="pb-1 text-sm">{driveWords(current)}{current.volume ? ` · ${current.volume}` : ""}</p>}
      </div>
      {rows && rows.length > 0 && (
        <ul className="mt-3 max-w-xl">
          {rows.map((item) => (
            <li key={item.letter}>
              <button type="button" className={"flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm " + (item.letter === letter ? "bg-select" : "hover:bg-header")} onClick={() => { setLetter(item.letter); setKey(""); setNote(""); }}>
                <span className="w-8 font-semibold">{item.letter}:</span>
                <span>{driveWords(item)}{item.volume ? ` · ${item.volume}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rows === null && !error && !checking && <p className="mt-4 text-sm text-muted">Nothing is scanned yet. Scan for drives when you want the list.</p>}
      {rows?.length === 0 && !error && <p className="mt-4 text-sm text-muted">No local drive was found. Scan again after you plug the drive in.</p>}
      {current && locked && (
        <form className="mt-4 max-w-xl" onSubmit={(e) => { e.preventDefault(); run(bitlockerUnlock(current.letter, mode, secret)); }}>
          <p className="text-sm">This drive is locked. Enter the key that belongs to it.</p>
          <KeyIdRow ids={current.keyIds} onElevate={() => { setAsked(true); load(true); }} />
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" name="key-kind" checked={mode === "recovery"} onChange={() => setMode("recovery")} />Recovery key</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="key-kind" checked={mode === "password"} onChange={() => setMode("password")} />Password</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="key-kind" checked={mode === "bek"} onChange={() => setMode("bek")} />Key file</label>
          </div>
          {mode === "bek" ? (
            <div className="mt-3 flex gap-2">
              <input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="D:\key.bek" aria-label="Key file" className="h-11 min-w-0 flex-1 border border-line px-2 text-sm" />
              <button type="button" className="min-h-11 border border-line px-3 text-sm" onClick={() => void chooseKeyFile().then(setSecret).catch((cause: unknown) => setNote(cause instanceof Error ? cause.message : "No key file was chosen"))}>Choose file</button>
            </div>
          ) : (
            <input value={secret} onChange={(e) => setSecret(e.target.value)} type={mode === "password" ? "password" : "text"} placeholder={mode === "recovery" ? "000000-000000-000000-000000-000000-000000-000000-000000" : "Password"} aria-label={mode === "recovery" ? "Recovery key" : "Password"} className="mt-3 h-11 w-full border border-line px-2 text-sm" />
          )}
          <button type="submit" className="mt-3 min-h-11 bg-accent px-3 text-sm text-accent-ink disabled:opacity-40" disabled={busy || !secret.trim()}>Unlock</button>
        </form>
      )}
      {current && !locked && encrypted && (
        <div className="mt-4 max-w-xl">
          <p className="text-sm">You can already open this drive. Decrypt takes BitLocker off. The files stay. It can take a long time, and Windows finishes it in the background. Read the key shows a recovery password Windows already stored, when it stored one.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 bg-accent px-3 text-sm text-accent-ink disabled:opacity-40" disabled={busy} onClick={() => run(bitlockerOff(current.letter))}>Decrypt</button>
            <button type="button" className="min-h-11 border border-line px-3 text-sm disabled:opacity-40" disabled={busy} onClick={() => run(bitlockerReadKey(current.letter), (next) => { setKey(presentReadKeys(next)); setKeyDrive(current.letter); setNote("This is the recovery key Windows already stored. Save it somewhere that is not this drive."); })}>Read the key</button>
          </div>
        </div>
      )}
      {current && current.state === "Unknown" && !locked && (
        <div className="mt-4 max-w-xl">
          <p className="text-sm">This drive is on the list, but Windows did not say if it is encrypted. Give Windows permission, then scan again.</p>
          {!asked && <button type="button" className="mt-3 min-h-11 border border-line px-3 text-sm" onClick={() => { setAsked(true); load(true); }}>Give Windows permission</button>}
        </div>
      )}
      {current && !locked && !encrypted && current.state !== "Unknown" && (
        <div className="mt-4 max-w-xl">
          <p className="text-sm">This drive is not encrypted. Turn BitLocker on and Data Finder will show the recovery key. Save that key in a document that is not on this drive.</p>
          <button type="button" className="mt-3 min-h-11 bg-accent px-3 text-sm text-accent-ink disabled:opacity-40" disabled={busy} onClick={() => run(bitlockerOn(current.letter), (next) => { setKey(next); setKeyDrive(current.letter); setNote("BitLocker is on. Save this recovery key in a document."); })}>Turn on BitLocker</button>
        </div>
      )}
      {key && (
        <div className="mt-4 max-w-xl border border-line p-3">
          <p className="text-sm font-semibold">Recovery key</p>
          <textarea readOnly value={key} aria-label="Recovery key" rows={Math.min(8, Math.max(2, key.split("\n").length))} className="mt-2 w-full border border-line bg-pane px-2 py-2 font-mono text-sm" />
          <button type="button" className="mt-3 min-h-11 border border-line px-3 text-sm" disabled={busy || !keyDrive} onClick={() => void chooseFolder().then((folder) => bitlockerSaveKey(folder, keyDrive, key)).then((path) => setNote(`Key saved · ${path}`)).catch((cause: unknown) => setNote(cause instanceof Error ? cause.message : "Could not save the key"))}>Save the key</button>
        </div>
      )}
      {note && <p className="mt-3 max-w-xl text-sm">{note}</p>}
      <KeyGuide />
    </div>
  );
}

function RecoveryRibbon() {
  return (
    <div className="flex items-center px-3 py-2 text-sm text-muted">
      Recovery copies deleted files into a folder you choose. Search the list, or scan for one deleted name.
    </div>
  );
}

function KeepsRibbon() {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
      <span className="text-muted">A saved copy is the folder as it is now. An earlier copy is a restore point Windows already kept.</span>
      <button type="button" className="h-9 rounded-md bg-accent px-3 text-accent-ink" onClick={() => useFiles.getState().takeSnapshot()}>Save this folder</button>
      <button type="button" className="h-9 rounded-md border border-line px-3" onClick={() => useFiles.getState().openDialog({ kind: "snap-user" })}>User folders</button>
    </div>
  );
}

function KeepsPage() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-2">
      <section className="min-h-0 overflow-auto border-b border-line p-4 lg:border-b-0 lg:border-r">
        <SnapshotWindow embedded />
      </section>
      <section className="min-h-0 overflow-auto p-4">
        <EarlierDialog embedded />
      </section>
    </div>
  );
}

const RECOVERY_KINDS = ["Pictures", "Documents", "Music", "Video", "Archives", "Email", "Other"];

const PRACTICE_HITS: RecoveryHit[] = [
  { id: 1, name: "Budget.xlsx", original: "C:\\Users\\Documents\\Budget.xlsx", bytes: 24000, kind: "Documents", chance: "Excellent", source: "Recycle Bin" },
  { id: 2, name: "Photos", original: "C:\\Users\\Pictures\\Photos", bytes: 0, kind: "Folder", chance: "Good", source: "Deleted" },
  { id: 3, name: "IMG_2201.jpg", original: "C:\\Users\\Pictures\\Photos\\IMG_2201.jpg", bytes: 2400000, kind: "Pictures", chance: "Good", source: "Deleted" },
];

function hitMatches(hit: RecoveryHit, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return hit.name.toLowerCase().includes(needle) || hit.original.toLowerCase().includes(needle);
}

function RecoveryPage() {
  const nodes = useFiles((s) => s.nodes);
  const drives = Object.values(nodes).filter((node) => node.kind === "drive" && node.name.endsWith(":") && node.mounted !== false);
  const [letter, setLetter] = useState(drives.some((drive) => drive.name.startsWith("C")) ? "C" : (drives[0]?.name.replace(":", "") || "C"));
  const [kinds, setKinds] = useState<string[]>(RECOVERY_KINDS);
  const [deep, setDeep] = useState(false);
  const [target, setTarget] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RecoveryStatus | null>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [dest, setDest] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isDesktop()) return;
    let live = true;
    const pull = () => {
      void recoveryStatus().then((next) => { if (live) setStatus(next); }).catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 700);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  const practice = !isDesktop();
  const hits = practice && (status?.hits.length ?? 0) === 0 ? PRACTICE_HITS : (status?.hits ?? []);
  const shown = hits.filter((hit) => hitMatches(hit, query));
  const selected = hits.filter((hit) => picked[hit.id]);
  const toggleKind = (kind: string) => setKinds((current) => current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]);
  const start = () => {
    setNote(target.trim() && deep ? "Deep scan looks for files that have no name, so this scan uses the name instead." : "");
    setPicked({});
    setQuery(target.trim());
    if (practice) {
      setNote("This example list can be searched. The scan itself runs in the Windows program.");
      return;
    }
    void recoveryStart(letter, kinds, deep, target.trim()).catch((error: unknown) => setNote(error instanceof Error ? error.message : "Could not start the scan"));
  };
  const save = () => {
    if (!dest.trim()) {
      setNote("Type a folder on a different drive, such as D:\\Recovered");
      return;
    }
    setBusy(true);
    void recoverySave(selected.map((hit) => hit.id), dest.trim()).then((result) => setNote(result.message)).catch((error: unknown) => setNote(error instanceof Error ? error.message : "Could not save those files")).finally(() => setBusy(false));
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-end gap-3 border-b border-line px-3 py-3">
        <label className="text-sm">
          <span className="mb-1 block text-muted">Drive</span>
          <select value={letter} onChange={(e) => setLetter(e.target.value)} className="h-9 min-w-24 rounded-md border border-line bg-pane px-2" aria-label="Drive to scan">
            {(drives.length ? drives : [{ name: "C:" }]).map((drive) => {
              const value = drive.name.replace(":", "");
              return <option key={value} value={value}>{drive.name}</option>;
            })}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">Look for</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Deleted file or folder" aria-label="Deleted file or folder" className="h-9 w-52 rounded-md border border-line bg-pane px-2" />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
          Deep scan
        </label>
        <button type="button" className="h-9 rounded-md bg-accent px-3 text-sm text-accent-ink" disabled={status?.running} onClick={start}>Scan</button>
        <button type="button" className="h-9 rounded-md border border-line px-3 text-sm" disabled={!status?.running} onClick={() => void recoveryStop()}>Stop</button>
        <button type="button" className="h-9 rounded-md border border-line px-3 text-sm" disabled={!!status?.running || ((status?.hits.length ?? 0) === 0 && !status?.error)} onClick={() => { setPicked({}); setNote(""); void recoveryClear().then(() => setStatus((current) => current ? { ...current, hits: [], phase: "Ready", done: false, error: "", scanned_mb: 0, total_mb: 0 } : current)).catch((error: unknown) => setNote(error instanceof Error ? error.message : "Could not clear the scan")); }}>Clear</button>
        <p className="min-w-0 flex-1 text-sm text-muted">
          {status?.phase || "Ready"}
          {status?.total_mb ? ` · ${status.scanned_mb} MB of ${status.total_mb} MB` : status?.scanned_mb ? ` · ${status.scanned_mb} MB` : ""}
          {hits.length ? ` · ${query.trim() ? `${shown.length} of ${hits.length}` : hits.length} found` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
        <label className="flex h-9 min-w-52 flex-1 items-center gap-2 rounded-md border border-line bg-pane px-2 text-sm">
          <Search className="size-3.5 shrink-0 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the list" aria-label="Search recovered files and folders" className="h-full w-full bg-transparent outline-none" />
        </label>
        {query && <button type="button" className="h-9 rounded-md border border-line px-3 text-sm" onClick={() => setQuery("")}>Clear search</button>}
        <p className="text-sm text-muted">{target.trim() ? "A name finds that deleted file or folder, and files that were inside it." : "Leave Look for blank to list every deleted file."}</p>
      </div>
      <div className="flex flex-wrap gap-3 border-b border-line px-3 py-2">
        {RECOVERY_KINDS.map((kind) => (
          <label key={kind} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={kinds.includes(kind)} onChange={() => toggleKind(kind)} />
            {kind}
          </label>
        ))}
      </div>
      {status?.error && <p className="border-b border-line px-3 py-2 text-sm text-danger">{status.error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-header text-xs text-muted">
            <tr>
              <th className="w-10 px-2 py-1">
                <input
                  type="checkbox"
                  aria-label="Select every result in the search"
                  checked={shown.length > 0 && shown.every((hit) => picked[hit.id])}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setPicked((current) => {
                      const next = { ...current };
                      for (const hit of shown) next[hit.id] = on;
                      return next;
                    });
                  }}
                />
              </th>
              {["Name", "Original location", "Size", "Kind", "Chance", "Found in"].map((label) => (
                <th key={label} className="px-2 py-1 font-medium">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((hit) => (
              <tr key={hit.id} className="border-t border-line hover:bg-header">
                <td className="px-2 py-1">
                  <input type="checkbox" aria-label={`Select ${hit.name}`} checked={!!picked[hit.id]} onChange={() => setPicked((current) => ({ ...current, [hit.id]: !current[hit.id] }))} />
                </td>
                <td className="max-w-56 truncate px-2 py-1" title={hit.name}>{hit.name}</td>
                <td className="max-w-80 truncate px-2 py-1" title={hit.original}>{hit.original}</td>
                <td className="whitespace-nowrap px-2 py-1 tabular-nums">{formatSize(hit.bytes) || "0 B"}</td>
                <td className="px-2 py-1">{hit.kind}</td>
                <td className="px-2 py-1">{hit.chance}</td>
                <td className="px-2 py-1">{hit.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {practice && <p className="px-3 py-2 text-sm text-muted">Example list. Search it here. The scan itself runs in the Windows program.</p>}
        {shown.length === 0 && hits.length > 0 && <p className="px-3 py-6 text-sm text-muted">No file or folder in this list matches that search.</p>}
        {hits.length === 0 && <p className="px-3 py-6 text-sm text-muted">Nothing yet. Choose a drive and scan. Type a deleted file or folder name in Look for to search for that one. Quick scan reads the Recycle Bin and deleted file records. Deep scan also searches free space, and it can take a long time.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="shrink-0 text-muted">Save to</span>
          <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="D:\Recovered" aria-label="Folder to save recovered files" className="h-9 w-full rounded-md border border-line bg-pane px-2" />
        </label>
        <button type="button" className="h-9 rounded-md border border-line px-3 text-sm" onClick={() => void chooseFolder().then(setDest).catch((error: unknown) => setNote(error instanceof Error ? error.message : "No folder was chosen"))}>Choose folder</button>
        <button type="button" className="h-9 rounded-md bg-accent px-3 text-sm text-accent-ink disabled:opacity-40" disabled={busy || selected.length === 0} onClick={save}>
          Save {selected.length || ""} selected
        </button>
        {note && <span className="text-sm">{note}</span>}
      </div>
    </div>
  );
}

function HeaderSearch() {
  const active = useFiles((s) => s.active);
  const query = useFiles((s) => s.panes[s.active].query);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLInputElement>(null);
  const expanded = open || query.length > 0;
  useEffect(() => {
    if (open) box.current?.focus();
  }, [open]);
  if (!expanded) {
    return (
      <button type="button" className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-pane px-2.5 text-sm" onClick={() => setOpen(true)}>
        <Search className="size-3.5" />
        Search
      </button>
    );
  }
  return (
    <label className="flex h-8 w-56 items-center gap-1 rounded-md border border-line bg-pane px-2">
      <Search className="size-3.5 shrink-0 text-muted" />
      <input
        ref={box}
        value={query}
        onChange={(e) => useFiles.getState().setQuery(active, e.target.value)}
        onBlur={() => { if (!useFiles.getState().panes[useFiles.getState().active].query.trim()) setOpen(false); }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            useFiles.getState().setQuery(active, "");
            setOpen(false);
          }
        }}
        placeholder="Search"
        aria-label="Search this folder"
        className="h-full w-full bg-transparent text-sm outline-none"
      />
    </label>
  );
}

export function FileManager() {
  const split = useFiles((s) => s.split);
  const dark = useFiles((s) => s.dark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  useEffect(() => {
    if (!isDesktop()) return;
    let last = -1;
    let live = true;
    const later: number[] = [];
    const clearLater = () => {
      while (later.length) window.clearTimeout(later.pop());
    };
    const look = async () => {
      try {
        const mask = await driveMask();
        if (!live) return;
        if (last >= 0 && mask !== last) {
          clearLater();
          await useFiles.getState().reloadDrives();
          for (const wait of [1500, 4000]) {
            later.push(window.setTimeout(() => {
              if (live) void useFiles.getState().reloadDrives();
            }, wait));
          }
        }
        last = mask;
      } catch {
        /* try again on the next check */
      }
    };
    void look();
    const timer = window.setInterval(() => void look(), 2000);
    let stopDrag = false;
    let unlistenDrag: (() => void) | undefined;
    void import("@tauri-apps/api/webview").then(({ getCurrentWebview }) => {
      if (stopDrag) return;
      void getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type !== "drop") return;
        const ids = desktopDragIds ?? useFiles.getState().dragIds;
        if (!ids?.length) return;
        const point = event.payload.position;
        const x = point.x / window.devicePixelRatio;
        const y = point.y / window.devicePixelRatio;
        const hit = document.elementFromPoint(x, y) ?? document.elementFromPoint(point.x, point.y);
        const paneEl = hit?.closest("[data-pane]");
        const paneIndex = paneEl?.getAttribute("data-pane") === "1" ? 1 : 0;
        const rowId = hit?.closest("[data-row]")?.getAttribute("data-row") ?? "";
        const state = useFiles.getState();
        const rowNode = rowId ? state.nodes[rowId] : undefined;
        let target = state.panes[paneIndex].pathId;
        if (rowNode && (rowNode.kind === "dir" || rowNode.kind === "drive")) target = rowNode.id;
        else if (rowNode?.parentId) target = rowNode.parentId;
        if (!target || ids.includes(target)) return;
        state.transferTo(ids, target, "move");
      }).then((fn) => {
        if (stopDrag) fn();
        else unlistenDrag = fn;
      }).catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      live = false;
      stopDrag = true;
      unlistenDrag?.();
      window.clearInterval(timer);
      clearLater();
    };
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(UI_KEY);
      const prefs = raw ? (JSON.parse(raw) as UiPrefs) : {};
      const catalogRaw = localStorage.getItem(CATALOG_KEY);
      if (catalogRaw) prefs.catalog = JSON.parse(catalogRaw);
      useFiles.getState().hydrate(prefs);
    } catch {
      /* keep defaults */
    }
    void (isDesktop() ? useFiles.getState().openFolder(0) : useFiles.getState().calcSizes(0));
    const blockMenu = (event: Event) => event.preventDefault();
    window.addEventListener("contextmenu", blockMenu, true);
    let savedNodes = useFiles.getState().nodes;
    let savedOrder = useFiles.getState().order;
    let savedSeq = useFiles.getState().seq;
    let samplePaths: [string, string] = [
      useFiles.getState().panes[0].pathId,
      useFiles.getState().panes[1].pathId,
    ];
    let saveTimer = 0;
    const unsub = useFiles.subscribe((state) => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
      const pathFor = (id: string, index: 0 | 1) => {
        if (isDiskId(id) || !state.nodes[id]) return samplePaths[index];
        samplePaths[index] = id;
        return id;
      };
      const prefs: UiPrefs = {
        split: state.split,
        diff: state.diff,
        dupes: state.dupes,
        barMode: state.barMode,
        calcDirs: state.calcDirs,
        dark: state.dark,
        dateFormat: state.dateFormat,
        timeFormat: state.timeFormat,
        reading: state.reading,
        favorites: state.favorites.filter((id) => !isDiskId(id)),
        recent: state.recent.filter((id) => !isDiskId(id)),
        filters: state.filters,
        flat: [state.panes[0].flat, state.panes[1].flat],
        columns: state.columns,
        paths: [pathFor(state.panes[0].pathId, 0), pathFor(state.panes[1].pathId, 1)],
        sort: [
          { key: state.panes[0].sortKey, dir: state.panes[0].sortDir },
          { key: state.panes[1].sortKey, dir: state.panes[1].sortDir },
        ],
        detailHeight: state.detailHeight,
        detailWidth: state.detailWidth,
        detailsOpen: state.detailsOpen,
        viewMode: state.viewMode,
        showNav: state.showNav,
        compact: state.compact,
        itemChecks: state.itemChecks,
        showExt: state.showExt,
        previewOpen: state.previewOpen,
        snaps: state.snaps,
        uiRev: 6,
        pins: state.pins,
        pinsOpen: state.pinsOpen,
        recentPaths: state.recentPaths,
        showAllDrives: state.showAllDrives,
      };
      try {
        localStorage.setItem(UI_KEY, JSON.stringify(prefs));
        if (!isDesktop() && (state.nodes !== savedNodes || state.order !== savedOrder || state.seq !== savedSeq)) {
          savedNodes = state.nodes;
          savedOrder = state.order;
          savedSeq = state.seq;
          const catalog = withoutDisk({ nodes: state.nodes, order: state.order, seq: state.seq });
          if (catalog.nodes.c && catalog.nodes.pc) {
            localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
          }
        }
      } catch {
        /* the browser refused the save */
      }
      }, 400);
    });
    return () => {
      window.clearTimeout(saveTimer);
      window.removeEventListener("contextmenu", blockMenu, true);
      unsub();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      const store = useFiles.getState();
      if (e.key === "Escape") {
        if (store.dialog) store.openDialog(null);
        else if (store.menu) store.openMenu(null);
        else if (store.readerId) store.openReader(null);
        else if (store.searchPane != null) store.clearSearch();
        else if (store.shadowId) store.clearShadow();
        return;
      }
      if (typing || store.dialog) return;
      if (e.key === "Enter" && tag === "BUTTON") return;
      const index = store.active;
      const visible = listing(store, index).rows.map((row) => row.id);
      if (e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) {
        e.preventDefault();
        store.goUp();
      } else if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        store.goBack(index);
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        store.goForward(index);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const pos = e.key === "Home" ? 0 : visible.length - 1;
        const id = visible[pos];
        if (id) {
          store.selectOnly(index, id);
          revealRow(index, pos);
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        window.dispatchEvent(new Event("datafinder-path"));
      } else if (e.key === "F5") {
        e.preventDefault();
        store.refresh();
      } else if (e.key === "Delete") {
        const ids = store.panes[index].selected;
        if (ids.length) store.openDialog({ kind: "delete", ids });
      } else if (e.key === "F2") {
        const id = store.panes[index].selected[0];
        const node = id ? store.nodes[id] : undefined;
        if (node) store.openDialog({ kind: "rename", id, name: node.name });
      } else if (e.key === "Enter") {
        const id = store.panes[index].selected[0];
        if (id && store.nodes[id]) store.openItem(index, id);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        store.moveSelection(index, dir, visible);
        const next = useFiles.getState().panes[index].selected[0];
        revealRow(index, next ? visible.indexOf(next) : -1);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 && e.key !== " ") {
        const now = performance.now();
        if (now - typedAt > 800) typedName = "";
        const cycling = typedName === e.key.toLowerCase();
        typedName = cycling ? e.key.toLowerCase() : typedName + e.key.toLowerCase();
        typedAt = now;
        const rows = listing(store, index).rows;
        const current = store.panes[index].selected[0];
        const at = rows.findIndex((row) => row.id === current);
        const from = cycling ? (at >= 0 ? at + 1 : 0) : 0;
        let hit = -1;
        for (let step = 0; step < rows.length; step += 1) {
          const pos = (from + step) % rows.length;
          if (rows[pos].name.toLowerCase().startsWith(typedName)) {
            hit = pos;
            break;
          }
        }
        if (hit >= 0) {
          store.selectOnly(index, rows[hit].id);
          revealRow(index, hit);
          useFiles.setState({ status: `Jump to ${typedName}` });
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        store.openTab(index, store.panes[index].pathId);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        store.closeTab(index, store.panes[index].tab);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        store.selectAll(index, visible);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        void store.copyPath();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        store.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") store.copy();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") store.cut();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") store.paste();
      else if (e.key === "F6") {
        e.preventDefault();
        if (!store.split) store.toggleSplit();
        store.setActive(store.active === 0 ? 1 : 0);
      } else if ((e.altKey && e.key === "Enter") || (e.metaKey && e.key === "Enter")) {
        const id = store.panes[index].selected[0];
        if (id) store.openDialog({ kind: "props", id });
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        store.openDialog({ kind: "search" });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        store.setTab("inspect");
        requestAnimationFrame(() => document.getElementById("find-box")?.focus());
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
        store.openDialog({ kind: "new", file: false });
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        store.openDialog({ kind: "mask" });
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        store.toggleFlat();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const readerId = useFiles((s) => s.readerId);
  const tab = useFiles((s) => s.tab);
  const helpPage = useFiles((s) => s.helpPage);
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app text-ink">
      <TabRow />
      <Ribbon />
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {tab === "resources" ? (
          helpPage === "about" ? <AboutPage /> : <ManualPage />
        ) : tab === "decrypt" ? (
          <DecryptionPage />
        ) : tab === "recovery" ? (
          <RecoveryPage />
        ) : tab === "keeps" ? (
          <KeepsPage />
        ) : split ? (
          <Group orientation="vertical" className="min-h-0 flex-1">
            <Panel minSize="20%" id="pane-a" className="min-h-0">
              <PaneView index={0} />
            </Panel>
            <Separator className="h-1.5 bg-ribbon-edge hover:bg-accent" />
            <Panel minSize="20%" id="pane-b" className="min-h-0">
              <PaneView index={1} />
            </Panel>
          </Group>
        ) : (
          <PaneView index={0} />
        )}
        </div>
        {readerId && <NotePane id={readerId} />}
      </div>
      <Transfers />
      <LogDrawer />
      <StatusBar />
      <Dialogs />
      <ContextMenu />
    </div>
  );
}
