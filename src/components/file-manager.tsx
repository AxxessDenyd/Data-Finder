import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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
import { diskPath, isDesktop, isDiskId, withoutDisk } from "@/lib/disk";

const UI_KEY = "data-finder-ui";
const CATALOG_KEY = "data-finder-catalog";
const MB = 1024 * 1024;
const NO_CHILDREN: string[] = [];

function shownSize(bytes: number | null | undefined, approx?: boolean) {
  const text = formatSize(bytes);
  if (!text) return "";
  return approx ? `${text}+` : text;
}

function shownName(name: string, kind: string, showExt: boolean) {
  if (showExt || kind !== "file") return name;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function Icon({ node, className = "size-4 shrink-0" }: { node: Pick<FsNode, "kind" | "note"> & { name?: string }; className?: string }) {
  if (node.kind === "computer") return <Monitor className={`${className} text-accent`} />;
  if (node.kind === "drive") return <HardDrive className={`${className} text-accent`} />;
  if (node.kind === "dir") return <Folder className={`${className} fill-folder text-folder`} />;
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

function MenuPop({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <>
      <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div className="absolute top-full left-0 z-30 max-h-80 min-w-56 overflow-auto rounded-lg border border-line bg-menu p-1 shadow-xl">{children}</div>
    </>
  );
}

const PLACE_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  { title: "System", items: [["win", "Windows"], ["sys32", "System32"], ["drivers", "Drivers"], ["config", "Config"], ["pf", "Prog. Files"]] },
  { title: "32-bit", items: [["pfx86", "Prog. Files"], ["syswow", "SysWOW64"]] },
  { title: "Current user", items: [["desktop", "Desktop"], ["docs", "Documents"], ["appdata", "AppData"], ["startmenu", "Start Menu"], ["temp", "Temp"], ["owner", "Profile"], ["favdir", "Favorites"], ["music", "Music"], ["pics", "Pictures"], ["videos", "Videos"]] },
  { title: "All users", items: [["pubdesk", "Desktop"], ["pubdocs", "Documents"], ["pdata", "Prog. Data"], ["pubstart", "Start Menu"], ["pubtemp", "Temp"]] },
];

function PlacesMenu({ anchor, onClose }: { anchor: DOMRect; onClose: () => void }) {
  const nodes = useFiles((s) => s.nodes);
  const active = useFiles((s) => s.active);
  const favorites = useFiles((s) => s.favorites);
  const pathId = useFiles((s) => s.panes[s.active].pathId);
  const go = (id: string) => {
    if (!useFiles.getState().nodes[id]) return;
    useFiles.getState().navigate(active, id);
    onClose();
  };
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 336));
  return (
    <>
      <button type="button" aria-label="Close places" className="fixed inset-0 z-30 cursor-default" onClick={onClose} />
      <div className="fixed z-40 max-h-[70vh] w-80 overflow-auto border border-line bg-pane shadow-md" style={{ left, top: anchor.bottom + 4 }}>
        {favorites.length > 0 && (
          <div className="border-b border-line p-2">
            <div className="mb-1 text-xs font-semibold text-muted">Pinned</div>
            <div className="flex flex-wrap gap-1">
              {favorites.map((id) => nodes[id] && (
                <button key={id} type="button" className="max-w-full truncate px-2 py-1 text-xs hover:bg-select" onClick={() => go(id)}>
                  {nodes[id].name}
                </button>
              ))}
            </div>
          </div>
        )}
        {PLACE_GROUPS.map((group) => (
          <div key={group.title}>
            <div className="bg-header px-2 py-1 text-xs font-semibold">{group.title}</div>
            <div className="grid grid-cols-5 gap-1 p-2">
              {group.items.filter(([id]) => nodes[id]).map(([id, label]) => (
                <button key={id} type="button" className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-1 text-center text-[11px] leading-tight hover:bg-select" onClick={() => go(id)}>
                  <Folder className="size-5 text-folder" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className="block min-h-11 w-full border-t border-line px-3 text-left text-sm hover:bg-select" onClick={() => { useFiles.getState().toggleFavorite(); onClose(); }}>
          {favorites.includes(pathId) ? "Unpin this folder" : "Pin this folder"}
        </button>
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
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const set = useFiles.getState().setOptions;
  const filters = useFiles.getState().setFilters;
  const row = (on: boolean, label: string, fn: () => void, icon?: ReactNode, nest?: boolean) => (
    <button
      type="button"
      className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-select"
      onMouseEnter={() => { if (!nest) setShow(false); }}
      onClick={fn}
    >
      <span className="grid w-4 shrink-0 place-items-center">{on ? <Check className="size-4" /> : null}</span>
      <span className="grid w-5 shrink-0 place-items-center text-muted">{icon}</span>
      <span className="min-w-0 flex-1">{label}</span>
      {nest ? <ChevronRight className="size-3.5 text-muted" /> : null}
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
    <div className="relative">
      <button type="button" className={"flex h-8 items-center gap-1 rounded-md px-2 text-[13px] " + (open ? "bg-select" : "hover:bg-header")} onClick={() => { setOpen((v) => !v); setShow(false); }}>
        <List className="size-4" />
        View
        <ChevronDown className="size-3.5 text-muted" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close view menu" className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-30 mt-1 w-64 rounded-lg border border-line bg-menu p-1 shadow-xl">
            {layouts.map(([id, label, icon]) => (
              <span key={id}>{row(viewMode === id, label, () => { set({ viewMode: id }); setOpen(false); }, icon)}</span>
            ))}
            <div className="my-1 h-px bg-line" />
            {row(detailsOpen, "Details pane", () => set({ detailsOpen: !detailsOpen }), <PanelLeft className="size-4" />)}
            {row(previewOpen, "Preview pane", () => set({ previewOpen: !previewOpen }), <File className="size-4" />)}
            <div className="my-1 h-px bg-line" />
            <div className="relative" onMouseEnter={() => setShow(true)}>
              {row(false, "Show", () => setShow((v) => !v), <List className="size-4" />, true)}
              {show && (
                <div className="absolute top-0 left-full z-40 ml-1 w-60 rounded-lg border border-line bg-menu p-1 shadow-xl">
                  {row(showNav, "Navigation pane", () => set({ showNav: !showNav }), <PanelLeft className="size-4" />)}
                  {row(compact, "Compact view", () => set({ compact: !compact }), <List className="size-4" />)}
                  {row(itemChecks, "Item check boxes", () => set({ itemChecks: !itemChecks }), <Check className="size-4" />)}
                  {row(showExt, "File name extensions", () => set({ showExt: !showExt }), <FileText className="size-4" />)}
                  {row(showHidden, "Hidden items", () => filters({ showHidden: !showHidden }), <EyeOffIcon />)}
                  {row(showReadonly, "Read-only items", () => filters({ showReadonly: !showReadonly }), <File className="size-4" />)}
                  {row(showSystem, "System items", () => filters({ showSystem: !showSystem }), <HardDrive className="size-4" />)}
                </div>
              )}
            </div>
          </div>
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
  const [sub, setSub] = useState(false);
  const tabs: Array<[RibbonTab, string]> = [
    ["home", "Home"],
    ["inspect", "Find"],
    ["tools", "Analyze"],
    ["options", "View"],
    ["resources", "Help"],
  ];
  const go = (id: RibbonTab) => useFiles.getState().setTab(id);
  return (
    <div className="flex shrink-0 items-end bg-tab">
      <div className="relative mb-1 ml-1">
        <button type="button" aria-label="Application menu" className="grid size-8 place-items-center bg-accent text-accent-ink" onClick={() => { setMenu((open) => !open); setSub(false); }}>
          <Menu className="size-4" />
        </button>
        {menu && (
          <>
            <button type="button" aria-label="Close menu" className="fixed inset-0 z-20 cursor-default" onClick={() => { setMenu(false); setSub(false); }} />
            <div className="absolute top-full left-0 z-30 min-w-56 border border-line bg-pane py-1 shadow-md">
              <div className="relative">
                <button type="button" className={"block min-h-11 w-full px-3 text-left text-sm hover:bg-select " + (sub ? "bg-select" : "")} onClick={() => setSub((open) => !open)}>
                  New view
                </button>
                {sub && (
                  <div className="border-y border-line bg-header py-1 sm:absolute sm:top-0 sm:left-full sm:w-64 sm:border sm:bg-pane sm:shadow-md">
                    <button type="button" className="block w-full px-3 py-2 text-left hover:bg-select" onClick={() => { const state = useFiles.getState(); if (!state.split) state.toggleSplit(); else useFiles.setState({ status: "The second pane is already open" }); setMenu(false); }}>
                      <span className="block text-sm font-semibold">Second pane</span>
                      <span className="block text-xs text-muted">Show another folder beside this one.</span>
                    </button>
                    <button type="button" className="block w-full px-3 py-2 text-left hover:bg-select" onClick={() => { useFiles.getState().openDialog({ kind: "search" }); setMenu(false); }}>
                      <span className="block text-sm font-semibold">Search</span>
                      <span className="block text-xs text-muted">Find names in a catalog folder.</span>
                    </button>
                    <button type="button" className="block w-full px-3 py-2 text-left hover:bg-select" onClick={() => {
                      const state = useFiles.getState();
                      const hit = shadows.find((item) => item.folderId === state.panes[state.active].pathId);
                      state.setTab("tools");
                      if (hit) state.openShadow(state.active, hit.id);
                      else useFiles.setState({ status: "No snapshots for this folder" });
                      setMenu(false);
                    }}>
                      <span className="block text-sm font-semibold">Snapshots</span>
                      <span className="block text-xs text-muted">Open a saved copy of this folder.</span>
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { useFiles.getState().openDialog({ kind: "operation" }); setMenu(false); }}>Copy between folders</button>
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { useFiles.getState().toggleTransfers(); setMenu(false); }}>Queue</button>
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { useFiles.getState().toggleLog(); setMenu(false); }}>Activity</button>
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { useFiles.getState().openDialog({ kind: "goto" }); setMenu(false); }}>Jump to path</button>
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { useFiles.getState().setOptions({ dark: !dark }); setMenu(false); }}>{dark ? "Light mode" : "Dark mode"}</button>
              <button type="button" className="block min-h-11 w-full px-3 text-left text-sm hover:bg-select" onClick={() => { go("resources"); setMenu(false); }}>Help</button>
            </div>
          </>
        )}
      </div>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => go(id)}
          className={"shrink-0 rounded-t-md px-3 py-1.5 text-sm " + (tab === id ? "bg-pane font-semibold text-ink" : "text-muted hover:bg-header")}
        >
          {label}
        </button>
      ))}
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
  const reading = useFiles((s) => s.reading);
  if (reading && tab !== "options") return null;
  return (
    <div className="shrink-0 border-b border-ribbon-edge bg-ribbon">
      {tab === "home" && <HomeRibbon />}
      {tab === "inspect" && <InspectRibbon />}
      {tab === "tools" && <ToolsRibbon />}
      {tab === "options" && <OptionsRibbon />}
      {tab === "resources" && <ResourcesRibbon />}
    </div>
  );
}

function HomeRibbon() {
  const active = useFiles((s) => s.active);
  const split = useFiles((s) => s.split);
  const diff = useFiles((s) => s.diff);
  const barMode = useFiles((s) => s.barMode);
  const logOpen = useFiles((s) => s.logOpen);
  const transfersOpen = useFiles((s) => s.transfersOpen);
  const canUndo = useFiles((s) => s.undoStack.length > 0);
  const dupes = useFiles((s) => s.dupes);
  const flat = useFiles((s) => s.panes[s.active].flat);
  const pathId = useFiles((s) => s.panes[s.active].pathId);
  const selected = useFiles((s) => s.panes[s.active].selected);
  const favorites = useFiles((s) => s.favorites);
  const recent = useFiles((s) => s.recent);
  const nodes = useFiles((s) => s.nodes);
  const order = useFiles((s) => s.order);
  const drive = driveOf({ nodes, order }, pathId);
  const infoCount = selected.length;
  const infoBytes = selected.reduce((sum, id) => sum + (nodes[id]?.bytes ?? 0), 0);
  const infoKnown = selected.every((id) => nodes[id]?.bytes != null);
  const [favOpen, setFavOpen] = useState(false);
  const [favBox, setFavBox] = useState<DOMRect | null>(null);
  const favRef = useRef<HTMLDivElement>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const store = useFiles.getState;
  useEffect(() => setDesktop(isDesktop()), []);

  return (
    <div className="flex items-stretch gap-1 overflow-x-auto px-1 py-1 lg:flex-wrap lg:overflow-x-visible">
      <GroupBox title="Hold">
        <RibbonButton label="Cut" disabled={!selected.length} icon={<Scissors className="size-4" />} onClick={() => store().cut()} />
        <RibbonButton label="Copy" disabled={!selected.length} icon={<Copy className="size-4" />} onClick={() => store().copy()} />
        <RibbonButton label="Paste" icon={<ClipboardPaste className="size-4" />} onClick={() => store().paste()} />
      </GroupBox>
      <GroupBox title="Edit">
        <RibbonButton
          label="Open"
          disabled={!selected.length}
          icon={<File className="size-4" />}
          onClick={() => selected[0] && store().openItem(active, selected[0])}
        />
        <RibbonButton
          label="Delete"
          disabled={!selected.length}
          icon={<Trash2 className="size-4" />}
          onClick={() => selected.length && store().openDialog({ kind: "delete", ids: selected })}
        />
        <RibbonButton
          label="Rename"
          disabled={selected.length !== 1}
          icon={<Pencil className="size-4" />}
          onClick={() => {
            const node = nodes[selected[0]];
            if (node) store().openDialog({ kind: "rename", id: node.id, name: node.name });
          }}
        />
        <RibbonButton
          label="Undo"
          disabled={!canUndo}
          icon={<RotateCcw className="size-4" />}
          onClick={() => store().undo()}
        />
        <RibbonButton label="New folder" icon={<FolderPlus className="size-4" />} onClick={() => store().openDialog({ kind: "new", file: false })} />
        <RibbonButton label="New file" icon={<FilePlus className="size-4" />} onClick={() => store().openDialog({ kind: "new", file: true })} />
      </GroupBox>
      <GroupBox title="Go">
        <RibbonButton label="Up" icon={<ArrowUp className="size-4" />} onClick={() => store().goUp()} />
        <RibbonButton label={desktop ? "This computer" : "Open folder"} icon={<HardDrive className="size-4" />} onClick={() => void store().openFolder()} />
        <RibbonButton label="Unmount" icon={<Unplug className="size-4" />} disabled={!drive || drive.mounted === false || drive.system} onClick={() => {
          if (drive && !drive.system) store().openDialog({ kind: "unmount", id: drive.id });
        }} />
        <RibbonButton label="Format" icon={<Trash2 className="size-4" />} disabled={!drive || drive.mounted === false || drive.system || !drive.name.endsWith(":")} onClick={() => {
          if (drive && !drive.system && drive.name.endsWith(":")) store().openDialog({ kind: "format", id: drive.id });
        }} />
        <RibbonButton label="Refresh" icon={<RefreshCw className="size-4" />} onClick={() => store().refresh()} />
        <RibbonButton label="Measure" icon={<Ruler className="size-4" />} onClick={() => void store().calcSizes()} />
        <RibbonButton label={barMode === "log" ? "Compressed" : "Even bars"} icon={<Scale className="size-4" />} active={barMode === "log"} onClick={() => store().toggleBarMode()} />
        <ViewMenu />
      </GroupBox>
      <GroupBox title="Details">
        <div className="hidden h-14 w-40 flex-col justify-center px-2 text-xs leading-snug lg:flex">
          <span className="truncate">
            {infoCount ? `${infoCount} selected${infoKnown ? ` · ${formatSize(infoBytes)}` : ""}` : "Nothing selected"}
          </span>
          <span className="truncate text-muted">{nodes[pathId] ? displayPath({ nodes, order: {} }, pathId) : ""}</span>
        </div>
        <RibbonButton
          label="Location"
          icon={<Link className="size-4" />}
          onClick={() => void store().copyPath(selected[0])}
        />
        <RibbonButton
          label="Info"
          disabled={selected.length !== 1}
          icon={<FileText className="size-4" />}
          onClick={() => selected[0] && store().openDialog({ kind: "props", id: selected[0] })}
        />
      </GroupBox>
      <GroupBox title="Shortcuts">
        <div ref={favRef}>
          <RibbonButton label="Starred" icon={<Star className="size-4" />} active={favorites.includes(pathId) || favOpen} onClick={() => { setFavBox(favRef.current?.getBoundingClientRect() ?? null); setFavOpen((v) => !v); setHistOpen(false); }} />
          {favOpen && favBox && <PlacesMenu anchor={favBox} onClose={() => setFavOpen(false)} />}
        </div>
        <div className="relative">
          <RibbonButton label="Recent" icon={<History className="size-4" />} active={histOpen} onClick={() => { setHistOpen((v) => !v); setFavOpen(false); }} />
          {histOpen && (
            <MenuPop onClose={() => setHistOpen(false)}>
              {[...recent].reverse().map((id) => (
                <button key={id} type="button" className="block w-full truncate px-3 py-2 text-left hover:bg-select" onClick={() => { store().navigate(active, id); setHistOpen(false); }}>
                  {nodes[id] ? displayPath({ nodes, order: {} }, id) : id}
                </button>
              ))}
            </MenuPop>
          )}
        </div>
      </GroupBox>
      <GroupBox title="Layout">
        <RibbonButton label="Two panes" icon={<Columns2 className="size-4" />} active={split} onClick={() => store().toggleSplit()} />
        <RibbonButton label="Gaps" icon={<Diff className="size-4" />} active={diff} onClick={() => store().toggleDiff()} />
        <RibbonButton label="Copy missing" disabled={!split} icon={<ArrowLeftRight className="size-4" />} onClick={() => store().mirror()} />
        <RibbonButton label="Update other" disabled={!split} icon={<FolderSync className="size-4" />} onClick={() => store().syncOther()} />
        <RibbonButton label="All files" icon={<ListTree className="size-4" />} active={flat} onClick={() => store().toggleFlat()} />
        <RibbonButton label="Line up" disabled={!split} icon={<GitCompare className="size-4" />} onClick={() => store().compare()} />
        <RibbonButton label="Same size" icon={<Files className="size-4" />} active={dupes} onClick={() => store().toggleDupes()} />
        <RibbonButton label="Queue" icon={<ClipboardPaste className="size-4" />} active={transfersOpen} onClick={() => store().toggleTransfers()} />
        <RibbonButton label="Activity" icon={<FileText className="size-4" />} active={logOpen} onClick={() => store().toggleLog()} />
        <RibbonButton label="How to" icon={<CircleHelp className="size-4" />} onClick={() => store().openDialog({ kind: "help" })} />
      </GroupBox>
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
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto px-1 py-1">
      <GroupBox title="Start">
        <RibbonButton label="How it works" icon={<CircleHelp className="size-4" />} onClick={() => useFiles.getState().openDialog({ kind: "help" })} />
      </GroupBox>
      <GroupBox title="Open">
        <RibbonButton label="Find" icon={<Filter className="size-4" />} onClick={() => useFiles.getState().setTab("inspect")} />
        <RibbonButton label="View" icon={<Scale className="size-4" />} onClick={() => useFiles.getState().setTab("options")} />
      </GroupBox>
      <p className="flex max-w-xl items-center px-3 text-sm text-muted">
        Data Finder browses this catalog. Find narrows a folder, View sets the size bars and dates, and Analyze lines folders up and opens saved copies.
      </p>
    </div>
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

function TreeBranch({ id, depth, pane }: { id: string; depth: number; pane: 0 | 1 }) {
  const node = useFiles((s) => s.nodes[id]);
  const childIds = useFiles((s) => s.order[id]) ?? NO_CHILDREN;
  const nodes = useFiles((s) => s.nodes);
  const pathId = useFiles((s) => s.panes[pane].pathId);
  const filters = useFiles((s) => s.filters);
  const [open, setOpen] = useState(depth < 1 || id === "c");
  const inPath = pathIds({ nodes, order: {} }, pathId).includes(id);
  useEffect(() => {
    if (inPath) setOpen(true);
  }, [inPath]);
  if (!node) return null;
  const folders = childIds
    .map((cid) => nodes[cid])
    .filter((item) => item && item.kind !== "file" && flagVisible(item, filters));
  const here = pathId === id;
  const label = node.kind === "drive" ? `${driveCaption(node)} · ${node.mounted === false ? "Not mounted" : "Mounted"}` : node.name;
  return (
    <div>
      <button
        type="button"
        className={"flex w-full items-center gap-1 py-2 pr-2 text-left hover:bg-select sm:py-1 " + (here ? "bg-select" : "")}
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
      </button>
      {open && folders.map((folder) => <TreeBranch key={folder.id} id={folder.id} depth={depth + 1} pane={pane} />)}
    </div>
  );
}

function IconBoard({ index, rows, mode }: { index: 0 | 1; rows: ListRow[]; mode: ViewMode }) {
  const nodes = useFiles((s) => s.nodes);
  const selectedIds = useFiles((s) => s.panes[index].selected);
  const showExt = useFiles((s) => s.showExt);
  const itemChecks = useFiles((s) => s.itemChecks);
  const clipboard = useFiles((s) => s.clipboard);
  const icon = mode === "xlarge" ? "size-16" : mode === "large" ? "size-12" : mode === "medium" ? "size-8" : "size-5";
  const wide = mode === "list" || mode === "content" || mode === "tiles";
  return (
    <div className={wide ? "flex flex-col gap-0.5 p-1" : "grid gap-1 p-2 " + (mode === "xlarge" ? "grid-cols-[repeat(auto-fill,minmax(132px,1fr))]" : mode === "small" ? "grid-cols-[repeat(auto-fill,minmax(84px,1fr))]" : "grid-cols-[repeat(auto-fill,minmax(104px,1fr))]")}>
      {rows.length === 0 && <p className="col-span-full px-3 py-8 text-center text-muted">This folder is empty.</p>}
      {rows.map((row) => {
        const selected = selectedIds.includes(row.id);
        const cut = clipboard?.mode === "cut" && row.nodeId && clipboard.ids.includes(row.nodeId);
        const label = row.kind === "drive" && row.nodeId && nodes[row.nodeId] ? driveCaption(nodes[row.nodeId]) : shownName(row.name, row.kind, showExt);
        return (
          <button
            key={row.id}
            type="button"
            data-row={row.id}
            className={
              "flex rounded-md text-left " +
              (wide ? "items-center gap-2 px-2 py-1" : "flex-col items-center gap-1 px-2 py-2 text-center") +
              (selected ? " bg-select" : " hover:bg-header") +
              (cut ? " opacity-50" : "")
            }
            onClick={(e) => {
              const ids = rows.map((item) => item.id);
              if (e.shiftKey) useFiles.getState().selectRange(index, row.id, ids);
              else if (e.metaKey || e.ctrlKey) useFiles.getState().toggleSelect(index, row.id);
              else useFiles.getState().selectOnly(index, row.id);
            }}
            onDoubleClick={() => row.nodeId && useFiles.getState().openItem(index, row.nodeId)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              useFiles.getState().setActive(index);
              if (row.nodeId) useFiles.getState().selectOnly(index, row.nodeId);
              useFiles.getState().openMenu({ x: e.clientX, y: e.clientY, id: row.nodeId ?? null });
            }}
          >
            {itemChecks && <input type="checkbox" checked={selected} readOnly tabIndex={-1} aria-label={`Select ${row.name}`} />}
            <Icon node={{ kind: row.kind, name: row.name, note: row.note }} className={icon + " shrink-0"} />
            <span className={wide ? "min-w-0 flex-1" : "w-full"}>
              <span className={"block truncate " + (wide ? "" : "text-xs")} title={row.name}>{label}</span>
              {(mode === "content" || mode === "tiles") && (
                <span className="block truncate text-xs text-muted">{typeLabel(row.nodeId && nodes[row.nodeId] ? nodes[row.nodeId] : ({ kind: row.kind, name: row.name } as FsNode))}</span>
              )}
            </span>
          </button>
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
  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-line bg-tree p-4 lg:flex">
      {node ? (
        <>
          <Icon node={node} className="size-16" />
          <h2 className="mt-3 truncate text-sm font-semibold" title={node.name}>{node.kind === "drive" ? driveCaption(node) : shownName(node.name, node.kind, showExt)}</h2>
          <p className="mt-1 text-xs text-muted">{typeLabel(node)}</p>
          <p className="mt-3 text-sm">{node.kind === "file" ? formatSize(node.bytes) : shownSize(node.bytes, node.approx) || "Folder"}</p>
          {node.note && <p className="mt-2 text-sm text-muted">{node.note}</p>}
        </>
      ) : (
        <p className="text-sm text-muted">Select a file to preview it.</p>
      )}
    </aside>
  );
}

function PaneView({ index }: { index: 0 | 1 }) {
  const state = useFiles();
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
  const snap = { nodes, order };
  const drive = driveOf(snap, pane.pathId);
  const freePct = drive?.capacity ? Math.round(((drive.free ?? 0) / drive.capacity) * 100) : 0;
  const chain = pathIds(snap, pane.pathId);
  const max = barScale(view.rows);
  const hiddenCount = view.total - view.rows.length;
  const md = useMinWidth(768);
  const lg = useMinWidth(1024);
  const cols = { ...defaultColumns, ...state.columns };
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
      <div className="flex items-center gap-1 border-b border-line bg-header px-1">
        <IconButton label="Back" disabled={!pane.back.length} onClick={() => useFiles.getState().goBack(index)}><ChevronLeft className="size-4" /></IconButton>
        <IconButton label="Forward" disabled={!pane.forward.length} onClick={() => useFiles.getState().goForward(index)}><ChevronRight className="size-4" /></IconButton>
        <IconButton label="Up" onClick={() => useFiles.getState().goUp(index)}><ArrowUp className="size-4" /></IconButton>
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
          <TreeBranch id="pc" depth={0} pane={index} />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="min-h-0 min-w-0 flex-1 overflow-auto"
          onContextMenu={(e) => {
            e.preventDefault();
            useFiles.getState().setActive(index);
            useFiles.getState().openMenu({ x: e.clientX, y: e.clientY, id: null });
          }}
        >
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
              {view.rows.map((row) => {
                const selected = pane.selected.includes(row.id);
                const pct = barPercent(row.bytes, max, barMode);
                const cut = clipboard?.mode === "cut" && row.nodeId && clipboard.ids.includes(row.nodeId);
                const kind = typeLabel(row.nodeId && nodes[row.nodeId] ? nodes[row.nodeId] : ({ kind: row.kind, name: row.name } as FsNode));
                const when = formatWhen(row.modified, state.dateFormat, state.timeFormat);
                return (
                  <tr
                    key={row.id}
                    data-row={row.id}
                    draggable={Boolean(row.nodeId)}
                    aria-selected={selected}
                    className={
                      (state.compact ? "" : " ") +
                      (selected ? "bg-select" : "hover:bg-header") +
                      (cut ? " opacity-50" : "")
                    }
                    onClick={(e) => {
                      const ids = view.rows.map((item) => item.id);
                      if (e.shiftKey) useFiles.getState().selectRange(index, row.id, ids);
                      else if (e.metaKey || e.ctrlKey) useFiles.getState().toggleSelect(index, row.id);
                      else useFiles.getState().selectOnly(index, row.id);
                    }}
                    onDoubleClick={() => openRow(row)}
                    onDragStart={(e) => {
                      if (!row.nodeId) return;
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
                    <td className="overflow-hidden px-2 py-1" style={columnBox(cols.size)} title={shownSize(row.bytes, row.approx) || "Not measured"}>
                      <span className="block truncate tabular-nums">{shownSize(row.bytes, row.approx)}</span>
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
            <IconBoard index={index} rows={view.rows} mode={state.viewMode} />
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
        {!state.detailsOpen && (
          <button type="button" className="shrink-0 underline" onClick={() => useFiles.getState().setOptions({ detailsOpen: true })}>
            Details
          </button>
        )}
        {drive && (
          <span className="flex shrink-0 items-center gap-2">
            <span className="tabular-nums">
              {drive.name.endsWith(":") ? driveCaption(drive) : drive.name}\ {drive.mounted === false ? "Not mounted" : `Mounted${drive.capacity ? ` · ${formatSize(drive.capacity)} (${freePct}% Free)` : ""}`}
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
  const extra = pane.selected.length > 1 ? ` +${pane.selected.length - 1}` : "";
  const flags = [node.hidden && "Hidden", node.readonly && "Read-only", node.system && "System"].filter(Boolean).join(", ") || "Normal";
  const place = displayPath({ nodes, order }, id);
  const note = node.note?.trim() ? node.note : "No note. Click to add one.";
  const openNote = () => useFiles.getState().openReader(node.id);
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
        <div className="min-w-0 flex-1 truncate font-semibold" title={node.kind === "drive" ? driveCaption(node) : node.name}>{node.kind === "drive" ? driveCaption(node) : node.name}{extra}</div>
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
      <div className="flex flex-wrap gap-x-3">
        <span className="tabular-nums">{shownSize(node.bytes, node.approx) || "Not measured"}</span>
        {node.kind === "drive" && <span>{node.mounted === false ? "Not mounted" : "Mounted"}</span>}
        <span className="text-muted">{flags}</span>
      </div>
      <div className="break-all text-muted" title={place}>{place}</div>
      <button type="button" className="min-h-11 w-full whitespace-pre-wrap break-words text-left hover:underline" title={node.note || "Add a note"} onClick={openNote}>
        {note}
      </button>
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

function Dialogs() {
  const dialog = useFiles((s) => s.dialog);
  const nodes = useFiles((s) => s.nodes);
  const [text, setText] = useState("");
  useEffect(() => {
    if (dialog?.kind === "rename") setText(dialog.name);
    else if (dialog?.kind === "new") setText(dialog.file ? "New file.txt" : "New folder");
    else if (dialog?.kind === "preview") setText(dialog.body);
    else if (dialog?.kind === "goto") setText("C:\\");
    else if (dialog?.kind === "custom") setText("");
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-scrim p-4" onMouseDown={() => useFiles.getState().openDialog(null)}>
      <div role="dialog" aria-modal="true" className={"w-full border border-line bg-pane p-4 shadow-lg " + (dialog.kind === "compare" ? "max-w-3xl" : dialog.kind === "search" || dialog.kind === "operation" ? "max-w-2xl" : "max-w-lg")} onMouseDown={(e) => e.stopPropagation()}>
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
            <p className="mt-2 text-sm text-muted">Dual-pane file window. Open folder reads one real folder in Chrome or Edge. The desktop app reads the drives on the computer it runs on. Until a real folder is open, you are looking at the practice catalog.</p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>Enter opens. Backspace goes up. F5 refreshes. F2 renames. Delete removes.</li>
              <li>Ctrl+Z undoes the last practice-catalog change. Changes on a real disk are not undone.</li>
              <li>Ctrl+C / X / V copy, cut, and paste. Ctrl+Shift+C copies the location. Ctrl+A selects the folder.</li>
              <li>F6 switches panes. Ctrl+F opens Find. Drag a row to the other pane to move it, or hold Ctrl to copy.</li>
              <li>Paste asks when a name is already there: keep both, rename the old one to .old, overwrite, update newer files, or skip.</li>
              <li>Ctrl+Shift+F searches the catalog. Starred jumps to system and user folders in this catalog.</li>
              <li>Measure fills folder sizes. On a real disk it walks the folders in view, and a folder that is too large stays blank.</li>
              <li>Two panes stacks a second folder. Gaps tints names the other pane lacks. Copy missing adds those names. Update other also replaces files that are older than this pane.</li>
              <li>All files lists every file under the folder, sorted by size. Close the banner to go back.</li>
              <li>Find → Pattern selects a pattern such as *.sys or over 100MB and leaves the rest of the folder on screen.</li>
              <li>Flags on Home or Find can show only hidden, read-only, or system files, hide one of those, or show everything.</li>
              <li>The strip beside the list shows size, flags, location, and the note. Click the note to open the reading pane. Right-click to create a folder or a file.</li>
              <li>View → Restore sample puts the practice catalog back. Sort choices stay with each pane.</li>
            </ul>
            <div className="mt-3 flex justify-end">
              <button type="button" className="min-h-11 bg-accent px-3 text-accent-ink" onClick={() => useFiles.getState().openDialog(null)}>Close</button>
            </div>
          </div>
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
  if (!node) return null;
  const snap = { nodes, order };
  const kids = node.kind === "file" ? 0 : childrenOf(snap, id).length;
  const rows: Array<[string, string]> = [
    ["Name", node.kind === "drive" ? driveCaption(node) : node.name],
    ["Type", typeLabel(node)],
    ["Location", displayPath(snap, id)],
    ["Size", shownSize(node.bytes, node.approx) || "Not measured"],
    ["Mounted", node.kind === "drive" ? (node.mounted === false ? "Not mounted" : "Mounted") : "—"],
    ["Contains", node.kind === "file" ? "—" : `${kids} direct items`],
    ["Modified", formatDate(node.modified)],
    ["Flags", [node.hidden && "Hidden", node.readonly && "Read-only", node.system && "System"].filter(Boolean).join(", ") || "Normal"],
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
        {node && node.kind !== "file" && item(state.favorites.includes(id!) ? "Unpin" : "Pin", () => state.toggleFavorite(id!), <Star className="size-4" />)}
        {node?.kind === "file" && node.name.toLowerCase().endsWith(".iso") && item("Mount image", () => void state.mountImage(node.id), <HardDrive className="size-4" />)}
        {node?.kind === "drive" && !node.system && node.mounted !== false && item("Unmount", () => state.openDialog({ kind: "unmount", id: node.id }), <Unplug className="size-4" />)}
        {node?.kind === "drive" && !node.system && node.mounted !== false && node.name.endsWith(":") && item("Format", () => state.openDialog({ kind: "format", id: node.id }), <Trash2 className="size-4" />)}
        {item("Refresh", () => state.refresh(), <RefreshCw className="size-4" />)}
        {item("Save snapshot", () => state.takeSnapshot(), <History className="size-4" />)}
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
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-line bg-header px-2 text-xs">
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

export function FileManager() {
  const split = useFiles((s) => s.split);
  const dark = useFiles((s) => s.dark);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
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
    let savedNodes = useFiles.getState().nodes;
    let savedOrder = useFiles.getState().order;
    let savedSeq = useFiles.getState().seq;
    let samplePaths: [string, string] = [
      useFiles.getState().panes[0].pathId,
      useFiles.getState().panes[1].pathId,
    ];
    return useFiles.subscribe((state) => {
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
        uiRev: 2,
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
    });
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
      if (e.key === "Backspace") {
        e.preventDefault();
        store.goUp();
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
        if (next) document.querySelector(`[data-pane="${index}"] [data-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
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
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-app text-ink">
      <header className="flex h-8 shrink-0 items-center px-3">
        <h1 className="text-xs font-semibold">Data Finder</h1>
      </header>
      <TabRow />
      <Ribbon />
      <div className="relative flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {split ? (
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
