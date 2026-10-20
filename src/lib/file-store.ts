import { create } from "zustand";
import { diskCreate, diskPath, diskRemoveNamed, diskRename, diskTransfer, fetchDrives, forgetDisk, formatVolume, isDesktop, isDiskId, knownFolders, listSnapshots, loadChildren, loadDesktopComputer, mapNetwork, measurePath, mountImage, mountVolume, openDiskFile, pickFolder, removeSnapshot, restoreSnapshot, saveSnapshot, setDiskPath, unmountVolume, type DiskJob, type DiskSnapshot, type KnownFolder } from "@/lib/disk";
import {
  childrenOf,
  cloneSubtree,
  createSeed,
  displayPath,
  driveOf,
  formatDate,
  formatSize,
  fillFolderSizes,
  searchNodes,
  shadows,
  subtreeBytes,
  typeLabel,
  resolvePath,
  type FsNode,
  type FsSnapshot,
  type ShadowCopy,
} from "@/lib/vfs";

export type ColumnWidths = {
  name: number;
  size: number;
  viz: number;
  type: number;
  date: number;
  h: number;
  r: number;
  s: number;
};

export const defaultColumns: ColumnWidths = {
  name: 280,
  size: 88,
  viz: 140,
  type: 112,
  date: 176,
  h: 76,
  r: 96,
  s: 76,
};

const columnLimits: Record<keyof ColumnWidths, [number, number]> = {
  name: [120, 720],
  size: [64, 240],
  viz: [48, 480],
  type: [72, 280],
  date: [110, 420],
  h: [76, 180],
  r: [96, 180],
  s: [76, 180],
};

