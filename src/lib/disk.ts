import type { FsNode } from "@/lib/vfs";

export function isDiskId(id: string | undefined): boolean {
  return !!id && (id.startsWith("disk:") || id.startsWith("live:"));
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const paths = new Map<string, string>();
const handles = new Map<string, FileSystemHandle>();
let seq = 1;

interface DirHandle {
  kind: "directory";
  name: string;
  entries(): AsyncIterable<[string, FileSystemHandle]>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface FileHandle {
  kind: "file";
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}

function asDir(handle: FileSystemHandle | undefined): DirHandle | null {
  if (!handle || handle.kind !== "directory") return null;
  return handle as unknown as DirHandle;
}

function asFile(handle: FileSystemHandle | undefined): FileHandle | null {
  if (!handle || handle.kind !== "file") return null;
  return handle as unknown as FileHandle;
}

function nextDiskId() {
  seq += 1;
  return `disk:${seq}`;
}

function nextLiveId() {
  seq += 1;
  return `live:${seq}`;
}

export function diskPath(id: string): string | null {
  return paths.get(id) ?? null;
}

export function setDiskPath(id: string, path: string) {
  paths.set(id, path);
}

export function forgetDisk(id: string) {
  paths.delete(id);
}

export function withoutDisk<T extends { nodes: Record<string, FsNode>; order: Record<string, string[]> }>(snap: T): T {
  const nodes: Record<string, FsNode> = {};
  const order: Record<string, string[]> = {};
  for (const [id, node] of Object.entries(snap.nodes)) {
    if (!isDiskId(id)) nodes[id] = node;
  }
  for (const [id, kids] of Object.entries(snap.order)) {
    if (isDiskId(id)) continue;
    order[id] = kids.filter((kid) => !isDiskId(kid));
  }
  return { ...snap, nodes, order };
}

type RawEntry = {
  name: string;
  path: string;
  kind: "drive" | "dir" | "file";
  bytes: number | null;
  modified: number;
  hidden: boolean;
  readonly: boolean;
  system: boolean;
  mounted?: boolean;
  capacity?: number | null;
  free?: number | null;
  media?: string;
};

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(command, args);
}

function makeNode(id: string, parentId: string | null, entry: RawEntry): FsNode {
  paths.set(id, entry.path);
  return {
    id,
    parentId,
    name: entry.name,
    kind: entry.kind === "drive" ? "drive" : entry.kind,
    bytes: entry.kind === "file" ? entry.bytes : null,
    modified: entry.modified,
    hidden: entry.hidden,
    readonly: entry.readonly,
    system: entry.system,
    mounted: entry.mounted,
    capacity: entry.capacity ?? undefined,
    free: entry.free ?? undefined,
    note: entry.media || undefined,
  };
}

export async function fetchDrives(): Promise<FsNode[]> {
  const drives = await invoke<RawEntry[]>("drives");
  return drives.map((entry) => {
    const id = nextDiskId();
    return makeNode(id, "pc", entry);
  });
}

export async function unmountVolume(path: string): Promise<string> {
  return invoke<string>("unmount_drive", { path });
}

export async function loadDesktopComputer(): Promise<{ nodes: Record<string, FsNode>; order: Record<string, string[]>; openId: string }> {
  const drives = await invoke<RawEntry[]>("drives");
  const pc: FsNode = {
    id: "pc",
    parentId: null,
    name: "This computer",
    kind: "computer",
    bytes: null,
    modified: Date.now(),
    hidden: false,
    readonly: false,
    system: false,
  };
  const nodes: Record<string, FsNode> = { pc };
  const order: Record<string, string[]> = { pc: [] };
  for (const drive of drives) {
    const id = nextDiskId();
    nodes[id] = makeNode(id, "pc", drive);
    order.pc.push(id);
  }
  const openId = order.pc[0] ?? "pc";
  if (openId !== "pc") {
    const listed = await loadChildren(openId);
    if (listed) {
      Object.assign(nodes, listed.nodes);
      order[openId] = listed.ids;
    }
  }
  return { nodes, order, openId };
}

export async function loadChildren(id: string): Promise<{ nodes: Record<string, FsNode>; ids: string[] } | null> {
  if (id.startsWith("disk:")) {
    const path = paths.get(id);
    if (!path) return null;
    const entries = await invoke<RawEntry[]>("list_dir", { path });
    const nodes: Record<string, FsNode> = {};
    const ids: string[] = [];
    for (const entry of entries) {
      const child = nextDiskId();
      nodes[child] = makeNode(child, id, entry);
      ids.push(child);
    }
    return { nodes, ids };
  }
  const handle = asDir(handles.get(id));
  if (!handle) return null;
  const nodes: Record<string, FsNode> = {};
  const ids: string[] = [];
  for await (const [name, child] of handle.entries()) {
    const childId = nextLiveId();
    handles.set(childId, child);
    const file = asFile(child);
    if (file) {
      let bytes = 0;
      let modified = 0;
      try {
        const blob = await file.getFile();
        bytes = blob.size;
        modified = blob.lastModified;
      } catch {
        /* leave unknown size */
      }
      nodes[childId] = {
        id: childId,
        parentId: id,
        name,
        kind: "file",
        bytes,
        modified,
        hidden: name.startsWith("."),
        readonly: false,
        system: false,
      };
    } else {
      nodes[childId] = {
        id: childId,
        parentId: id,
        name,
        kind: "dir",
        bytes: null,
        modified: 0,
        hidden: name.startsWith("."),
        readonly: false,
        system: false,
      };
    }
    ids.push(childId);
  }
  ids.sort((a, b) => nodes[a].name.localeCompare(nodes[b].name, undefined, { sensitivity: "base" }));
  return { nodes, ids };
}

export async function pickFolder(): Promise<{ nodes: Record<string, FsNode>; rootId: string; name: string } | null> {
  const picker = (window as Window & { showDirectoryPicker?: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
  if (!picker) throw new Error("Opening a real folder needs Chrome or Edge. The desktop app is what reads every drive.");
  const dir = await picker({ mode: "readwrite" });
  const rootId = nextLiveId();
  handles.set(rootId, dir);
  const listed = await loadChildren(rootId);
  const root: FsNode = {
    id: rootId,
    parentId: "pc",
    name: dir.name,
    kind: "dir",
    bytes: null,
    modified: Date.now(),
    hidden: false,
    readonly: false,
    system: false,
  };
  return { nodes: { [rootId]: root, ...(listed?.nodes ?? {}) }, rootId, name: dir.name };
}

export async function diskCreate(parentId: string, name: string, file: boolean): Promise<void> {
  if (parentId.startsWith("disk:")) {
    const parent = paths.get(parentId);
    if (!parent) throw new Error("That folder is not open");
    await invoke("create_item", { parent, name, file });
    return;
  }
  const handle = asDir(handles.get(parentId));
  if (!handle) throw new Error("That folder is not open");
  if (file) await handle.getFileHandle(name, { create: true });
  else await handle.getDirectoryHandle(name, { create: true });
}

export async function diskRename(id: string, name: string): Promise<void> {
  if (id.startsWith("disk:")) {
    const path = paths.get(id);
    if (!path) throw new Error("That item is not open");
    await invoke("rename_path", { path, name });
    return;
  }
  const handle = handles.get(id) as (FileSystemHandle & { move?: (name: string) => Promise<void> }) | undefined;
  if (!handle?.move) throw new Error("This browser cannot rename that item");
  await handle.move(name);
}

export async function diskRemoveNamed(parentId: string, name: string, recursive: boolean): Promise<void> {
  if (parentId.startsWith("disk:")) {
    const parent = paths.get(parentId);
    if (!parent) throw new Error("That folder is not open");
    const sep = parent.includes("\\") ? "\\" : "/";
    const path = parent.endsWith("\\") || parent.endsWith("/") ? `${parent}${name}` : `${parent}${sep}${name}`;
    await invoke("remove_path", { path });
    return;
  }
  const handle = asDir(handles.get(parentId));
  if (!handle) throw new Error("That folder is not open");
  await handle.removeEntry(name, { recursive });
}

const TEXT = new Set(["txt", "md", "json", "csv", "log", "xml", "html", "css", "js", "ts", "ps1", "ini", "cfg"]);

export async function readDiskText(id: string, name: string): Promise<string | null> {
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (!TEXT.has(ext)) return null;
  if (id.startsWith("disk:")) {
    const path = paths.get(id);
    if (!path) return null;
    return invoke<string>("read_text", { path });
  }
  const handle = asFile(handles.get(id));
  if (!handle) return null;
  const file = await handle.getFile();
  if (file.size > 256 * 1024) return null;
  return file.text();
}

export interface DiskJob {
  id: string;
  name: string;
  sourceName: string;
  parentId: string | null;
  renameClashId?: string;
  renameClashTo?: string;
}

async function liveCopy(src: FileSystemHandle, dest: DirHandle, name: string): Promise<void> {
  const file = asFile(src);
  if (file) {
    const blob = await file.getFile();
    const out = asFile(await dest.getFileHandle(name, { create: true }));
    if (!out) throw new Error("Could not create that file");
    const writable = await out.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const dir = asDir(src);
  if (!dir) throw new Error("That item is not open");
  const created = asDir(await dest.getDirectoryHandle(name, { create: true }));
  if (!created) throw new Error("Could not create that folder");
  for await (const [childName, child] of dir.entries()) await liveCopy(child, created, childName);
}

export async function diskTransfer(jobs: DiskJob[], destId: string, mode: "copy" | "move"): Promise<void> {
  for (const job of jobs) {
    if (job.renameClashId && job.renameClashTo) await diskRename(job.renameClashId, job.renameClashTo);
    if (job.id.startsWith("disk:") && destId.startsWith("disk:")) {
      const from = paths.get(job.id);
      const parent = paths.get(destId);
      if (!from || !parent) throw new Error("That folder is not open");
      await invoke(mode === "move" ? "move_item" : "copy_item", { from, parent, name: job.name });
      continue;
    }
    const dest = asDir(handles.get(destId));
    const src = handles.get(job.id);
    if (!dest || !src) throw new Error("That folder is not open");
    const movable = src as FileSystemHandle & { move?: (dir: FileSystemHandle, name: string) => Promise<void> };
    if (mode === "move" && typeof movable.move === "function") {
      try {
        await dest.removeEntry(job.name, { recursive: true });
      } catch {
        /* nothing there yet */
      }
      await movable.move(handles.get(destId) as FileSystemHandle, job.name);
      continue;
    }
    try {
      await dest.removeEntry(job.name, { recursive: true });
    } catch {
      /* nothing there yet */
    }
    await liveCopy(src, dest, job.name);
    if (mode === "move" && job.parentId) {
      const parent = asDir(handles.get(job.parentId));
      if (parent) await parent.removeEntry(job.sourceName, { recursive: true });
    }
  }
}

async function liveDirBytes(dir: DirHandle, budget: { n: number }): Promise<{ bytes: number; partial: boolean }> {
  let total = 0;
  let partial = false;
  for await (const [, child] of dir.entries()) {
    if (budget.n <= 0) return { bytes: total, partial: true };
    budget.n -= 1;
    const file = asFile(child);
    if (file) {
      try {
        total += (await file.getFile()).size;
      } catch {
        partial = true;
      }
    } else {
      const nested = asDir(child);
      if (!nested) continue;
      const inner = await liveDirBytes(nested, budget);
      total += inner.bytes;
      if (inner.partial) partial = true;
    }
  }
  return { bytes: total, partial };
}

export type MeasuredSize = { bytes: number; partial: boolean };

export async function measureChildren(id: string): Promise<Record<string, MeasuredSize>> {
  const sizes: Record<string, MeasuredSize> = {};
  if (id.startsWith("disk:")) {
    const path = paths.get(id);
    if (!path) return sizes;
    const rows = await invoke<{ name: string; bytes: number | null; partial?: boolean }[]>("measure_children", { path });
    for (const row of rows) {
      if (row.bytes == null) continue;
      sizes[row.name.toLowerCase()] = { bytes: row.bytes, partial: !!row.partial };
    }
    return sizes;
  }
  const handle = asDir(handles.get(id));
  if (!handle) return sizes;
  for await (const [name, child] of handle.entries()) {
    const dir = asDir(child);
    if (!dir) continue;
    const measured = await liveDirBytes(dir, { n: 25000 });
    if (measured.bytes === 0 && measured.partial) continue;
    sizes[name.toLowerCase()] = { bytes: measured.bytes, partial: measured.partial };
  }
  return sizes;
}
