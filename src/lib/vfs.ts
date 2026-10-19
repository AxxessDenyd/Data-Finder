export type Kind = "computer" | "drive" | "dir" | "file";

export interface FsNode {
  id: string;
  parentId: string | null;
  name: string;
  kind: Kind;
  /** Bytes. Null on folders until measured. Files always have a size. */
  bytes: number | null;
  modified: number;
  hidden: boolean;
  readonly: boolean;
  system: boolean;
  capacity?: number;
  free?: number;
  note?: string;
  /** True when a real-disk folder walk stopped early. The size is a minimum. */
  approx?: boolean;
  /** False when a drive has no media or no mount point. */
  mounted?: boolean;
  /** Volume name, such as Windows. The drive letter stays in name. */
  label?: string;
}

export interface FsSnapshot {
  nodes: Record<string, FsNode>;
  order: Record<string, string[]>;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;
const TB = 1024 * GB;

function d(daysAgo: number, hour = 9, minute = 0) {
  const t = new Date();
  t.setDate(t.getDate() - daysAgo);
  t.setHours(hour, minute, 0, 0);
  return t.getTime();
}

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return "";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  const digits = i === 0 || n >= 100 ? 0 : 1;
  return `${n.toFixed(digits)} ${units[i]}`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function driveCaption(node: FsNode): string {
  const letter = node.name;
  const label = node.label?.trim() || node.note?.trim() || "";
  if (letter.endsWith(":")) return label ? `${letter}\\ [${label}]` : `${letter}\\`;
  return label || letter;
}

export function typeLabel(node: FsNode): string {
  if (node.kind === "drive") {
    const mount = node.mounted === false ? "Not mounted" : "Mounted";
    return `${mount} · ${node.note || "Disk"}`;
  }
  if (node.kind === "dir") return "File Folder";
  if (node.kind === "computer") return "Computer";
  const ext = node.name.includes(".") ? node.name.split(".").pop()!.toUpperCase() : "";
  if (!ext) return "File";
  return `${ext} File`;
}

export function createSeed(): FsSnapshot {
  const nodes: Record<string, FsNode> = {};
  const order: Record<string, string[]> = {};
  let n = 1;

  const add = (
    parentId: string | null,
    name: string,
    kind: Kind,
    extra: Partial<FsNode> = {},
  ): string => {
    const id = extra.id ?? `n${n++}`;
    nodes[id] = {
      id,
      parentId,
      name,
      kind,
      bytes: kind === "file" ? (extra.bytes ?? 0) : (extra.bytes ?? null),
      modified: extra.modified ?? d(1),
      hidden: extra.hidden ?? false,
      readonly: extra.readonly ?? false,
      system: extra.system ?? false,
      capacity: extra.capacity,
      free: extra.free,
      note: extra.note,
      mounted: extra.mounted,
      label: extra.label,
    };
    if (parentId) {
      (order[parentId] ??= []).push(id);
    }
    return id;
  };

  const pc = add(null, "Computer", "computer", { id: "pc", modified: d(0) });

  const c = add(pc, "C:", "drive", {
    id: "c",
    capacity: 1.86 * TB,
    free: 1.86 * TB * 0.86,
    modified: d(0, 12, 5),
    note: "Local Disk",
    mounted: true,
    system: true,
  });
  const backup = add(pc, "D:", "drive", {
    id: "d",
    capacity: 4 * TB,
    free: 4 * TB * 0.41,
    modified: d(12),
    note: "Backup",
    mounted: true,
  });
  const cloud = add(pc, "G:", "drive", {
    id: "g",
    capacity: 2 * TB,
    free: 2 * TB * 0.72,
    modified: d(3),
    note: "Google Drive",
    mounted: true,
  });

  add(c, "$Recycle.Bin", "dir", { hidden: true, system: true, modified: d(6, 9, 55) });
  add(c, "adobeTemp", "dir", { hidden: true, modified: d(340, 20, 24) });
  add(c, "inetpub", "dir", { modified: d(180, 22, 59) });
  const sites = add(c, "My Web Sites", "dir", { modified: d(700, 22, 12) });
  add(sites, "index.html", "file", {
    bytes: 4_200,
    modified: d(700, 22, 10),
    note: "<h1>Local site</h1>\n<p>Placeholder web root.</p>",
  });
  add(c, "OneDriveTemp", "dir", { hidden: true, modified: d(680, 11, 3) });
  add(c, "PerfLogs", "dir", { modified: d(900, 15, 48) });

  const pinokio = add(c, "pinokio", "dir", { modified: d(11, 21, 22) });
  add(pinokio, "app.log", "file", { bytes: 88_000, modified: d(11, 21, 20) });
  add(pinokio, "cache.bin", "file", { bytes: 240 * MB, modified: d(11, 18) });

  const pf = add(c, "Program Files", "dir", { id: "pf", readonly: true, modified: d(0, 15, 8) });
  const apps = ["Common Files", "Windows Defender", "Editor", "Browser"];
  for (const name of apps) {
    const folder = add(pf, name, "dir", { readonly: true, modified: d(20) });
    add(folder, `${name.replaceAll(" ", "")}.exe`, "file", {
      bytes: 18 * MB + name.length * 100_000,
      readonly: true,
      modified: d(20, 14),
    });
    add(folder, "readme.txt", "file", {
      bytes: 1_400,
      modified: d(40),
      note: `${name}\nInstalled component.\n`,
    });
  }

  add(pf, "InstallerCache.msi", "file", { bytes: 1.6 * GB, readonly: true, modified: d(20, 11) });

  const pfx = add(c, "Program Files (x86)", "dir", { id: "pfx86", readonly: true, modified: d(28, 14, 38) });
  add(pfx, "Legacy", "dir", { readonly: true, modified: d(200) });

  const pdata = add(c, "ProgramData", "dir", { id: "pdata", hidden: true, modified: d(6, 9, 53) });
  add(pdata, "cache.db", "file", { bytes: 64 * MB, hidden: true, modified: d(2) });

  add(c, "Recovery", "dir", { modified: d(900, 3, 52) });
  add(c, "System Volume Information", "dir", {
    hidden: true,
    system: true,
    modified: d(0, 10, 1),
  });

  const users = add(c, "Users", "dir", { id: "users", readonly: true, modified: d(200, 23, 56) });
  const owner = add(users, "Owner", "dir", { id: "owner", modified: d(1, 8) });
  const desktop = add(owner, "Desktop", "dir", { id: "desktop", modified: d(1, 9) });
  add(desktop, "Notes.txt", "file", {
    bytes: 820,
    modified: d(1, 9, 12),
    note: "Dual-pane notes\n- Compare folders side by side\n- Measure folder sizes from the ribbon\n",
  });
  const docs = add(owner, "Documents", "dir", { id: "docs", modified: d(4, 16) });
  add(docs, "Budget.xlsx", "file", { bytes: 48_000, modified: d(4, 16, 4) });
  add(docs, "Plan.docx", "file", { bytes: 120_000, modified: d(8, 11) });
  const downloads = add(owner, "Downloads", "dir", { id: "downloads", modified: d(0, 14) });
  const samples = [
    ["installer.exe", 86 * MB],
    ["photo-pack.zip", 240 * MB],
    ["manual.pdf", 2.4 * MB],
    ["dataset.csv", 18 * MB],
  ] as const;
  samples.forEach(([name, bytes], i) => {
    add(downloads, name, "file", { bytes, modified: d(i, 13, 10 + i) });
  });
  add(downloads, "backup.iso", "file", { bytes: 5.1 * GB, modified: d(2, 19) });
  const pics = add(owner, "Pictures", "dir", { id: "pics", modified: d(15) });
  add(pics, "dock.jpg", "file", { bytes: 3.2 * MB, modified: d(15, 18) });
  add(pics, "yard.png", "file", { bytes: 4.8 * MB, modified: d(21) });
  const appdata = add(owner, "AppData", "dir", { id: "appdata", hidden: true, modified: d(2, 10) });
  add(appdata, "Roaming", "dir", { hidden: true, modified: d(2, 10) });
  add(owner, "Start Menu", "dir", { id: "startmenu", modified: d(20, 9) });
  const temp = add(owner, "Temp", "dir", { id: "temp", hidden: true, modified: d(0, 11) });
  add(temp, "setup.tmp", "file", { bytes: 48_000, hidden: true, modified: d(0, 11) });
  add(owner, "Favorites", "dir", { id: "favdir", modified: d(15, 12) });
  const music = add(owner, "Music", "dir", { id: "music", modified: d(60) });
  add(music, "notes.wav", "file", { bytes: 3.4 * MB, modified: d(60, 16) });
  const videos = add(owner, "Videos", "dir", { id: "videos", modified: d(30) });
  add(videos, "clip.mp4", "file", { bytes: 180 * MB, modified: d(30, 19) });
  const pub = add(users, "Public", "dir", { id: "pub", modified: d(400) });
  add(pub, "Desktop", "dir", { id: "pubdesk", modified: d(400) });
  add(pub, "Documents", "dir", { id: "pubdocs", modified: d(400) });
  add(pub, "Start Menu", "dir", { id: "pubstart", modified: d(400) });
  add(pub, "Temp", "dir", { id: "pubtemp", hidden: true, modified: d(12) });

  const win = add(c, "Windows", "dir", { id: "win", modified: d(0, 12, 5) });
  const sys32 = add(win, "System32", "dir", { id: "sys32", system: true, modified: d(0, 12) });
  add(sys32, "ntoskrnl.exe", "file", { bytes: 11 * MB, system: true, modified: d(30) });
  add(sys32, "config.dat", "file", { bytes: 8.4 * GB, hidden: true, system: true, modified: d(1) });
  const drivers = add(win, "Drivers", "dir", { id: "drivers", system: true, modified: d(40) });
  add(drivers, "disk.sys", "file", { bytes: 220 * 1024, system: true, modified: d(40) });
  const config = add(win, "Config", "dir", { id: "config", hidden: true, system: true, modified: d(12) });
  add(config, "software.hiv", "file", { bytes: 48 * MB, hidden: true, system: true, modified: d(12) });
  const syswow = add(win, "SysWOW64", "dir", { id: "syswow", system: true, modified: d(30) });
  add(syswow, "wow64.dll", "file", { bytes: 320 * 1024, system: true, modified: d(30) });
  add(win, "explorer.exe", "file", { bytes: 4.6 * MB, system: true, modified: d(30) });
  add(c, "Windows.old", "dir", { modified: d(550, 14, 21) });

  const rootFiles: Array<[string, number, Partial<FsNode>]> = [
    ["appverifUI.dll", 110 * 1024, { modified: d(260, 5, 18) }],
    ["bootTel.dat", 112 * 1024, { modified: d(740, 1, 38) }],
    ["DumpStack.log.tmp", 12 * 1024, { modified: d(4, 12, 17) }],
    ["hiberfil.sys", 6.2 * GB, { hidden: true, system: true, modified: d(0, 21, 2) }],
    ["pagefile.sys", 2.5 * GB, { hidden: true, system: true, modified: d(4, 12, 17) }],
    ["swapfile.sys", 256 * MB, { hidden: true, system: true, modified: d(4, 12, 17) }],
    ["vfcompat.dll", 66 * 1024, { modified: d(260, 5, 18) }],
    ["bootmgr", 409 * 1024, { hidden: true, system: true, modified: d(800) }],
    ["BOOTNXT", 1 * MB, { hidden: true, system: true, modified: d(800) }],
    ["DumpStack.log", 9 * 1024, { modified: d(4, 12, 20) }],
  ];
  for (const [name, bytes, extra] of rootFiles) {
    add(c, name, "file", { bytes, ...extra });
  }

  const images = add(backup, "Images", "dir", { modified: d(12, 10) });
  add(images, "archive-2024.zip", "file", { bytes: 18 * GB, modified: d(400) });
  add(images, "archive-2025.zip", "file", { bytes: 22 * GB, modified: d(40) });
  add(backup, "Disk Image", "dir", { modified: d(20) });

  const drive = add(cloud, "My Drive", "dir", { modified: d(2, 11) });
  add(drive, "Shared", "dir", { modified: d(9) });
  add(drive, "invoice.pdf", "file", { bytes: 220_000, modified: d(2, 11, 4) });

  void images;
  void win;
  return { nodes, order };
}

export function childrenOf(snap: FsSnapshot, id: string): FsNode[] {
  return (snap.order[id] ?? []).map((cid) => snap.nodes[cid]).filter(Boolean);
}

export function pathIds(snap: FsSnapshot, id: string): string[] {
  const chain: string[] = [];
  let cur: FsNode | undefined = snap.nodes[id];
  while (cur) {
    chain.unshift(cur.id);
    cur = cur.parentId ? snap.nodes[cur.parentId] : undefined;
  }
  return chain;
}

export function displayPath(snap: FsSnapshot, id: string): string {
  const chain = pathIds(snap, id)
    .map((pid) => snap.nodes[pid])
    .filter((node) => node && node.kind !== "computer");
  if (chain.length === 0) return "Computer";
  const [root, ...rest] = chain;
  if (root.kind === "drive") {
    return rest.length ? `${root.name}\\${rest.map((n) => n.name).join("\\")}` : `${root.name}\\`;
  }
  return chain.map((n) => n.name).join("\\");
}

export function driveOf(snap: FsSnapshot, id: string): FsNode | null {
  let cur: FsNode | undefined = snap.nodes[id];
  while (cur) {
    if (cur.kind === "drive") return cur;
    cur = cur.parentId ? snap.nodes[cur.parentId] : undefined;
  }
  return null;
}

export function cloneSubtree(
  snap: FsSnapshot,
  id: string,
  newParent: string,
  alloc: () => string,
): { nodes: Record<string, FsNode>; orderAdds: Array<[string, string]> } {
  const nodes: Record<string, FsNode> = {};
  const orderAdds: Array<[string, string]> = [];
  const walk = (srcId: string, parentId: string) => {
    const src = snap.nodes[srcId];
    const nid = alloc();
    nodes[nid] = { ...src, id: nid, parentId };
    orderAdds.push([parentId, nid]);
    for (const child of snap.order[srcId] ?? []) walk(child, nid);
  };
  walk(id, newParent);
  return { nodes, orderAdds };
}

export function subtreeBytes(snap: FsSnapshot, id: string): { bytes: number; objects: number } {
  const node = snap.nodes[id];
  if (!node) return { bytes: 0, objects: 0 };
  if (node.kind === "file") return { bytes: node.bytes ?? 0, objects: 1 };
  let bytes = 0;
  let objects = 1;
  for (const child of snap.order[id] ?? []) {
    const sub = subtreeBytes(snap, child);
    bytes += sub.bytes;
    objects += sub.objects;
  }
  return { bytes, objects };
}

export function fillFolderSizes(nodes: Record<string, FsNode>, order: Record<string, string[]>): Record<string, FsNode> {
  const next = { ...nodes };
  const memo = new Map<string, number>();
  const sizeOf = (id: string): number => {
    const cached = memo.get(id);
    if (cached != null) return cached;
    const node = next[id];
    if (!node) return 0;
    if (node.kind === "file" || id.startsWith("disk:") || id.startsWith("live:")) {
      const bytes = node.kind === "file" ? (node.bytes ?? 0) : 0;
      memo.set(id, bytes);
      return bytes;
    }
    let sum = 0;
    for (const child of order[id] ?? []) sum += sizeOf(child);
    memo.set(id, sum);
    if (node.kind === "dir" || node.kind === "drive") next[id] = { ...node, bytes: sum };
    return sum;
  };
  for (const id of Object.keys(next)) sizeOf(id);
  return next;
}

export interface ShadowFile {
  name: string;
  bytes: number | null;
  kind: "dir" | "file";
  modified: number;
  note?: string;
}

export interface ShadowCopy {
  id: string;
  folderId: string;
  taken: number;
  files: ShadowFile[];
}

function buildShadows(snap: FsSnapshot): ShadowCopy[] {
  const take = (folderId: string, daysAgo: number, mutate: (files: ShadowFile[]) => void): ShadowCopy => {
    const files: ShadowFile[] = childrenOf(snap, folderId).map((node) => ({
      name: node.name,
      bytes: node.kind === "file" ? (node.bytes ?? 0) : null,
      kind: node.kind === "file" ? "file" : "dir",
      modified: node.modified - daysAgo * 86_400_000,
      note: node.note,
    }));
    mutate(files);
    return {
      id: `sh-${folderId}-${daysAgo}`,
      folderId,
      taken: Date.now() - daysAgo * 86_400_000,
      files,
    };
  };
  return [
    take("c", 1, (files) => {
      const drop = files.findIndex((file) => file.name === "DumpStack.log.tmp");
      if (drop >= 0) files.splice(drop, 1);
      files.push({
        name: "old-setup.log",
        bytes: 24_000,
        kind: "file",
        modified: d(40, 8, 12),
        note: "Setup log from the previous catalog image.\nRestore puts this file back into the folder.\n",
      });
    }),
    take("c", 12, (files) => {
      files.splice(8);
    }),
    take("users", 3, (files) => {
      files.push({
        name: "Temp",
        bytes: null,
        kind: "dir",
        modified: d(20),
      });
    }),
    take("downloads", 2, (files) => {
      files.push({
        name: "driver-pack.zip",
        bytes: 880 * MB,
        kind: "file",
        modified: d(18, 15),
        note: "Driver archive kept only in this shadow copy.\n",
      });
    }),
    take("pf", 9, (files) => {
      const drop = files.findIndex((file) => file.name === "InstallerCache.msi");
      if (drop >= 0) files.splice(drop, 1);
    }),
  ];
}

export const shadows: ShadowCopy[] = buildShadows(createSeed());

export function searchNodes(snap: FsSnapshot, rootId: string, query: string): FsNode[] {
  const q = query.trim().toLowerCase();
  if (!q || !snap.nodes[rootId]) return [];
  const hits: FsNode[] = [];
  const scan = (id: string) => {
    for (const child of childrenOf(snap, id)) {
      if (child.name.toLowerCase().includes(q) || child.note?.toLowerCase().includes(q)) hits.push(child);
      if (child.kind !== "file") scan(child.id);
    }
  };
  scan(rootId);
  return hits;
}

export function resolvePath(snap: FsSnapshot, raw: string): { folderId: string; selectId?: string } | null {
  const text = raw.trim().replaceAll("/", "\\").replace(/\\+$/, "");
  if (!text || /^computer$/i.test(text)) return { folderId: "pc" };
  const parts = text.split("\\").filter(Boolean);
  const drives = childrenOf(snap, "pc").filter((node) => node.kind === "drive");
  const head = parts[0].toLowerCase();
  const drive = drives.find((node) => {
    const letter = node.name.toLowerCase().replace(":", "");
    const note = (node.note ?? "").toLowerCase();
    return (
      letter === head.replace(/:$/, "") ||
      node.name.toLowerCase() === head ||
      `${note} (${letter})` === head ||
      `${note} (${node.name.toLowerCase()})` === head
    );
  });
  if (!drive) return null;
  let cur = drive.id;
  for (let i = 1; i < parts.length; i += 1) {
    const kids = childrenOf(snap, cur);
    const exact = kids.find((node) => node.name.toLowerCase() === parts[i].toLowerCase());
    if (!exact) return null;
    if (exact.kind === "file") {
      if (i !== parts.length - 1) return null;
      return { folderId: cur, selectId: exact.id };
    }
    cur = exact.id;
  }
  return { folderId: cur };
}