export function clampColumn(key: keyof ColumnWidths, value: number) {
  const [min, max] = columnLimits[key];
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function clampDetail(kind: "height" | "width", value: number) {
  const [min, max] = kind === "height" ? [72, 480] : [160, 480];
  return Math.round(Math.max(min, Math.min(max, value)));
}

export function columnsFrom(saved: Partial<ColumnWidths> | undefined, current: ColumnWidths): ColumnWidths {
  const next = { ...defaultColumns, ...current };
  (Object.keys(defaultColumns) as (keyof ColumnWidths)[]).forEach((key) => {
    const raw = saved?.[key];
    next[key] = clampColumn(key, typeof raw === "number" ? raw : next[key]);
  });
  return next;
}

export type SortKey = "name" | "size" | "type" | "date";
export type RibbonTab = "home" | "inspect" | "tools" | "options" | "resources" | "recovery" | "keeps" | "decrypt";
export type BarMode = "linear" | "log";
export type FindColumn = "name" | "size" | "type" | "date";
export type DateFormat = "mdy" | "ymd" | "dmy";
export type TimeFormat = "12" | "24" | "none";
export type FilterGroup = "" | "docs" | "programs" | "images" | "audio" | "video" | "archives";
export type ConflictPolicy = "old" | "overwrite" | "newer" | "skip" | "alongside";
export type TransferStatus = "Running" | "Succeeded" | "Aborted" | "Paused" | "Ignored";

export type DialogState =
  | null
  | { kind: "new"; file: boolean; parentId?: string }
  | { kind: "rename"; id: string; name: string }
  | { kind: "props"; id: string }
  | { kind: "delete"; ids: string[] }
  | { kind: "preview"; title: string; body: string; id?: string }
  | { kind: "help" }
  | { kind: "compare"; leftId: string; rightId: string }
  | { kind: "counter" }
  | { kind: "custom" }
  | { kind: "goto" }
  | { kind: "collision"; ids: string[]; dest: string; mode: "copy" | "move"; names: string[] }
  | { kind: "search" }
  | { kind: "operation" }
  | { kind: "mask" }
  | { kind: "restore" }
  | { kind: "unmount"; id: string }
  | { kind: "format"; id: string }
  | { kind: "network"; location: boolean }
  | { kind: "snaps" }
  | { kind: "snap-user" }
  | { kind: "snap-dest" }
  | { kind: "earlier" };

export interface SearchRequest {
  query?: string;
  path?: string;
  exts?: string[];
  hidden?: boolean;
  readonly?: boolean;
  system?: boolean;
  minBytes?: number;
  maxDays?: number;
  notes?: boolean;
  exclude?: string;
}

export interface PaneModel {
  pathId: string;
  selected: string[];
  anchor: string | null;
  back: string[];
  forward: string[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  query: string;
  flat: boolean;
  notice?: string;
}

export type ViewMode = "xlarge" | "large" | "medium" | "small" | "list" | "details" | "tiles" | "content";

export type Visibility =
  | "all"
  | "only-hidden"
  | "only-readonly"
  | "only-system"
  | "hide-hidden"
  | "hide-readonly"
  | "hide-system"
  | "hide-marked";

export interface Filters {
  showHidden: boolean;
  showReadonly: boolean;
  showSystem: boolean;
  showBlocked: boolean;
  kind: "all" | "dir" | "file";
  ext: string;
  attr: "any" | "h" | "r" | "s";
  minBytes: number;
  maxAgeDays: number;
  findColumn: FindColumn;
  exclude: string;
  highlight: boolean;
  group: FilterGroup;
}

export function flagVisible(
  node: { hidden?: boolean; readonly?: boolean; system?: boolean; kind?: string; blocked?: boolean },
  flags: { showHidden?: boolean; showReadonly?: boolean; showSystem?: boolean; showBlocked?: boolean },
) {
  if (node.kind === "drive" || node.kind === "computer") return true;
  if (node.hidden && flags.showHidden === false) return false;
  if (node.readonly && flags.showReadonly === false) return false;
  if (node.system && flags.showSystem === false) return false;
  if (node.blocked && flags.showBlocked === false) return false;
  return true;
}

export interface Transfer {
  id: string;
  n: number;
  op: "Copy" | "Move" | "Restore";
  source: string;
  destination: string;
  sourceId: string;
  destId: string;
  sourceIds: string[];
  mode: "copy" | "move" | "restore";
  shadowId?: string;
  bytes: number;
  speed: number;
  progress: number;
  status: TransferStatus;
  elapsed: number;
  policy: string;
  policyId: ConflictPolicy;
  done: boolean;
  label: string;
}

export interface ListRow {
  id: string;
  name: string;
  bytes: number | null;
  modified: number;
  hidden: boolean;
  readonly: boolean;
  system: boolean;
  kind: FsNode["kind"];
  approx?: boolean;
  blocked?: boolean;
  nodeId?: string;
  path?: string;
  note?: string;
  onlyHere?: boolean;
  dupe?: boolean;
  hit?: boolean;
}

interface Clipboard {
  mode: "copy" | "cut";
  ids: string[];
}

interface FileState extends FsSnapshot {
  panes: [PaneModel, PaneModel];
  active: 0 | 1;
  split: boolean;
  diff: boolean;
  dupes: boolean;
  barMode: BarMode;
  calcDirs: boolean;
  dark: boolean;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  reading: boolean;
  tab: RibbonTab;
  filters: Filters;
  favorites: string[];
  recent: string[];
  clipboard: Clipboard | null;
  dragIds: string[] | null;
  status: string;
  measuring: boolean;
  measureToken: number;
  dialog: DialogState;
  menu: null | { x: number; y: number; id: string | null };
  logOpen: boolean;
  log: string[];
  transfersOpen: boolean;
  transfers: Transfer[];
  transferSel: string | null;
  searchPane: 0 | 1 | null;
  searchQuery: string;
  searchScope: "folder" | "computer";
  searchHits: string[];
  shadowPane: 0 | 1 | null;
  shadowId: string | null;
  seq: number;
  transferSeq: number;
  undoStack: UndoSnap[];
  columns: ColumnWidths;
  detailHeight: number;
  detailWidth: number;
  detailsOpen: boolean;
  snaps: Array<ShadowCopy & { path: string }>;
  viewMode: ViewMode;
  showNav: boolean;
  compact: boolean;
  itemChecks: boolean;
  showExt: boolean;
  previewOpen: boolean;
  uiRev: number;
  helpPage: "manual" | "about";
  helpQuery: string;
  showAllDrives: boolean;
  pins: string[];
  pinsOpen: [boolean, boolean];
  recentPaths: string[];
  quickPlaces: KnownFolder[];
  readerId: string | null;
}

const defaultFilters: Filters = {
  showHidden: false,
  showReadonly: true,
  showSystem: true,
  showBlocked: false,
  kind: "all",
  ext: "",
  attr: "any",
  minBytes: 0,
  maxAgeDays: 0,
  findColumn: "name",
  exclude: "",
  highlight: false,
  group: "",
};

function pane(pathId = "c"): PaneModel {
  return {
    pathId,
    selected: [],
    anchor: null,
    back: [],
    forward: [],
    sortKey: "name",
    sortDir: "asc",
    query: "",
    flat: false,
  };
}

function containsId(snap: FsSnapshot, ancestor: string, id: string) {
  let cur: FsNode | undefined = snap.nodes[id];
  while (cur) {
    if (cur.id === ancestor) return true;
    cur = cur.parentId ? snap.nodes[cur.parentId] : undefined;
  }
  return false;
}

function logLine(message: string) {
  const stamp = new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return `${stamp}  ${message}`;
}

function uniqueName(nodes: Record<string, FsNode>, order: Record<string, string[]>, parent: string, name: string) {
  const used = new Set((order[parent] ?? []).map((id) => nodes[id]?.name.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 2;
  while (used.has(`${stem} (${i})${ext}`.toLowerCase())) i += 1;
  return `${stem} (${i})${ext}`;
}

function remember(recent: string[], id: string) {
  return [...recent.filter((item) => item !== id), id].slice(-40);
}

const seed = createSeed();
const sizedSeed = { ...seed, nodes: fillFolderSizes(seed.nodes, seed.order) };

function mergeDrives(current: { nodes: Record<string, FsNode>; order: Record<string, string[]>; panes: [PaneModel, PaneModel]; pins: string[]; recentPaths: string[] }, fresh: FsNode[]) {
  let nodes = { ...current.nodes };
  let order = { ...current.order };
  const oldIds = (order.pc ?? []).filter((item) => isDiskId(item) && nodes[item]?.kind === "drive");
  const used = new Set<string>();
  const kept: string[] = [];
  for (const oldId of oldIds) {
    const old = nodes[oldId];
    const match = fresh.find((node) => !used.has(node.id) && node.name.toLowerCase() === old.name.toLowerCase());
    if (!match) {
      const cleaned = dropLoaded(nodes, order, oldId);
      nodes = cleaned.nodes;
      order = cleaned.order;
      delete nodes[oldId];
      forgetDisk(oldId);
      continue;
    }
    used.add(match.id);
    const nextPath = diskPath(match.id);
    if (nextPath) setDiskPath(oldId, nextPath);
    forgetDisk(match.id);
    nodes[oldId] = {
      ...old,
      name: match.name,
      mounted: match.mounted,
      capacity: match.capacity,
      free: match.free,
      note: match.note,
      label: match.label,
      system: match.system,
    };
    kept.push(oldId);
  }
  for (const node of fresh) {
    if (used.has(node.id)) continue;
    nodes[node.id] = node;
    kept.push(node.id);
  }
  order = { ...order, pc: kept };
  const letters = new Set(fresh.filter((node) => node.name.endsWith(":")).map((node) => node.name.toLowerCase()));
  const onDisk = (path: string) => {
    const match = /^([a-zA-Z]:)/.exec(path);
    if (!match) return true;
    return letters.has(match[1].toLowerCase());
  };
  const panes = current.panes.map((pane) => {
    const pathId = nodes[pane.pathId] ? pane.pathId : "pc";
    return {
      ...pane,
      pathId,
      selected: pane.selected.filter((item) => nodes[item]),
      anchor: pane.anchor && nodes[pane.anchor] ? pane.anchor : null,
    };
  }) as [PaneModel, PaneModel];
  return {
    nodes,
    order,
    panes,
    pins: current.pins.filter(onDisk),
    recentPaths: current.recentPaths.filter(onDisk),
  };
}

async function refreshDriveStats(announce: boolean) {
  if (!isDesktop()) return;
  try {
    const fresh = await fetchDrives();
    if (fresh.length === 0) return;
    useFiles.setState((current) => {
      const merged = mergeDrives(current, fresh);
      return announce ? { ...merged, status: "Drives updated" } : merged;
    });
  } catch (error) {
    if (announce) useFiles.setState({ status: error instanceof Error ? error.message : "Could not refresh drive sizes" });
  }
}

async function measureDirs(folder: string, token: number, ids: string[]) {
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (!measureStill(folder, token)) return;
      const index = cursor;
      cursor += 1;
      if (index >= ids.length) return;
      const id = ids[index];
      const path = diskPath(id);
      if (!path) continue;
      try {
        const exact = await measurePath(path);
        if (!measureStill(folder, token)) return;
        useFiles.setState((state) => {
          const current = state.nodes[id];
          if (!current) return {};
          return {
            nodes: {
              ...state.nodes,
              [id]: { ...current, bytes: exact.blocked ? null : exact.bytes, approx: !exact.exact, blocked: exact.blocked },
            },
          };
        });
      } catch {
        /* keep the size already shown */
      }
    }
  };
  await Promise.all([worker(), worker()]);
  if (!measureStill(folder, token)) return;
  useFiles.setState((state) => {
    const nodes = { ...state.nodes };
    let sum = 0;
    let complete = true;
    for (const id of state.order[folder] ?? []) {
      const node = nodes[id];
      if (!node) continue;
      if (node.bytes == null) complete = false;
      else sum += node.bytes;
      if (node.approx || node.blocked) complete = false;
    }
    if (nodes[folder] && nodes[folder].kind !== "computer" && nodes[folder].kind !== "drive") {
      nodes[folder] = { ...nodes[folder], bytes: sum, approx: !complete };
    }
    return { nodes, measuring: false, status: `Sizes updated · ${displayPath(state, folder)}` };
  });
}

export interface UiPrefs {
  split?: boolean;
  diff?: boolean;
  dupes?: boolean;
  barMode?: BarMode;
  calcDirs?: boolean;
  dark?: boolean;
  dateFormat?: DateFormat;
  timeFormat?: TimeFormat;
  reading?: boolean;
  favorites?: string[];
  recent?: string[];
  filters?: Partial<Filters>;
  flat?: [boolean, boolean];
  columns?: Partial<ColumnWidths>;
  paths?: [string, string];
  catalog?: CatalogSnap;
  detailHeight?: number;
  detailWidth?: number;
  detailsOpen?: boolean;
  viewMode?: ViewMode;
  showNav?: boolean;
  compact?: boolean;
  itemChecks?: boolean;
  showExt?: boolean;
  previewOpen?: boolean;
  snaps?: Array<ShadowCopy & { path: string }>;
  pins?: string[];
  pinsOpen?: boolean | [boolean, boolean];
  recentPaths?: string[];
  showAllDrives?: boolean;
  uiRev?: number;
  sort?: [{ key: SortKey; dir: "asc" | "desc" }, { key: SortKey; dir: "asc" | "desc" }];
}

export interface CatalogSnap {
  nodes: Record<string, FsNode>;
  order: Record<string, string[]>;
  seq: number;
}

interface Actions {
  setActive: (index: 0 | 1) => void;
  setTab: (tab: RibbonTab) => void;
  setHelpPage: (page: "manual" | "about") => void;
  setHelpQuery: (query: string) => void;
  setShowAllDrives: (on: boolean) => void;
  setPinsOpen: (index: 0 | 1, open: boolean) => void;
  rememberPath: (path: string) => void;
  reloadDrives: () => Promise<void>;
  saveUserSnapshot: (folder?: string) => Promise<void>;
  toggleSplit: () => void;
  toggleDiff: () => void;
  toggleDupes: () => void;
  toggleBarMode: () => void;
  toggleHidden: () => void;
  setFilters: (patch: Partial<Filters>) => void;
  clearFilters: () => void;
  setOptions: (patch: Partial<Pick<FileState, "calcDirs" | "dark" | "dateFormat" | "timeFormat" | "reading" | "barMode" | "detailsOpen" | "viewMode" | "showNav" | "compact" | "itemChecks" | "showExt" | "previewOpen">>) => void;
  setColumn: (key: keyof ColumnWidths, width: number) => void;
  setDetailSize: (patch: { height?: number; width?: number }) => void;
  navigate: (index: 0 | 1, id: string, push?: boolean) => void;
  goUp: (index?: 0 | 1) => void;
  goBack: (index?: 0 | 1) => void;
  goForward: (index?: 0 | 1) => void;
  refresh: (index?: 0 | 1) => void;
  selectOnly: (index: 0 | 1, id: string) => void;
  toggleSelect: (index: 0 | 1, id: string) => void;
  selectRange: (index: 0 | 1, id: string, visible: string[]) => void;
  selectIds: (index: 0 | 1, ids: string[]) => void;
  selectAll: (index: 0 | 1, visible: string[]) => void;
  invertSelection: (index: 0 | 1, visible: string[]) => void;
  moveSelection: (index: 0 | 1, dir: 1 | -1, visible: string[]) => void;
  setQuery: (index: 0 | 1, query: string) => void;
  setSort: (index: 0 | 1, key: SortKey) => void;
  openDialog: (dialog: DialogState) => void;
  saveNote: (id: string, body: string) => void;
  openMenu: (menu: FileState["menu"]) => void;
  toggleLog: () => void;
  toggleTransfers: () => void;
  toggleFavorite: (id?: string) => void;
  newItem: (name: string, file: boolean, parentId?: string) => void;
  rename: (id: string, name: string) => void;
  remove: (ids: string[]) => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
  transferTo: (ids: string[], dest: string, mode: "copy" | "move", opts?: { policy?: ConflictPolicy; log?: boolean }) => void;
  selectTransfer: (id: string) => void;
  abortTransfer: (id?: string) => void;
  pauseTransfer: (id?: string) => void;
  repeatTransfer: (id?: string) => void;
  ignoreTransfer: (id?: string) => void;
  jumpTransfer: (which: "source" | "dest", id?: string) => void;
  setDrag: (ids: string[] | null) => void;
  calcSizes: (index?: 0 | 1) => void;
  openItem: (index: 0 | 1, id: string) => void;
  reveal: (index: 0 | 1, id: string) => void;
  runSearch: (query?: string | SearchRequest) => void;
  setSearchScope: (scope: "folder" | "computer") => void;
  clearSearch: () => void;
  openShadow: (index: 0 | 1, shadowId: string) => void;
  clearShadow: () => void;
  restoreShadow: (shadowId?: string) => void;
  takeSnapshot: () => void;
  saveSnapshotTo: (folder: string) => Promise<void>;
  mirror: () => void;
  syncOther: () => void;
  toggleFlat: (index?: 0 | 1) => void;
  selectMask: (pattern: string) => void;
  undo: () => void;
  copyPath: (id?: string) => void;
  compare: () => void;
  restoreSample: () => void;
  openReader: (id: string | null) => void;
  openFolder: (index?: 0 | 1) => Promise<void>;
  unmountDrive: (id?: string) => Promise<void>;
  mountImage: (id: string) => Promise<void>;
  formatDrive: (id: string, filesystem: string, label: string) => Promise<void>;
  openTypedPath: (raw: string) => Promise<boolean>;
  hydrate: (prefs: UiPrefs) => void;
}

function policyText(policy: ConflictPolicy) {
  switch (policy) {
    case "old":
      return "Merge with existing content [rename existing to .old]";
    case "overwrite":
      return "Merge with existing content [overwrite existing]";
    case "newer":
      return "Merge with existing content [update only if source is newer]";
    case "skip":
      return "Merge with existing content [skip existing]";
    default:
      return "Paste alongside [generate new names]";
  }
}

function removeSubtree(nodes: Record<string, FsNode>, order: Record<string, string[]>, id: string) {
  const drop = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (drop.has(cur) || !nodes[cur]) continue;
    drop.add(cur);
    for (const child of order[cur] ?? []) stack.push(child);
  }
  for (const gone of drop) {
    delete nodes[gone];
    delete order[gone];
  }
  for (const key of Object.keys(order)) order[key] = order[key].filter((kid) => !drop.has(kid));
}

function renameOld(nodes: Record<string, FsNode>, order: Record<string, string[]>, id: string) {
  const node = nodes[id];
  if (!node?.parentId) return;
  let name = `${node.name}.old`;
  let i = 2;
  const taken = (candidate: string) =>
    (order[node.parentId!] ?? []).some((kid) => kid !== id && nodes[kid]?.name.toLowerCase() === candidate.toLowerCase());
  while (taken(name)) {
    name = `${node.name}.old (${i})`;
    i += 1;
  }
  nodes[id] = { ...node, name };
}

const transferTimers = new Map<string, ReturnType<typeof setInterval>>();

function stopTimer(id: string) {
  const timer = transferTimers.get(id);
  if (timer) clearInterval(timer);
  transferTimers.delete(id);
}

function enqueueTransfer(
  set: (partial: Partial<FileState> | ((state: FileState) => Partial<FileState>)) => void,
  get: () => FileState,
  info: {
    op: Transfer["op"];
    source: string;
    destination: string;
    sourceId: string;
    destId: string;
    sourceIds: string[];
    mode: Transfer["mode"];
    shadowId?: string;
    bytes: number;
    policyId: ConflictPolicy;
  },
) {
  const id = `t${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const n = get().transferSeq;
  const row: Transfer = {
    id,
    n,
    progress: 8,
    speed: 0,
    elapsed: 0,
    done: false,
    status: "Running",
    policy: policyText(info.policyId),
    label: `${info.op} ${info.source}`,
    ...info,
  };
  set((state) => {
    const transfers = [...state.transfers, row].slice(-20);
    const keep = new Set(transfers.map((item) => item.id));
    for (const timerId of transferTimers.keys()) {
      if (!keep.has(timerId)) stopTimer(timerId);
    }
    return { transfersOpen: true, transferSeq: state.transferSeq + 1, transferSel: id, transfers };
  });
  let elapsed = 0;
  let tick = Date.now();
  const timer = setInterval(() => {
    const current = get().transfers.find((item) => item.id === id);
    const now = Date.now();
    if (!current || current.status === "Aborted" || current.status === "Ignored") {
      stopTimer(id);
      return;
    }
    if (current.status === "Paused") {
      tick = now;
      return;
    }
    elapsed += now - tick;
    tick = now;
    const progress = Math.min(100, current.progress + 23);
    const done = progress >= 100;
    const speed = elapsed > 0 ? (info.bytes * (progress / 100)) / (elapsed / 1000) : 0;
    set((state) => ({
      transfers: state.transfers.map((item) => {
        if (item.id !== id) return item;
        if (item.status === "Aborted" || item.status === "Ignored" || item.status === "Paused") return item;
        return { ...item, progress, elapsed, speed, done, status: done ? "Succeeded" : "Running" };
      }),
    }));
    if (done) stopTimer(id);
  }, 90);
  transferTimers.set(id, timer);
}

function selectedTransfer(state: FileState, id?: string) {
  const key = id ?? state.transferSel;
  return state.transfers.find((item) => item.id === key) ?? state.transfers[state.transfers.length - 1];
}

interface UndoSnap {
  label: string;
  nodes: Record<string, FsNode>;
  order: Record<string, string[]>;
  panes: [PaneModel, PaneModel];
  favorites: string[];
  recent: string[];
  seq: number;
}

function rememberUndo(state: FileState, label: string): UndoSnap[] {
  return [
    {
      label,
      nodes: state.nodes,
      order: state.order,
      panes: state.panes,
      favorites: state.favorites,
      recent: state.recent,
      seq: state.seq,
    },
    ...state.undoStack,
  ].slice(0, 30);
}

function nameClash(state: FileState, parent: string, name: string, ignore?: string) {
  return (state.order[parent] ?? []).some((id) => id !== ignore && state.nodes[id]?.name.toLowerCase() === name.toLowerCase());
}

function dropLoaded(nodes: Record<string, FsNode>, order: Record<string, string[]>, id: string) {
  const drop = new Set<string>();
  const stack = [...(order[id] ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (drop.has(cur)) continue;
    drop.add(cur);
    for (const child of order[cur] ?? []) stack.push(child);
  }
  const nextNodes = { ...nodes };
  const nextOrder: Record<string, string[]> = {};
  for (const [parent, kids] of Object.entries(order)) {
    if (drop.has(parent)) continue;
    nextOrder[parent] = parent === id ? [] : kids.filter((kid) => !drop.has(kid));
  }
  for (const gone of drop) delete nextNodes[gone];
  return { nodes: nextNodes, order: nextOrder };
}

const measureGen = new Map<string, number>();

function nextMeasure(folder: string) {
  const token = (measureGen.get(folder) ?? 0) + 1;
  measureGen.set(folder, token);
  return token;
}

function measureStill(folder: string, token: number) {
  return measureGen.get(folder) === token;
}

function savedDark() {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem("data-finder-ui");
    if (!raw) return false;
    return Boolean((JSON.parse(raw) as { dark?: boolean }).dark);
  } catch {
    return false;
  }
}

async function reloadDiskFolder(id: string) {
  const listed = await loadChildren(id);
  if (!listed) throw new Error("Could not read that folder");
  useFiles.setState((state) => {
    const cleaned = dropLoaded(state.nodes, state.order, id);
    const nodes = { ...cleaned.nodes, ...listed.nodes };
    const previous = new Map<string, FsNode>();
    for (const child of state.order[id] ?? []) {
      const node = state.nodes[child];
      if (node) previous.set(node.name.toLowerCase(), node);
    }
    for (const childId of listed.ids) {
      const child = nodes[childId];
      const old = child ? previous.get(child.name.toLowerCase()) : undefined;
      if (child && old && child.kind !== "file" && child.bytes == null) {
        nodes[childId] = { ...child, bytes: old.bytes, approx: old.approx, blocked: old.blocked };
      }
    }
    const order = { ...cleaned.order, [id]: listed.ids };
    const panes = state.panes.map((pane) => {
      const pathId = nodes[pane.pathId] ? pane.pathId : nodes[id] ? id : "c";
      return { ...pane, pathId, selected: pane.selected.filter((item) => nodes[item]) };
    }) as [PaneModel, PaneModel];
    return { nodes, order, panes };
  });
}

async function applyFreshDrives(message: string) {
  const fresh = await fetchDrives();
  if (fresh.length === 0) throw new Error("Windows did not report a drive");
  useFiles.setState((current) => ({ ...mergeDrives(current, fresh), status: message }));
}

export const useFiles = create<FileState & Actions>((set, get) => ({
  ...sizedSeed,
  panes: [pane("c"), pane("c")],
  active: 0,
  split: false,
  diff: false,
  dupes: false,
  barMode: "linear",
  calcDirs: true,
  dark: savedDark(),
  dateFormat: "mdy",
  timeFormat: "12",
  reading: false,
  tab: "home",
  filters: { ...defaultFilters },
  favorites: ["c", "users", "downloads"],
  recent: ["c"],
  clipboard: null,
  dragIds: null,
  status: "Ready",
  measuring: false,
  measureToken: 0,
  dialog: null,
  menu: null,
  logOpen: false,
  log: [logLine("Workspace catalog ready")],
  transfersOpen: false,
  transfers: [],
  transferSel: null,
  searchPane: null,
  searchQuery: "",
  searchScope: "folder",
  searchHits: [],
  shadowPane: null,
  shadowId: null,
  seq: 1000,
  transferSeq: 1,
  undoStack: [],
  columns: { ...defaultColumns },
  detailHeight: 160,
  detailWidth: 224,
  detailsOpen: false,
  viewMode: "details",
  showNav: true,
  compact: false,
  itemChecks: false,
  showExt: true,
  previewOpen: false,
  uiRev: 3,
  helpPage: "manual",
  helpQuery: "",
  showAllDrives: false,
  pins: [],
  pinsOpen: [true, true],
  recentPaths: [],
  quickPlaces: [],
  snaps: [],
  readerId: null,

  setActive: (index) => set({ active: index }),
  setTab: (tab) => set({ tab }),
  setHelpPage: (helpPage) => set({ helpPage }),
  setHelpQuery: (helpQuery) => set({ helpQuery, helpPage: "manual" }),
  setShowAllDrives: (showAllDrives) => set({ showAllDrives, status: showAllDrives ? "Showing every drive" : "Showing mounted drives" }),
  setPinsOpen: (index, open) =>
    set((state) => {
      const pinsOpen: [boolean, boolean] = [state.pinsOpen[0], state.pinsOpen[1]];
      pinsOpen[index] = open;
      return { pinsOpen };
    }),
  rememberPath: (path) =>
    set((state) => ({
      recentPaths: [path, ...state.recentPaths.filter((item) => item.toLowerCase() !== path.toLowerCase())].slice(0, 12),
    })),
  reloadDrives: async () => {
    try {
      await applyFreshDrives("Drives updated");
    } catch (error) {
      set({ status: error instanceof Error ? error.message : "Could not refresh drives" });
    }
  },
  saveUserSnapshot: async (folder = "") => {
    const folders = get().pins.length ? get().pins : (await knownFolders()).map((folder) => folder.path);
    if (!folders.length) {
      set({ status: "No user folders were found", dialog: null });
      return;
    }
    set({ status: "Copying user folders into a snapshot. This can take a while.", dialog: null });
    try {
      const info = await saveSnapshot(folders, folder);
      set({ status: `User snapshot saved · ${info.files} file(s) · ${formatSize(info.bytes)}`, dialog: null, tab: "keeps" });
    } catch (error) {
      set({ status: error instanceof Error ? error.message : "Could not save that snapshot" });
    }
  },
  toggleSplit: () =>
    set((state) => {
      const split = !state.split;
      return {
        split,
        status: split ? "Two panes on" : "One pane",
        log: [...state.log, logLine(split ? "Second pane opened" : "Second pane closed")],
      };
    }),
  toggleDiff: () => set((state) => ({ diff: !state.diff, status: state.diff ? "Gap marks off" : "Gap marks on — names missing from the other pane are tinted" })),
  toggleDupes: () => set((state) => ({ dupes: !state.dupes, status: state.dupes ? "Same-size marks off" : "Same-size files are marked" })),
  toggleBarMode: () => set((state) => ({ barMode: state.barMode === "linear" ? "log" : "linear" })),
  toggleHidden: () => set((state) => ({ filters: { ...state.filters, showHidden: !state.filters.showHidden } })),
  setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
  clearFilters: () =>
    set((state) => ({
      filters: { ...defaultFilters },
      panes: state.panes.map((item) => ({ ...item, query: "" })) as [PaneModel, PaneModel],
      status: "Filters cleared",
    })),
  setOptions: (patch) => {
    set(patch);
    if (patch.calcDirs) {
      get().calcSizes(0);
      if (get().split) get().calcSizes(1);
    }
  },
  setColumn: (key, width) =>
    set((state) => ({ columns: { ...state.columns, [key]: clampColumn(key, width) } })),
  setDetailSize: (patch) =>
    set((state) => ({
      detailHeight: patch.height == null ? state.detailHeight : clampDetail("height", patch.height),
      detailWidth: patch.width == null ? state.detailWidth : clampDetail("width", patch.width),
    })),

  navigate: (index, id, push = true) => {
    const node = get().nodes[id];
    if (!node || node.kind === "file") return;
    if (node.kind === "drive" && node.mounted === false) {
      set({ status: `${node.name} is not mounted` });
      return;
    }
    if (isDiskId(id) && !Object.prototype.hasOwnProperty.call(get().order, id)) {
      set({ status: `Reading ${node.name}` });
      void loadChildren(id)
        .then((listed) => {
          if (!listed) {
            set({ status: "Could not read that folder" });
            return;
          }
          set((state) => ({
            nodes: { ...state.nodes, ...listed.nodes },
            order: { ...state.order, [id]: listed.ids },
          }));
          get().navigate(index, id, push);
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : "Could not read that folder";
          set((state) => {
            const panes = [...state.panes] as [PaneModel, PaneModel];
            panes[index] = { ...panes[index], notice: message };
            return { panes, status: message };
          });
        });
      return;
    }
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      const current = panes[index];
      panes[index] = {
        ...current,
        pathId: id,
        selected: [],
        anchor: null,
        back: push && current.pathId !== id ? [...current.back, current.pathId].slice(-50) : current.back,
        forward: push ? [] : current.forward,
        notice: "",
      };
      return {
        panes,
        active: index,
        menu: null,
        searchPane: state.searchPane === index ? null : state.searchPane,
        shadowPane: state.shadowPane === index ? null : state.shadowPane,
        shadowId: state.shadowPane === index ? null : state.shadowId,
        recent: remember(state.recent, id),
        status: displayPath(state, id),
      };
    });
    const opened = diskPath(id);
    if (opened) get().rememberPath(opened);
    if (node.kind === "computer") {
      void refreshDriveStats(true);
      return;
    }
    if (get().calcDirs) void get().calcSizes(index);
  },

  goUp: (index) => {
    const i = index ?? get().active;
    const parent = get().nodes[get().panes[i].pathId]?.parentId;
    if (parent) get().navigate(i, parent);
  },

  goBack: (index) => {
    const i = index ?? get().active;
    const current = get().panes[i];
    const prev = current.back[current.back.length - 1];
    if (!prev || !get().nodes[prev]) return;
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      const paneState = panes[i];
      const target = paneState.back[paneState.back.length - 1];
      if (!target) return {};
      panes[i] = {
        ...paneState,
        pathId: target,
        selected: [],
        anchor: null,
        back: paneState.back.slice(0, -1),
        forward: [...paneState.forward, paneState.pathId].slice(-50),
      };
      return { panes, active: i, recent: remember(state.recent, target), status: displayPath(state, target) };
    });
    if (get().calcDirs) void get().calcSizes(i);
  },

  goForward: (index) => {
    const i = index ?? get().active;
    const next = get().panes[i].forward.at(-1);
    if (!next || !get().nodes[next]) return;
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      const paneState = panes[i];
      const target = paneState.forward.at(-1);
      if (!target) return {};
      panes[i] = {
        ...paneState,
        pathId: target,
        selected: [],
        anchor: null,
        forward: paneState.forward.slice(0, -1),
        back: [...paneState.back, paneState.pathId].slice(-50),
      };
      return { panes, active: i, recent: remember(state.recent, target), status: displayPath(state, target) };
    });
    if (get().calcDirs) void get().calcSizes(i);
  },

  refresh: (index) => {
    const i = index ?? get().active;
    const id = get().panes[i].pathId;
    const node = get().nodes[id];
    if (!node || node.kind === "computer") {
      void refreshDriveStats(true);
      return;
    }
    if (isDiskId(id)) {
      void reloadDiskFolder(id)
        .then(() => {
          void refreshDriveStats(false);
          if (get().calcDirs) get().calcSizes(i);
          else set({ status: `Refreshed ${get().nodes[id]?.name ?? "folder"}` });
        })
        .catch((error: unknown) => set({ status: error instanceof Error ? error.message : "Could not refresh" }));
      return;
    }
    set((state) => ({ status: `Refreshed ${displayPath(state, state.panes[i].pathId)}` }));
    void get().calcSizes(i);
  },

  selectOnly: (index, id) =>
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      panes[index] = { ...panes[index], selected: [id], anchor: id };
      return { panes, active: index };
    }),

  toggleSelect: (index, id) =>
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      const selected = panes[index].selected.includes(id)
        ? panes[index].selected.filter((item) => item !== id)
        : [...panes[index].selected, id];
      panes[index] = { ...panes[index], selected, anchor: id };
      return { panes, active: index };
    }),

  selectRange: (index, id, visible) =>
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      const anchor = panes[index].anchor ?? panes[index].selected[0] ?? id;
      const a = visible.indexOf(anchor);
      const b = visible.indexOf(id);
      const [from, to] = a < b ? [a, b] : [b, a];
      const selected = a < 0 || b < 0 ? [id] : visible.slice(from, to + 1);
      panes[index] = { ...panes[index], selected, anchor };
      return { panes, active: index };
    }),

  selectIds: (index, ids) =>
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      panes[index] = { ...panes[index], selected: ids, anchor: ids[0] ?? panes[index].anchor };
      return { panes, active: index };
    }),

  selectAll: (index, visible) =>
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      panes[index] = { ...panes[index], selected: visible, anchor: visible[0] ?? null };
      return { panes, active: index };
    }),

  invertSelection: (index, visible) =>
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      const selected = new Set(panes[index].selected);
      const next = visible.filter((id) => !selected.has(id));
      panes[index] = { ...panes[index], selected: next, anchor: next[0] ?? null };
      return { panes, active: index, status: `${next.length} selected` };
    }),

  moveSelection: (index, dir, visible) => {
    if (!visible.length) return;
    const current = get().panes[index].selected[0];
    const at = Math.max(0, visible.indexOf(current ?? visible[0]));
    const next = visible[Math.min(visible.length - 1, Math.max(0, at + dir))];
    get().selectOnly(index, next);
  },

  setQuery: (index, query) =>
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      panes[index] = { ...panes[index], query };
      return { panes };
    }),

  setSort: (index, key) =>
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      const current = panes[index];
      panes[index] = {
        ...current,
        sortKey: key,
        sortDir: current.sortKey === key && current.sortDir === "asc" ? "desc" : "asc",
      };
      return { panes };
    }),

  openDialog: (dialog) => set({ dialog, menu: null }),
  saveNote: (id, body) =>
    set((state) => {
      const node = state.nodes[id];
      if (!node) return {};
      if (isDiskId(id)) {
        return {
          nodes: { ...state.nodes, [id]: { ...node, note: body } },
          dialog: null,
          status: `Saved ${node.name}`,
        };
      }
      return {
        nodes: fillFolderSizes(
          { ...state.nodes, [id]: { ...node, note: body, bytes: body.length, modified: Date.now() } },
          state.order,
        ),
        dialog: null,
        status: `Saved ${node.name}`,
        log: [...state.log, logLine(`Saved ${node.name}`)],
        undoStack: rememberUndo(state, `edit ${node.name}`),
      };
    }),
  openMenu: (menu) => set({ menu }),
  toggleLog: () => set((state) => ({ logOpen: !state.logOpen })),
  toggleTransfers: () => set((state) => ({ transfersOpen: !state.transfersOpen })),

  toggleFavorite: (id) =>
    set((state) => {
      const target = id ?? state.panes[state.active].pathId;
      const has = state.favorites.includes(target);
      return {
        favorites: has ? state.favorites.filter((item) => item !== target) : [...state.favorites, target],
        status: has ? "Removed from favorites" : "Added to favorites",
        log: [...state.log, logLine(has ? `Unpinned ${displayPath(state, target)}` : `Pinned ${displayPath(state, target)}`)],
      };
    }),

  newItem: (name, file, parentId) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const state = get();
    const requested = parentId ? state.nodes[parentId] : undefined;
    const parent = requested && requested.kind !== "file" ? requested.id : state.panes[state.active].pathId;
    if (!state.nodes[parent] || state.nodes[parent].kind === "file") return;
    if (isDiskId(parent)) {
      void (async () => {
        try {
          await diskCreate(parent, trimmed, file);
          await reloadDiskFolder(parent);
          const created = (get().order[parent] ?? []).find((item) => get().nodes[item]?.name === trimmed);
          set({ dialog: null, status: file ? `Created file ${trimmed}` : `Created folder ${trimmed}` });
          if (created) get().selectOnly(state.active, created);
        } catch (error) {
          set({ dialog: null, status: error instanceof Error ? error.message : "Could not create that item" });
        }
      })();
      return;
    }
    if (nameClash(state, parent, trimmed)) {
      set({ status: "An item with that name already exists" });
      return;
    }
    const id = `n${state.seq}`;
    const node: FsNode = {
      id,
      parentId: parent,
      name: trimmed,
      kind: file ? "file" : "dir",
      bytes: file ? 0 : 0,
      modified: Date.now(),
      hidden: false,
      readonly: false,
      system: false,
      note: file ? "" : undefined,
    };
    const order = { ...state.order, [parent]: [...(state.order[parent] ?? []), id] };
    set({
      seq: state.seq + 1,
      nodes: fillFolderSizes({ ...state.nodes, [id]: node }, order),
      order,
      dialog: null,
      status: file ? `Created file ${trimmed}` : `Created folder ${trimmed}`,
      log: [...state.log, logLine(file ? `Created file ${trimmed}` : `Created folder ${trimmed}`)],
      undoStack: rememberUndo(state, file ? `create ${trimmed}` : `create ${trimmed}`),
    });
    if (state.panes[state.active].pathId !== parent) get().navigate(state.active, parent);
    get().selectOnly(state.active, id);
  },

  rename: (id, name) => {
    const trimmed = name.trim();
    const state = get();
    const node = state.nodes[id];
    if (!trimmed || !node?.parentId) return;
    if (nameClash(state, node.parentId, trimmed, id)) {
      set({ status: "An item with that name already exists" });
      return;
    }
    if (isDiskId(id)) {
      const parent = node.parentId;
      void (async () => {
        try {
          await diskRename(id, trimmed);
          if (parent) await reloadDiskFolder(parent);
          set({ dialog: null, status: `Renamed to ${trimmed}` });
        } catch (error) {
          set({ dialog: null, status: error instanceof Error ? error.message : "Could not rename that item" });
        }
      })();
      return;
    }
    set((current) => ({
      nodes: { ...current.nodes, [id]: { ...current.nodes[id], name: trimmed, modified: Date.now() } },
      dialog: null,
      status: `Renamed to ${trimmed}`,
      log: [...current.log, logLine(`Renamed to ${trimmed}`)],
      undoStack: rememberUndo(current, `rename ${node.name}`),
    }));
  },

  remove: (ids) => {
    const blocked = ids.some((id) => {
      const node = get().nodes[id];
      return !node || node.kind === "drive" || node.kind === "computer";
    });
    if (blocked) {
      set({ status: "Drives cannot be deleted", dialog: null });
      return;
    }
    if (ids.some((id) => isDiskId(id))) {
      void (async () => {
        try {
          const parents = new Set<string>();
          for (const id of ids) {
            const node = get().nodes[id];
            if (!node?.parentId || !isDiskId(node.parentId)) throw new Error("That item cannot be deleted");
            await diskRemoveNamed(node.parentId, node.name, node.kind !== "file");
            parents.add(node.parentId);
          }
          for (const parent of parents) await reloadDiskFolder(parent);
          set({ dialog: null, status: `Deleted ${ids.length} item(s)` });
        } catch (error) {
          set({ dialog: null, status: error instanceof Error ? error.message : "Could not delete that item" });
        }
      })();
      return;
    }
    set((state) => {
      const drop = new Set<string>();
      const stack = [...ids];
      while (stack.length) {
        const id = stack.pop()!;
        if (drop.has(id)) continue;
        drop.add(id);
        for (const child of state.order[id] ?? []) stack.push(child);
      }
      const nodes = { ...state.nodes };
      const order: Record<string, string[]> = {};
      for (const [parent, kids] of Object.entries(state.order)) {
        if (drop.has(parent)) continue;
        order[parent] = kids.filter((kid) => !drop.has(kid));
      }
      for (const id of drop) delete nodes[id];
      const panes = state.panes.map((item) => {
        let pathId = item.pathId;
        if (!nodes[pathId]) pathId = "c";
        return { ...item, pathId, selected: item.selected.filter((id) => nodes[id]) };
      }) as [PaneModel, PaneModel];
      return {
        nodes: fillFolderSizes(nodes, order),
        order,
        panes,
        dialog: null,
        favorites: state.favorites.filter((id) => nodes[id]),
        recent: state.recent.filter((id) => nodes[id]),
        status: `Deleted ${ids.length} item(s)`,
        log: [...state.log, logLine(`Deleted ${ids.length} item(s)`)],
        undoStack: rememberUndo(state, `delete ${ids.length}`),
      };
    });
  },

  copy: () => {
    const state = get();
    const ids = state.panes[state.active].selected.filter((id) => state.nodes[id] && state.nodes[id].kind !== "drive");
    if (!ids.length) return;
    set({
      clipboard: { mode: "copy", ids },
      status: `Copied ${ids.length} item(s)`,
      log: [...state.log, logLine(`Copied ${ids.length} item(s)`)],
    });
  },

  cut: () => {
    const state = get();
    const ids = state.panes[state.active].selected.filter((id) => state.nodes[id] && state.nodes[id].kind !== "drive");
    if (!ids.length) return;
    set({
      clipboard: { mode: "cut", ids },
      status: `Cut ${ids.length} item(s)`,
      log: [...state.log, logLine(`Cut ${ids.length} item(s)`)],
    });
  },

  paste: () => {
    const state = get();
    if (!state.clipboard) {
      set({ status: "Nothing held" });
      return;
    }
    get().transferTo(state.clipboard.ids, state.panes[state.active].pathId, state.clipboard.mode === "cut" ? "move" : "copy");
  },

  transferTo: (ids, dest, mode, opts) => {
    const state = get();
    const destNode = state.nodes[dest];
    if (!destNode || destNode.kind === "file" || destNode.kind === "computer") {
      set({ status: "Pick a folder as the destination", dialog: null });
      return;
    }
    const moving = ids.filter((id) => {
      const node = state.nodes[id];
      return node && node.kind !== "drive" && node.kind !== "computer";
    });
    if (!moving.length) {
      set({ status: "Nothing to transfer", dialog: null });
      return;
    }
    if (moving.some((id) => containsId(state, id, dest))) {
      set({ status: "Cannot put a folder inside itself", dialog: null });
      return;
    }
    if (isDiskId(dest) && !Object.prototype.hasOwnProperty.call(state.order, dest)) {
      set({ status: "Reading destination" });
      void loadChildren(dest)
        .then((listed) => {
          if (!listed) {
            set({ status: "Could not read that folder", dialog: null });
            return;
          }
          set((current) => ({
            nodes: { ...current.nodes, ...listed.nodes },
            order: { ...current.order, [dest]: listed.ids },
          }));
          get().transferTo(ids, dest, mode, opts);
        })
        .catch((error: unknown) => {
          set({ status: error instanceof Error ? error.message : "Could not read that folder", dialog: null });
        });
      return;
    }
    const names: string[] = [];
    for (const id of moving) {
      const node = state.nodes[id];
      if (!node || (mode === "move" && node.parentId === dest)) continue;
      const clash = (state.order[dest] ?? []).some((kid) => {
        if (mode === "move" && kid === id) return false;
        return state.nodes[kid]?.name.toLowerCase() === node.name.toLowerCase();
      });
      if (clash) names.push(node.name);
    }
    if (names.length && !opts?.policy) {
      set({
        dialog: { kind: "collision", ids: moving, dest, mode, names },
        status: `${names.length} name${names.length === 1 ? "" : "s"} already in the destination`,
      });
      return;
    }
    const policy: ConflictPolicy = opts?.policy ?? "alongside";
    if (isDiskId(dest) || moving.some((id) => isDiskId(id))) {
      if (!isDiskId(dest) || moving.some((id) => !isDiskId(id))) {
        set({ status: "Real files only copy into another real folder", dialog: null });
        return;
      }
      const reserved = new Set((state.order[dest] ?? []).map((kid) => state.nodes[kid]?.name.toLowerCase()).filter((name): name is string => !!name));
      const jobs: DiskJob[] = [];
      let skipped = 0;
      for (const id of moving) {
        const src = state.nodes[id];
        if (!src) continue;
        if (mode === "move" && src.parentId === dest) {
          skipped += 1;
          continue;
        }
        const existingId = (state.order[dest] ?? []).find((kid) => {
          if (mode === "move" && kid === id) return false;
          return state.nodes[kid]?.name.toLowerCase() === src.name.toLowerCase();
        });
        let name = src.name;
        let renameClashId: string | undefined;
        let renameClashTo: string | undefined;
        if (existingId && reserved.has(name.toLowerCase())) {
          if (policy === "skip") {
            skipped += 1;
            continue;
          }
          if (policy === "newer" && src.modified <= (state.nodes[existingId]?.modified ?? 0)) {
            skipped += 1;
            continue;
          }
          if (policy === "alongside") {
            const dot = name.lastIndexOf(".");
            const stem = dot > 0 ? name.slice(0, dot) : name;
            const ext = dot > 0 ? name.slice(dot) : "";
            let n = 2;
            while (reserved.has(`${stem} (${n})${ext}`.toLowerCase())) n += 1;
            name = `${stem} (${n})${ext}`;
          } else if (policy === "old") {
            const existing = state.nodes[existingId];
            if (existing) {
              let oldName = `${existing.name}.old`;
              let n = 2;
              while (reserved.has(oldName.toLowerCase())) {
                oldName = `${existing.name}.old (${n})`;
                n += 1;
              }
              renameClashId = existingId;
              renameClashTo = oldName;
              reserved.delete(existing.name.toLowerCase());
              reserved.add(oldName.toLowerCase());
            }
          }
        }
        reserved.add(name.toLowerCase());
        jobs.push({ id, name, sourceName: src.name, parentId: src.parentId, renameClashId, renameClashTo });
      }
      if (!jobs.length) {
        set({ status: skipped ? `Skipped ${skipped} existing item(s)` : "Nothing changed", dialog: null });
        return;
      }
      const parents = new Set<string>([dest]);
      if (mode === "move") for (const job of jobs) if (job.parentId) parents.add(job.parentId);
      set({ status: `${mode === "move" ? "Moving" : "Copying"} ${jobs.length} item(s)`, dialog: null });
      void diskTransfer(jobs, dest, mode)
        .then(async () => {
          for (const parent of parents) {
            if (isDiskId(parent) && Object.prototype.hasOwnProperty.call(get().order, parent)) await reloadDiskFolder(parent);
          }
          set({
            clipboard: mode === "move" ? null : get().clipboard,
            dialog: null,
            status: `${mode === "move" ? "Moved" : "Copied"} ${jobs.length} item(s)${skipped ? `, skipped ${skipped}` : ""}`,
          });
        })
        .catch((error: unknown) => {
          set({ status: error instanceof Error ? error.message : "Could not transfer those files", dialog: null });
        });
      return;
    }
    let seq = state.seq;
    const alloc = () => `n${seq++}`;
    const nodes: Record<string, FsNode> = { ...state.nodes };
    const order: Record<string, string[]> = {};
    for (const [key, kids] of Object.entries(state.order)) order[key] = [...kids];
    let count = 0;
    let skipped = 0;
    let bytes = 0;
    for (const id of moving) {
      const src = state.nodes[id];
      if (!src) continue;
      if (mode === "move" && src.parentId === dest) {
        skipped += 1;
        continue;
      }
      const existingId = (order[dest] ?? []).find((kid) => {
        if (mode === "move" && kid === id) return false;
        return nodes[kid]?.name.toLowerCase() === src.name.toLowerCase();
      });
      let name = src.name;
      if (existingId) {
        if (policy === "skip") {
          skipped += 1;
          continue;
        }
        if (policy === "newer" && src.modified <= (nodes[existingId]?.modified ?? 0)) {
          skipped += 1;
          continue;
        }
        if (policy === "old") renameOld(nodes, order, existingId);
        else if (policy === "overwrite" || policy === "newer") removeSubtree(nodes, order, existingId);
        else name = uniqueName(nodes, order, dest, src.name);
      }
      if (mode === "move") {
        const live = nodes[id];
        if (!live?.parentId) continue;
        order[live.parentId] = (order[live.parentId] ?? []).filter((kid) => kid !== id);
        order[dest] = [...(order[dest] ?? []), id];
        nodes[id] = { ...live, parentId: dest, name };
        bytes += subtreeBytes({ nodes, order }, id).bytes;
        count += 1;
        continue;
      }
      const cloned = cloneSubtree(state, id, dest, alloc);
      const rootId = cloned.orderAdds.find(([parent]) => parent === dest)?.[1];
      if (!rootId || !cloned.nodes[rootId]) continue;
      cloned.nodes[rootId] = { ...cloned.nodes[rootId], name };
      Object.assign(nodes, cloned.nodes);
      for (const [parent, child] of cloned.orderAdds) order[parent] = [...(order[parent] ?? []), child];
      bytes += subtreeBytes({ nodes, order }, rootId).bytes;
      count += 1;
    }
    const verb = mode === "move" ? "Moved" : "Copied";
    const status = count
      ? `${verb} ${count} item(s)${skipped ? `, skipped ${skipped}` : ""}`
      : skipped
        ? `Skipped ${skipped} existing item(s)`
        : "Nothing changed";
    const source = moving.length === 1 ? displayPath(state, moving[0]) : `${displayPath(state, moving[0])} +${moving.length - 1}`;
    set({
      nodes: fillFolderSizes(nodes, order),
      order,
      seq,
      clipboard: mode === "move" && count ? null : state.clipboard,
      dragIds: null,
      dialog: null,
      status,
      log: opts?.log === false ? state.log : [...state.log, logLine(`${status} → ${displayPath({ nodes, order }, dest)}`)],
      undoStack: count ? rememberUndo(state, `${mode} ${count}`) : state.undoStack,
    });
    if (count) {
      enqueueTransfer(set, get, {
        op: mode === "move" ? "Move" : "Copy",
        source,
        destination: displayPath(state, dest),
        sourceId: moving[0],
        destId: dest,
        sourceIds: moving,
        mode,
        bytes,
        policyId: policy,
      });
    }
  },

  selectTransfer: (id) => set({ transferSel: id }),

  abortTransfer: (id) => {
    const row = selectedTransfer(get(), id);
    if (!row || row.done || (row.status !== "Running" && row.status !== "Paused")) {
      set({ status: "Nothing running to abort" });
      return;
    }
    stopTimer(row.id);
    set((state) => ({
      transferSel: row.id,
      status: "Transfer marked aborted. The catalog write already finished.",
      transfers: state.transfers.map((item) =>
        item.id === row.id ? { ...item, status: "Aborted", done: true } : item,
      ),
    }));
  },

  pauseTransfer: (id) => {
    const row = selectedTransfer(get(), id);
    if (!row) return;
    if (row.status === "Paused") {
      set((state) => ({
        status: "Transfer resumed",
        transfers: state.transfers.map((item) => (item.id === row.id ? { ...item, status: "Running" } : item)),
      }));
      return;
    }
    if (row.status !== "Running") {
      set({ status: "That transfer is already finished" });
      return;
    }
    set((state) => ({
      status: "Transfer paused",
      transfers: state.transfers.map((item) => (item.id === row.id ? { ...item, status: "Paused" } : item)),
    }));
  },

  ignoreTransfer: (id) => {
    const row = selectedTransfer(get(), id);
    if (!row || row.status === "Succeeded") {
      set({ status: "Nothing to ignore" });
      return;
    }
    stopTimer(row.id);
    set((state) => ({
      status: "Transfer ignored. The catalog write already finished.",
      transfers: state.transfers.map((item) =>
        item.id === row.id ? { ...item, status: "Ignored", done: true } : item,
      ),
    }));
  },

  repeatTransfer: (id) => {
    const row = selectedTransfer(get(), id);
    if (!row) {
      set({ status: "Select a transfer to repeat" });
      return;
    }
    if (row.mode === "restore" && row.shadowId) {
      get().restoreShadow(row.shadowId);
      return;
    }
    const live = row.sourceIds.filter((item) => get().nodes[item]);
    if (!live.length || !get().nodes[row.destId] || row.mode === "restore") {
      set({ status: "Cannot repeat — the source or destination is gone" });
      return;
    }
    get().transferTo(live, row.destId, row.mode, { policy: row.policyId });
  },

  jumpTransfer: (which, id) => {
    const row = selectedTransfer(get(), id);
    if (!row) return;
    const target = which === "source" ? row.sourceId : row.destId;
    const node = get().nodes[target];
    if (!node) {
      set({ status: "That location is gone" });
      return;
    }
    const folder = node.kind === "file" ? node.parentId : node.id;
    if (!folder || !get().nodes[folder]) return;
    const index = get().active;
    set({ searchPane: null, searchHits: [], shadowPane: null, shadowId: null });
    get().navigate(index, folder);
    if (node.kind === "file") get().selectOnly(index, node.id);
  },

  setDrag: (ids) => set({ dragIds: ids }),

  calcSizes: (index) => {
    const state = get();
    const i = index ?? state.active;
    const folder = state.panes[i].pathId;
    const node = state.nodes[folder];
    if (node?.kind === "computer") {
      void refreshDriveStats(true);
      return;
    }
    if (!state.calcDirs) return;
    if (isDiskId(folder)) {
      const ids = (state.order[folder] ?? []).filter((id) => state.nodes[id]?.kind === "dir");
      const token = nextMeasure(folder);
      if (!ids.length) {
        set({ measuring: false, status: `Sizes updated · ${displayPath(state, folder)}` });
        return;
      }
      set({ measuring: true, status: "Measuring folder sizes" });
      void measureDirs(folder, token, ids);
      return;
    }
    set({
      nodes: fillFolderSizes(state.nodes, state.order),
      measuring: false,
      status: `Folder sizes updated · ${displayPath(state, state.panes[i].pathId)}`,
    });
  },

  openItem: (index, id) => {
    const node = get().nodes[id];
    if (!node) return;
    if (node.kind !== "file") {
      get().navigate(index, id);
      return;
    }
    if (isDiskId(node.id)) {
      const opened = diskPath(node.id);
      if (opened) {
        get().rememberPath(opened);
        void openDiskFile(opened)
          .then(() => set({ status: `Opened ${node.name}`, menu: null }))
          .catch((error: unknown) => set({ status: error instanceof Error ? error.message : "Could not open that file", menu: null }));
        return;
      }
      set({ status: "That file is not on a drive", menu: null });
      return;
    }
    if (node.note != null) {
      set({ dialog: { kind: "preview", title: node.name, body: node.note, id: node.id }, menu: null });
      return;
    }
    set({
      dialog: {
        kind: "preview",
        title: node.name,
        body: `${node.name} is stored in this catalog, not launched on your computer.\n\nPath: ${displayPath(get(), id)}`,
      },
      menu: null,
      log: [...get().log, logLine(`Opened ${node.name}`)],
    });
  },

  reveal: (index, id) => {
    const parent = get().nodes[id]?.parentId;
    if (!parent) return;
    set({ searchPane: null, searchHits: [] });
    get().navigate(index, parent);
    get().selectOnly(index, id);
  },

  runSearch: (query) => {
    const state = get();
    if (query && typeof query === "object") {
      const root = query.path ? resolvePath(state, query.path)?.folderId : state.panes[state.active].pathId;
      if (!root || !state.nodes[root]) {
        set({ status: "Search path not found" });
        return;
      }
      const hits: FsNode[] = [];
      const scan = (id: string) => {
        for (const child of childrenOf(state, id)) {
          hits.push(child);
          if (child.kind !== "file") scan(child.id);
        }
      };
      scan(root);
      const q = (query.query ?? "").trim().toLowerCase();
      const exts = query.exts ?? [];
      const filtered = hits.filter((node) => {
        if (q) {
          const inName = node.name.toLowerCase().includes(q);
          const inNote = query.notes !== false && !!node.note?.toLowerCase().includes(q);
          if (!inName && !inNote) return false;
        }
        if (exts.length) {
          if (node.kind !== "file") return false;
          const ext = node.name.includes(".") ? node.name.split(".").pop()!.toLowerCase() : "";
          if (!exts.includes(ext)) return false;
        }
        if (query.hidden && !node.hidden) return false;
        if (query.readonly && !node.readonly) return false;
        if (query.system && !node.system) return false;
        if ((query.minBytes ?? 0) > 0 && (node.bytes ?? 0) < (query.minBytes ?? 0)) return false;
        if ((query.maxDays ?? 0) > 0 && node.modified < Date.now() - (query.maxDays ?? 0) * 86_400_000) return false;
        if (query.exclude && node.name.toLowerCase().includes(query.exclude.toLowerCase())) return false;
        return Boolean(q || exts.length || query.hidden || query.readonly || query.system || query.minBytes || query.maxDays || query.exclude);
      });
      if (!q && !exts.length && !query.hidden && !query.readonly && !query.system && !query.minBytes && !query.maxDays && !query.exclude) {
        set({ status: "Enter a query or a filter" });
        return;
      }
      const label = q || (exts.length ? exts.join(", ") : "filter");
      set({
        searchQuery: label,
        searchPane: state.active,
        searchHits: filtered.map((node) => node.id),
        shadowPane: state.shadowPane === state.active ? null : state.shadowPane,
        shadowId: state.shadowPane === state.active ? null : state.shadowId,
        dialog: null,
        status: `${filtered.length} match${filtered.length === 1 ? "" : "es"} for '${label}'`,
        log: [...state.log, logLine(`Search '${label}' → ${filtered.length}`)],
      });
      return;
    }
    const q = (query ?? state.searchQuery).trim();
    if (!q) {
      set({ searchPane: null, searchHits: [], searchQuery: "", status: "Search cleared" });
      return;
    }
    const root = state.searchScope === "computer" ? "pc" : state.panes[state.active].pathId;
    const hits = searchNodes(state, root, q).map((node) => node.id);
    set({
      searchQuery: q,
      searchPane: state.active,
      searchHits: hits,
      shadowPane: state.shadowPane === state.active ? null : state.shadowPane,
      shadowId: state.shadowPane === state.active ? null : state.shadowId,
      status: `${hits.length} match${hits.length === 1 ? "" : "es"} for '${q}'`,
      log: [...state.log, logLine(`Search '${q}' → ${hits.length}`)],
    });
  },

  setSearchScope: (scope) => set({ searchScope: scope }),
  clearSearch: () => set({ searchPane: null, searchHits: [], searchQuery: "", status: "Search cleared" }),

  openShadow: (index, shadowId) =>
    set((state) => ({
      shadowPane: index,
      shadowId,
      active: index,
      searchPane: state.searchPane === index ? null : state.searchPane,
      status: "Saved copy — bringing it back writes into this catalog only",
    })),

  clearShadow: () => set({ shadowPane: null, shadowId: null, status: "Snapshot closed" }),

  restoreShadow: async (shadowId) => {
    const state = get();
    const id = shadowId ?? state.shadowId;
    const shadow = shadows.find((item) => item.id === id) ?? state.snaps.find((item) => item.id === id);
    if (!shadow) return;
    const dest = state.panes[state.active].pathId;
    const builtIn = shadows.some((item) => item.id === shadow.id);
    if (builtIn && isDiskId(dest)) {
      set({ status: "Those practice copies stay off your real disks" });
      return;
    }
    if (isDiskId(dest)) {
      const names = new Set((state.order[dest] ?? []).map((item) => state.nodes[item]?.name.toLowerCase()));
      let count = 0;
      for (const file of shadow.files) {
        if (names.has(file.name.toLowerCase())) continue;
        try {
          await diskCreate(dest, file.name, file.kind === "file");
          count += 1;
        } catch (error) {
          set({ status: error instanceof Error ? error.message : "Could not bring that snapshot back" });
          return;
        }
      }
      get().refresh();
      set({ status: count ? `Brought back ${count} item(s)` : "Snapshot already matches this folder" });
      return;
    }
    let seq = state.seq;
    const nodes = { ...state.nodes };
    const order = { ...state.order };
    let count = 0;
    for (const file of shadow.files) {
      if (nameClash({ ...state, nodes, order }, dest, file.name)) continue;
      const nid = `n${seq++}`;
      nodes[nid] = {
        id: nid,
        parentId: dest,
        name: file.name,
        kind: file.kind,
        bytes: file.kind === "file" ? (file.bytes ?? 0) : 0,
        modified: file.modified,
        hidden: false,
        readonly: false,
        system: false,
        note: file.note,
      };
      order[dest] = [...(order[dest] ?? []), nid];
      count += 1;
    }
    set({
      nodes: fillFolderSizes(nodes, order),
      order,
      seq,
      status: count ? `Brought back ${count} item(s) from the snapshot` : "Snapshot already matches this folder",
      log: [...state.log, logLine(count ? `Brought back ${count} item(s)` : "Snapshot skipped")],
      undoStack: count ? rememberUndo(state, `restore ${count}`) : state.undoStack,
    });
    if (count && !isDiskId(dest)) {
      enqueueTransfer(set, get, {
        op: "Restore",
        source: shadow.id,
        destination: displayPath(state, dest),
        sourceId: dest,
        destId: dest,
        sourceIds: [],
        mode: "restore",
        shadowId: shadow.id,
        bytes: shadow.files.reduce((sum, file) => sum + (file.bytes ?? 0), 0),
        policyId: "skip",
      });
    }
  },

  takeSnapshot: () => {
    const state = get();
    const folderId = state.panes[state.active].pathId;
    const node = state.nodes[folderId];
    if (!node || node.kind === "file" || node.kind === "computer") {
      set({ status: "Open a folder, then save a snapshot" });
      return;
    }
    set({ dialog: { kind: "snap-dest" }, menu: null });
  },

  saveSnapshotTo: async (folder) => {
    const state = get();
    const folderId = state.panes[state.active].pathId;
    const node = state.nodes[folderId];
    if (!node || node.kind === "file" || node.kind === "computer") {
      set({ status: "Open a folder, then save a snapshot", dialog: null });
      return;
    }
    const source = diskPath(folderId);
    if (source && isDesktop()) {
      set({ status: `Copying ${node.name} into a snapshot`, dialog: null });
      try {
        const info = await saveSnapshot([source], folder);
        set({ status: `Snapshot saved · ${info.files} file(s) · ${formatSize(info.bytes)}`, dialog: null, tab: "keeps" });
      } catch (error) {
        set({ status: error instanceof Error ? error.message : "Could not save that snapshot" });
      }
      return;
    }
    if (!state.order[folderId]) {
      set({ status: "Open the folder so its contents can be saved", dialog: null });
      return;
    }
    const files = (state.order[folderId] ?? [])
      .map((item) => state.nodes[item])
      .filter((item) => item && (item.kind === "file" || item.kind === "dir"))
      .map((item) => ({
        name: item.name,
        bytes: item.kind === "file" ? item.bytes : null,
        kind: item.kind === "file" ? "file" as const : "dir" as const,
        modified: item.modified,
        note: item.note,
      }));
    const snap = {
      id: `snap-${Date.now()}`,
      folderId,
      path: diskPath(folderId) || displayPath(state, folderId),
      taken: Date.now(),
      files,
    };
    set({
      snaps: [...state.snaps, snap].slice(-40),
      dialog: null,
      tab: "keeps",
      status: `Snapshot saved · ${files.length} item(s)`,
      log: [...state.log, logLine(`Snapshot saved · ${snap.path}`)],
    });
  },

  mirror: () => {
    const state = get();
    if (!state.split) {
      set({ status: "Open two panes before copying missing names" });
      return;
    }
    const other = state.active === 0 ? 1 : 0;
    const names = new Set(childrenOf(state, state.panes[other].pathId).map((node) => node.name.toLowerCase()));
    const missing = childrenOf(state, state.panes[state.active].pathId)
      .filter((node) => !names.has(node.name.toLowerCase()))
      .map((node) => node.id);
    if (!missing.length) {
      set({ status: "Other pane already has every name" });
      return;
    }
    get().transferTo(missing, state.panes[other].pathId, "copy");
  },

  syncOther: () => {
    const state = get();
    if (!state.split) {
      set({ status: "Open two panes before updating the other one" });
      return;
    }
    const srcRoot = state.panes[state.active].pathId;
    const destIndex = state.active === 0 ? 1 : 0;
    const destRoot = state.panes[destIndex].pathId;
    if (srcRoot === destRoot) {
      set({ status: "Both panes are the same folder" });
      return;
    }
    if (containsId(state, srcRoot, destRoot) || containsId(state, destRoot, srcRoot)) {
      set({ status: "Cannot update a folder from one inside it" });
      return;
    }
    const buckets = new Map<string, string[]>();
    let clashes = 0;
    const walk = (srcId: string, destId: string) => {
      const destByName = new Map<string, string>();
      for (const kid of state.order[destId] ?? []) {
        const node = state.nodes[kid];
        if (node) destByName.set(node.name.toLowerCase(), kid);
      }
      for (const id of state.order[srcId] ?? []) {
        const node = state.nodes[id];
        if (!node || node.kind === "drive" || node.kind === "computer") continue;
        const hit = destByName.get(node.name.toLowerCase());
        if (!hit) {
          const list = buckets.get(destId) ?? [];
          list.push(id);
          buckets.set(destId, list);
          continue;
        }
        const other = state.nodes[hit];
        if (!other) continue;
        if (node.kind === "file" && other.kind === "file") {
          if (node.modified > other.modified) {
            const list = buckets.get(destId) ?? [];
            list.push(id);
            buckets.set(destId, list);
          }
          continue;
        }
        if (node.kind !== "file" && other.kind !== "file") {
          walk(id, hit);
          continue;
        }
        clashes += 1;
      }
    };
    walk(srcRoot, destRoot);
    if (!buckets.size) {
      set({ status: clashes ? `Nothing to copy. Skipped ${clashes} name clash${clashes === 1 ? "" : "es"}` : "Already in sync — nothing missing or newer" });
      return;
    }
    let seq = state.seq;
    const alloc = () => `n${seq++}`;
    const nodes: Record<string, FsNode> = { ...state.nodes };
    const order: Record<string, string[]> = {};
    for (const [key, kids] of Object.entries(state.order)) order[key] = [...kids];
    let copied = 0;
    let updated = 0;
    let bytes = 0;
    const sourceIds: string[] = [];
    for (const [destId, ids] of buckets) {
      for (const id of ids) {
        const src = state.nodes[id];
        if (!src) continue;
        const existingId = (order[destId] ?? []).find((kid) => nodes[kid]?.name.toLowerCase() === src.name.toLowerCase());
        if (existingId) {
          if (src.modified <= (nodes[existingId]?.modified ?? 0)) continue;
          removeSubtree(nodes, order, existingId);
          updated += 1;
        } else copied += 1;
        const cloned = cloneSubtree(state, id, destId, alloc);
        const rootId = cloned.orderAdds.find(([parent]) => parent === destId)?.[1];
        if (!rootId) continue;
        Object.assign(nodes, cloned.nodes);
        for (const [parent, child] of cloned.orderAdds) order[parent] = [...(order[parent] ?? []), child];
        bytes += subtreeBytes({ nodes, order }, rootId).bytes;
        sourceIds.push(id);
      }
    }
    const count = copied + updated;
    const where = displayPath(state, destRoot);
    const status = count
      ? `Synced ${copied} new and ${updated} newer into ${where}${clashes ? `, skipped ${clashes} clash${clashes === 1 ? "" : "es"}` : ""}`
      : "Already in sync — nothing missing or newer";
    set({
      nodes: fillFolderSizes(nodes, order),
      order,
      seq,
      dialog: null,
      status,
      log: [...state.log, logLine(status)],
      undoStack: count ? rememberUndo(state, `sync ${count}`) : state.undoStack,
    });
    if (count) {
      enqueueTransfer(set, get, {
        op: "Copy",
        source: displayPath(state, srcRoot),
        destination: where,
        sourceId: sourceIds[0] ?? srcRoot,
        destId: destRoot,
        sourceIds,
        mode: "copy",
        bytes,
        policyId: "newer",
      });
    }
  },

  toggleFlat: (index) => {
    const i = index ?? get().active;
    set((state) => {
      const panes = [...state.panes] as [PaneModel, PaneModel];
      const flat = !panes[i].flat;
      panes[i] = {
        ...panes[i],
        flat,
        selected: [],
        anchor: null,
        sortKey: flat ? "size" : "name",
        sortDir: flat ? "desc" : "asc",
      };
      const path = displayPath(state, panes[i].pathId);
      return { panes, active: i, status: flat ? `All files · ${path}` : `This folder · ${path}` };
    });
  },

  selectMask: (pattern) => {
    const state = get();
    const trimmed = pattern.trim();
    if (!trimmed) {
      set({ status: "Enter a pattern such as *.sys or >100MB" });
      return;
    }
    const index = state.active;
    const rows = listing(state, index).rows;
    const hits = rows.filter((row) => matchMask(row, trimmed)).map((row) => row.id);
    const panes = [...state.panes] as [PaneModel, PaneModel];
    panes[index] = { ...panes[index], selected: hits, anchor: hits[0] ?? null };
    set({
      panes,
      dialog: null,
      menu: null,
      status: hits.length ? `Selected ${hits.length} of ${rows.length} · ${trimmed}` : `No items match ${trimmed}`,
    });
  },

  undo: () => {
    const snap = get().undoStack[0];
    if (!snap) {
      set({ status: "Nothing to undo" });
      return;
    }
    set((state) => ({
      undoStack: state.undoStack.slice(1),
      nodes: snap.nodes,
      order: snap.order,
      panes: snap.panes,
      favorites: snap.favorites,
      recent: snap.recent,
      seq: snap.seq,
      dialog: null,
      menu: null,
      status: `Undid ${snap.label}`,
      log: [...state.log, logLine(`Undid ${snap.label}`)],
    }));
  },

  copyPath: async (id) => {
    const state = get();
    const target = id && state.nodes[id] ? id : state.panes[state.active].pathId;
    const path = displayPath(state, target);
    let copied = false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(path);
        copied = true;
      }
    } catch {
      copied = false;
    }
    set({ status: copied ? `Path copied · ${path}` : path });
  },

  compare: () => {
    const state = get();
    const leftId = state.panes[0].selected[0];
    const rightId = state.panes[1].selected[0];
    if (!state.split || !leftId || !rightId || !state.nodes[leftId] || !state.nodes[rightId]) {
      set({ status: "Open two panes and pick one item in each" });
      return;
    }
    set({ dialog: { kind: "compare", leftId, rightId }, menu: null });
  },

  restoreSample: () => {
    const fresh = createSeed();
    const nodes = fillFolderSizes(fresh.nodes, fresh.order);
    const state = get();
    set({
      nodes,
      order: fresh.order,
      seq: 1000,
      undoStack: [],
      clipboard: null,
      dialog: null,
      menu: null,
      searchPane: null,
      searchHits: [],
      searchQuery: "",
      shadowPane: null,
      shadowId: null,
      readerId: null,
      favorites: state.favorites.filter((id) => nodes[id]),
      recent: state.recent.filter((id) => nodes[id]),
      panes: state.panes.map((item) => ({
        ...item,
        pathId: nodes[item.pathId] ? item.pathId : "c",
        selected: [] as string[],
        anchor: null,
        back: [] as string[],
        forward: [] as string[],
      })) as [PaneModel, PaneModel],
      status: "Sample catalog restored",
      log: [...state.log, logLine("Sample catalog restored")],
    });
  },

  openReader: (id) => set({ readerId: id && get().nodes[id] ? id : null, menu: null }),

  unmountDrive: async (id) => {
    const state = get();
    const target = id ?? state.panes[state.active].pathId;
    const drive = state.nodes[target]?.kind === "drive" ? state.nodes[target] : driveOf(state, target);
    if (!drive || drive.kind !== "drive") {
      set({ status: "Select a drive to unmount" });
      return;
    }
    if (drive.mounted === false) {
      set({ status: `${drive.name} is already not mounted`, dialog: null });
      return;
    }
    if (drive.system) {
      set({ status: "The Windows drive stays mounted", dialog: null });
      return;
    }
    if (!isDiskId(drive.id)) {
      const nodes = { ...state.nodes, [drive.id]: { ...drive, mounted: false } };
      const panes = state.panes.map((pane) => {
        const inside = pane.pathId === drive.id || driveOf({ nodes: state.nodes, order: state.order }, pane.pathId)?.id === drive.id;
        return inside ? { ...pane, pathId: "pc", selected: [] as string[], anchor: null } : pane;
      }) as [PaneModel, PaneModel];
      set({ nodes, panes, dialog: null, status: `${drive.name} unmounted` });
      return;
    }
    const path = diskPath(drive.id);
    if (!path) {
      set({ status: "That drive is not open" });
      return;
    }
    try {
      set({ status: `Unmounting ${drive.name}` });
      const message = await unmountVolume(path);
      await applyFreshDrives(message);
    } catch (error) {
      set({ dialog: null, status: error instanceof Error ? error.message : "Could not unmount that drive" });
    }
  },

  mountImage: async (id) => {
    const node = get().nodes[id];
    if (!node || node.kind !== "file" || !node.name.toLowerCase().endsWith(".iso")) {
      set({ status: "Choose an ISO image" });
      return;
    }
    if (!isDiskId(node.id)) {
      set({ status: "Mount works on a real ISO in the Windows program" });
      return;
    }
    const path = diskPath(node.id);
    if (!path) {
      set({ status: "That image is not open" });
      return;
    }
    try {
      set({ status: `Mounting ${node.name}` });
      const message = await mountImage(path);
      await applyFreshDrives(message);
    } catch (error) {
      set({ status: error instanceof Error ? error.message : "Could not mount that image" });
    }
  },

  formatDrive: async (id, filesystem, label) => {
    const drive = get().nodes[id];
    if (!drive || drive.kind !== "drive") {
      set({ status: "Select a drive to format" });
      return;
    }
    if (drive.system || !drive.name.endsWith(":")) {
      set({ status: "The Windows drive cannot be formatted", dialog: null });
      return;
    }
    if (!isDiskId(drive.id)) {
      set((state) => ({
        nodes: { ...state.nodes, [drive.id]: { ...drive, label: label.trim() || drive.label, note: label.trim() || drive.note } },
        dialog: null,
        status: `${drive.name} label updated in the sample catalog`,
      }));
      return;
    }
    const path = diskPath(drive.id);
    if (!path) {
      set({ status: "That drive is not open" });
      return;
    }
    try {
      set({ status: `Formatting ${drive.name}` });
      const message = await formatVolume(path, filesystem, label);
      set((current) => {
        const cleaned = dropLoaded(current.nodes, current.order, drive.id);
        const panes = current.panes.map((pane) => {
          const onDrive = pane.pathId === drive.id || driveOf(current, pane.pathId)?.id === drive.id;
          return onDrive ? { ...pane, pathId: drive.id, selected: [] as string[], anchor: null } : pane;
        }) as [PaneModel, PaneModel];
        return { nodes: cleaned.nodes, order: { ...cleaned.order, [drive.id]: [] }, panes };
      });
      await applyFreshDrives(message);
    } catch (error) {
      set({ dialog: null, status: error instanceof Error ? error.message : "Could not format that drive" });
    }
  },

  openFolder: async (index) => {
    const pane = index ?? get().active;
    if (isDesktop()) {
      try {
        set({ status: "Reading this computer" });
        const tree = await loadDesktopComputer();
        const folders = await knownFolders();
        const personal = new Set(["Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"]);
        const pins = get().pins.length ? get().pins : folders.filter((folder) => personal.has(folder.name)).map((folder) => folder.path);
        set({ nodes: tree.nodes, order: tree.order, undoStack: [], clipboard: null, pins, quickPlaces: folders, status: "This computer" });
        get().navigate(pane, tree.openId, false);
      } catch (error) {
        set({ status: error instanceof Error ? error.message : "Could not read this computer" });
      }
      return;
    }
    try {
      const picked = await pickFolder();
      if (!picked) return;
      const childIds = Object.keys(picked.nodes).filter((id) => id !== picked.rootId);
      set((state) => ({
        nodes: { ...state.nodes, ...picked.nodes },
        order: {
          ...state.order,
          [picked.rootId]: childIds,
          pc: [...(state.order.pc ?? []).filter((id) => !id.startsWith("live:")), picked.rootId],
        },
        status: picked.name,
      }));
      get().navigate(pane, picked.rootId, true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      set({ status: error instanceof Error ? error.message : "Could not open that folder" });
    }
  },

  openTypedPath: async (raw) => {
    const direct = resolvePath(get(), raw);
    if (direct) {
      const index = get().active;
      get().navigate(index, direct.folderId);
      if (direct.selectId) get().selectOnly(index, direct.selectId);
      set({ dialog: null, status: displayPath(get(), direct.selectId ?? direct.folderId) });
      return true;
    }
    if (!isDesktop()) {
      set({ status: "Path not found" });
      return false;
    }
    const parts = raw.trim().replaceAll("/", "\\").replace(/\\+$/, "").split("\\").filter(Boolean);
    const drives = (get().order.pc ?? []).map((id) => get().nodes[id]).filter((node) => node?.kind === "drive");
    const head = (parts[0] ?? "").toLowerCase().replace(/:$/, "");
    const drive = drives.find((node) => node.name.toLowerCase().replace(/:$/, "") === head);
    if (!drive || !parts.length) {
      set({ status: "Path not found" });
      return false;
    }
    let cur = drive.id;
    for (let i = 1; i < parts.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(get().order, cur)) {
        const listed = await loadChildren(cur);
        if (!listed) {
          set({ status: "Could not read that folder" });
          return false;
        }
        const parent = cur;
        set((state) => ({
          nodes: { ...state.nodes, ...listed.nodes },
          order: { ...state.order, [parent]: listed.ids },
        }));
      }
      let exact = (get().order[cur] ?? []).map((id) => get().nodes[id]).find((node) => node?.name.toLowerCase() === parts[i].toLowerCase());
      if (!exact) {
        await reloadDiskFolder(cur);
        exact = (get().order[cur] ?? []).map((id) => get().nodes[id]).find((node) => node?.name.toLowerCase() === parts[i].toLowerCase());
      }
      if (!exact) {
        set({ status: "Path not found" });
        return false;
      }
      if (exact.kind === "file") {
        if (i !== parts.length - 1) {
          set({ status: "Path not found" });
          return false;
        }
        const index = get().active;
        get().navigate(index, cur);
        get().selectOnly(index, exact.id);
        set({ dialog: null, status: displayPath(get(), exact.id) });
        return true;
      }
      cur = exact.id;
    }
    get().navigate(get().active, cur);
    set({ dialog: null, status: displayPath(get(), cur) });
    return true;
  },

  hydrate: (prefs) =>
    set((state) => {
      const catalog = readCatalog(prefs.catalog);
      const nodes = catalog?.nodes ?? state.nodes;
      const order = catalog?.order ?? state.order;
      const seq = catalog?.seq ?? state.seq;
      const filters = normalizeFilters({ ...state.filters, ...prefs.filters });
      if ((prefs.uiRev ?? 0) < 2) filters.showHidden = false;
      if ((prefs.uiRev ?? 0) < 5) filters.showBlocked = false;
      const savedPins = prefs.pinsOpen;
      const pinsOpen: [boolean, boolean] = Array.isArray(savedPins)
        ? [savedPins[0] !== false, savedPins[1] !== false]
        : [savedPins !== false, savedPins !== false];
      return {
        split: false,
        diff: prefs.diff ?? state.diff,
        dupes: prefs.dupes ?? state.dupes,
        barMode: prefs.barMode ?? state.barMode,
        calcDirs: prefs.calcDirs ?? state.calcDirs,
        dark: prefs.dark ?? state.dark,
        dateFormat: prefs.dateFormat ?? state.dateFormat,
        timeFormat: prefs.timeFormat ?? state.timeFormat,
        reading: prefs.reading ?? state.reading,
        favorites: (prefs.favorites ?? state.favorites).filter((id) => nodes[id]),
        recent: (prefs.recent ?? state.recent).filter((id) => nodes[id]),
        filters,
        viewMode: prefs.viewMode ?? state.viewMode,
        showNav: prefs.showNav ?? state.showNav,
        compact: prefs.compact ?? state.compact,
        itemChecks: (prefs.uiRev ?? 0) < 4 ? true : (prefs.itemChecks ?? state.itemChecks),
        showExt: prefs.showExt ?? state.showExt,
        previewOpen: prefs.previewOpen ?? state.previewOpen,
        snaps: prefs.snaps ?? state.snaps,
        pins: prefs.pins ?? state.pins,
        pinsOpen,
        recentPaths: prefs.recentPaths ?? state.recentPaths,
        showAllDrives: prefs.showAllDrives ?? false,
        uiRev: 5,
        nodes,
        order,
        seq,
        panes: state.panes.map((item, index) => {
          const wanted = prefs.paths?.[index];
          const pathId = wanted && nodes[wanted] ? wanted : nodes[item.pathId] ? item.pathId : "c";
          const sort = savedSort(prefs.sort?.[index], item);
          return {
            ...item,
            pathId,
            selected: [] as string[],
            anchor: null,
            back: [] as string[],
            forward: [] as string[],
            flat: prefs.flat?.[index] ?? item.flat,
            sortKey: sort.sortKey,
            sortDir: sort.sortDir,
          };
        }) as [PaneModel, PaneModel],
        columns: columnsFrom(prefs.columns, state.columns),
        detailHeight: clampDetail("height", prefs.detailHeight ?? state.detailHeight),
        detailWidth: clampDetail("width", prefs.detailWidth ?? state.detailWidth),
        detailsOpen: (prefs.uiRev ?? 0) < 3 ? false : (prefs.detailsOpen ?? false),
      };
    }),
}));

function savedSort(saved: { key?: string; dir?: string } | undefined, fallback: PaneModel) {
  const sortKey = saved?.key === "name" || saved?.key === "size" || saved?.key === "type" || saved?.key === "date" ? saved.key : fallback.sortKey;
  const sortDir = saved?.dir === "asc" || saved?.dir === "desc" ? saved.dir : fallback.sortDir;
  return { sortKey, sortDir };
}

function readCatalog(raw: CatalogSnap | undefined) {
  if (!raw?.nodes || !raw.order) return null;
  const nodes = raw.nodes;
  if (nodes.pc?.kind !== "computer" || nodes.c?.kind !== "drive") return null;
  for (const node of Object.values(nodes)) {
    if (!node || typeof node.id !== "string" || typeof node.name !== "string") return null;
    if (node.kind !== "computer" && node.kind !== "drive" && node.kind !== "dir" && node.kind !== "file") return null;
  }
  const order: Record<string, string[]> = {};
  for (const [parent, kids] of Object.entries(raw.order)) {
    if (!nodes[parent] || !Array.isArray(kids)) continue;
    order[parent] = [...new Set(kids.filter((id) => typeof id === "string" && nodes[id]?.parentId === parent))];
  }
  for (const node of Object.values(nodes)) {
    if (!node.parentId) continue;
    if (!nodes[node.parentId]) return null;
    if (!order[node.parentId]?.includes(node.id)) order[node.parentId] = [...(order[node.parentId] ?? []), node.id];
  }
  let seq = typeof raw.seq === "number" && Number.isFinite(raw.seq) ? raw.seq : 1000;
  for (const id of Object.keys(nodes)) {
    const match = /^n(\d+)$/.exec(id);
    if (match) seq = Math.max(seq, Number(match[1]) + 1);
  }
  return { nodes: fillFolderSizes(nodes, order), order, seq };
}

function relativePath(state: FsSnapshot, rootId: string, id: string) {
  const parts: string[] = [];
  let cur = state.nodes[id]?.parentId;
  while (cur && cur !== rootId) {
    const name = state.nodes[cur]?.name;
    if (name) parts.unshift(name);
    cur = state.nodes[cur]?.parentId;
  }
  return parts.join("\\");
}

function descendantFiles(state: FsSnapshot, rootId: string): FsNode[] {
  const out: FsNode[] = [];
  const stack = [...(state.order[rootId] ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    const node = state.nodes[id];
    if (!node) continue;
    if (node.kind === "file") out.push(node);
    else for (const kid of state.order[id] ?? []) stack.push(kid);
  }
  return out;
}

function rowKey(flat: boolean, rel: string, name: string) {
  return (flat && rel ? `${rel}\\${name}` : name).toLowerCase();
}

export function matchMask(row: { name: string; bytes: number | null }, pattern: string) {
  const parts = pattern.split(/[;,\s]+/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return false;
  return parts.some((part) => matchOne(row, part));
}

function matchOne(row: { name: string; bytes: number | null }, part: string) {
  const size = /^(>=|<=|>|<|=)\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb|tb)?$/i.exec(part);
  if (size) {
    const amount = Number(size[2]);
    const unit = (size[3] ?? "mb").toLowerCase();
    const mult = unit === "tb" ? 1024 ** 4 : unit === "gb" ? 1024 ** 3 : unit === "mb" ? 1024 ** 2 : unit === "kb" ? 1024 : 1;
    const bytes = amount * mult;
    const value = row.bytes ?? -1;
    if (size[1] === ">") return value > bytes;
    if (size[1] === ">=") return value >= bytes;
    if (size[1] === "<") return value >= 0 && value < bytes;
    if (size[1] === "<=") return value >= 0 && value <= bytes;
    return value === bytes;
  }
  const body = part.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${body}$`, "i").test(row.name);
}

function columnText(row: { name: string; kind: FsNode["kind"]; bytes: number | null; modified: number }, column: FindColumn) {
  if (column === "size") return formatSize(row.bytes).toLowerCase();
  if (column === "type") return typeLabel({ kind: row.kind, name: row.name } as FsNode).toLowerCase();
  if (column === "date") return formatDate(row.modified).toLowerCase();
  return row.name.toLowerCase();
}

function inGroup(name: string, kind: FsNode["kind"], group: FilterGroup) {
  if (!group) return true;
  if (kind !== "file") return false;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (group === "docs") return ["txt", "md", "pdf", "doc", "docx", "rtf", "csv", "log", "xls", "xlsx"].includes(ext);
  if (group === "programs") return ["exe", "msi", "bat", "cmd", "ps1"].includes(ext);
  if (group === "audio") return ["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext);
  if (group === "video") return ["mp4", "mkv", "avi", "mov", "wmv", "webm"].includes(ext);
  if (group === "archives") return ["zip", "rar", "7z", "iso", "cab", "tar", "gz"].includes(ext);
  return ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"].includes(ext);
}

function normalizeFilters(raw: Partial<Filters> & { visibility?: Visibility }): Filters {
  let showHidden = raw.showHidden ?? false;
  let showReadonly = raw.showReadonly ?? true;
  let showSystem = raw.showSystem ?? true;
  if (raw.visibility && raw.showReadonly == null && raw.showSystem == null) {
    if (raw.visibility === "hide-hidden") showHidden = false;
    if (raw.visibility === "hide-readonly") showReadonly = false;
    if (raw.visibility === "hide-system") showSystem = false;
    if (raw.visibility === "hide-marked") {
      showHidden = false;
      showSystem = false;
    }
    if (raw.visibility === "only-hidden") {
      showHidden = true;
      showReadonly = false;
      showSystem = false;
    }
    if (raw.visibility === "only-readonly") {
      showReadonly = true;
      showHidden = false;
      showSystem = false;
    }
    if (raw.visibility === "only-system") {
      showSystem = true;
      showHidden = false;
      showReadonly = false;
    }
    if (raw.visibility === "all") {
      showHidden = true;
      showReadonly = true;
      showSystem = true;
    }
  }
  return { ...defaultFilters, ...raw, showHidden, showReadonly, showSystem, showBlocked: raw.showBlocked ?? false, maxAgeDays: raw.maxAgeDays ?? 0, attr: "any" };
}

function passes(
  row: { name: string; kind: FsNode["kind"]; hidden: boolean; readonly: boolean; system: boolean; bytes: number | null; modified: number },
  filters: Filters,
  query: string,
) {
  if (!flagVisible(row, filters)) return false;
  if (filters.kind === "dir" && row.kind === "file") return false;
  if (filters.kind === "file" && row.kind !== "file") return false;
  if (filters.ext) {
    const ext = row.name.includes(".") ? row.name.split(".").pop()!.toLowerCase() : "";
    if (row.kind === "file" && ext !== filters.ext) return false;
    if (row.kind !== "file") return false;
  }
  if (!inGroup(row.name, row.kind, filters.group)) return false;
  if (filters.minBytes > 0 && (row.bytes ?? 0) < filters.minBytes) return false;
  if (filters.maxAgeDays > 0 && Date.now() - row.modified > filters.maxAgeDays * 86_400_000) return false;
  if (filters.exclude) {
    const token = filters.exclude.toLowerCase();
    const ext = row.name.includes(".") ? `.${row.name.split(".").pop()!.toLowerCase()}` : "";
    const hit = token.startsWith(".") ? ext === token : row.name.toLowerCase().includes(token);
    if (hit) return false;
  }
  if (query && !columnText(row, filters.findColumn).includes(query.trim().toLowerCase())) return false;
  return true;
}

function sortRows(rows: ListRow[], key: SortKey, dir: "asc" | "desc") {
  const sign = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    const folderBias = Number(a.kind === "file") - Number(b.kind === "file");
    if (folderBias) return folderBias;
    if (key === "size") return ((a.bytes ?? -1) - (b.bytes ?? -1)) * sign;
    if (key === "date") return (a.modified - b.modified) * sign;
    if (key === "type") return a.kind.localeCompare(b.kind) * sign || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * sign;
  });
  return rows;
}

function shownBytes(state: FileState, node: FsNode): number | null {
  if (node.kind === "file") return node.bytes;
  if (node.kind === "drive" && typeof node.capacity === "number") return Math.max(0, node.capacity - (node.free ?? 0));
  if (!state.calcDirs) return null;
  return node.bytes;
}

export function listing(state: FileState, index: 0 | 1): { rows: ListRow[]; banner: string | null; total: number } {
  const paneState = state.panes[index];
  const shadow = state.shadowPane === index
    ? shadows.find((item) => item.id === state.shadowId) ?? state.snaps.find((item) => item.id === state.shadowId)
    : undefined;
  let rows: ListRow[] = [];
  let banner: string | null = null;
  let total = 0;

  if (shadow) {
    banner = `Snapshot from ${new Date(shadow.taken).toLocaleString()} · ${shadow.files.length} items · Bring back copies missing names into this folder`;
    total = shadow.files.length;
    rows = shadow.files.map((file, i) => ({
      id: `${shadow.id}:${i}`,
      name: file.name,
      bytes: file.bytes,
      modified: file.modified,
      hidden: false,
      readonly: false,
      system: false,
      kind: file.kind,
      note: file.note,
    }));
  } else if (state.searchPane === index && state.searchQuery) {
    const hits = state.searchHits.map((id) => state.nodes[id]).filter(Boolean);
    total = hits.length;
    banner = `${hits.length} match${hits.length === 1 ? "" : "es"} for '${state.searchQuery}'`;
    rows = hits.map((node) => ({
      id: node.id,
      nodeId: node.id,
      name: node.name,
      bytes: shownBytes(state, node),
      approx: state.calcDirs ? node.approx : undefined,
      modified: node.modified,
      hidden: node.hidden,
      readonly: node.readonly,
      system: node.system,
      kind: node.kind,
      path: displayPath(state, node.id),
      note: node.note,
    }));
  } else {
    const flat = paneState.flat && state.shadowPane !== index && state.searchPane !== index;
    const kids = flat ? descendantFiles(state, paneState.pathId) : childrenOf(state, paneState.pathId);
    total = kids.length;
    rows = kids.map((node) => {
      const path = flat ? relativePath(state, paneState.pathId, node.id) : undefined;
      return {
        id: node.id,
        nodeId: node.id,
        name: node.name,
        bytes: shownBytes(state, node),
      approx: state.calcDirs ? node.approx : undefined,
        modified: node.modified,
        hidden: node.hidden,
        readonly: node.readonly,
        system: node.system,
        kind: node.kind,
        path: path || undefined,
        note: node.note,
        blocked: node.blocked,
      };
    });
    if (flat) {
      const folder = state.nodes[paneState.pathId]?.name ?? "folder";
      banner = `All files · ${total} file${total === 1 ? "" : "s"} under ${folder}`;
    }
    if (!state.showAllDrives) {
      rows = rows.filter((row) => {
        if (row.kind !== "drive" || !row.nodeId) return true;
        return state.nodes[row.nodeId]?.mounted !== false;
      });
    }
    if (state.diff && state.split) {
      const other = index === 0 ? 1 : 0;
      const otherPane = state.panes[other];
      const otherFlat = otherPane.flat && state.shadowPane !== other && state.searchPane !== other;
      const otherNodes = otherFlat ? descendantFiles(state, otherPane.pathId) : childrenOf(state, otherPane.pathId);
      const names = new Set(otherNodes.map((node) => rowKey(otherFlat, otherFlat ? relativePath(state, otherPane.pathId, node.id) : "", node.name)));
      for (const row of rows) row.onlyHere = !names.has(rowKey(flat, row.path ?? "", row.name));
    }
  }

  const query = shadow || state.filters.highlight ? "" : paneState.query;
  const visible = rows.filter((row) => passes(row, state.filters, query));
  if (state.filters.highlight && paneState.query.trim() && !shadow) {
    const needle = paneState.query.trim().toLowerCase();
    for (const row of visible) row.hit = columnText(row, state.filters.findColumn).includes(needle);
  }
  if (state.dupes && !shadow) {
    const counts = new Map<number, number>();
    for (const row of visible) {
      if (row.kind === "file" && row.bytes) counts.set(row.bytes, (counts.get(row.bytes) ?? 0) + 1);
    }
    for (const row of visible) {
      row.dupe = row.kind === "file" && !!row.bytes && (counts.get(row.bytes) ?? 0) > 1;
    }
  }
  return { rows: sortRows(visible, paneState.sortKey, paneState.sortDir), banner, total };
}

export function barPercent(bytes: number | null, max: number, mode: BarMode): number {
  if (bytes == null || bytes <= 0 || max <= 0) return 0;
  if (mode === "log") {
    const span = Math.log10(max + 1);
    if (span <= 0) return 0;
    return Math.max(4, Math.min(100, Math.round((Math.log10(bytes + 1) / span) * 100)));
  }
  return Math.max(2, Math.min(100, Math.round((bytes / max) * 100)));
}

export function barScale(rows: ListRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.bytes ?? 0), 1);
}

export function selectionBytes(state: FileState): { count: number; bytes: number; known: boolean } {
  const ids = state.panes[state.active].selected;
  let bytes = 0;
  let known = true;
  for (const id of ids) {
    const node = state.nodes[id];
    if (!node || node.bytes == null) known = false;
    else bytes += node.bytes;
  }
  return { count: ids.length, bytes, known };
}

export { displayPath, driveOf, shadows };
export type { ShadowCopy };
