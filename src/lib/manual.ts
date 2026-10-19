export interface ManualSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
  links?: Array<{ label: string; href: string }>;
}

export const aboutInfo = {
  name: "Data Finder",
  created: "October 2026",
  author: "William Schneider",
  updated: "October 18, 2026",
  version: "0.1.0",
  latest: "https://github.com/AxxessDenyd/Data-Finder",
  setup: "https://github.com/AxxessDenyd/Data-Finder/raw/main/Data-Finder-Setup.exe",
  portable: "https://github.com/AxxessDenyd/Data-Finder/raw/main/Data-Finder.exe",
};

export const manualSections: ManualSection[] = [
  {
    title: "What Data Finder is",
    paragraphs: [
      "Data Finder is a Windows file window. The desktop program reads the drives on the computer it is running on and can copy, move, rename, delete, and create real files. The browser copy uses a practice catalog until you open a folder.",
    ],
  },
  {
    title: "Install or carry it",
    items: [
      "Data-Finder-Setup.exe installs Data Finder for the current Windows user. Double-click it and follow the steps.",
      "Data-Finder.exe is the portable program. Copy it to a flash drive and double-click it on any Windows PC. Nothing is installed.",
      "Close Data Finder before replacing either file, or Windows will say the file is in use.",
      "The latest copies are on the project page. Use the links below.",
    ],
    links: [
      { label: "Download the installer", href: "https://github.com/AxxessDenyd/Data-Finder/raw/main/Data-Finder-Setup.exe" },
      { label: "Download the portable program", href: "https://github.com/AxxessDenyd/Data-Finder/raw/main/Data-Finder.exe" },
      { label: "Project page", href: "https://github.com/AxxessDenyd/Data-Finder" },
    ],
  },
  {
    title: "The window",
    items: [
      "The app opens in one pane. The folder tree is on the left and the file list is on the right.",
      "Home, Find, Analyze, View, and Help are the tabs across the top. Help has two buttons: Manual opens this guide, and About tells you who made Data Finder and where the latest copy is.",
      "Home is one row of menus: Hold, Edit, Go, View, Details, Shortcuts, and Layout. Click a name to open its list. The list opens over the window, not inside the bar.",
      "The address bar shows the path. Click it to type a path such as C:\\Users.",
      "The bottom bar shows how many items are selected, a Details button, and the drive name, mount state, and free space.",
      "Select one or more files and folders, then open Details. Each item is listed with its type and size. Each folder also lists what is inside it, grouped by type. The top line adds every selected size into one total.",
    ],
  },
  {
    title: "Home menus",
    items: [
      "Hold: Cut, Copy, and Paste.",
      "Edit: Open, Delete, Rename, Undo, New folder, and New file.",
      "Go: Up, This computer, Unmount, Format, Refresh, Measure, and the size-bar style.",
      "View: icon sizes, List, Details, Tiles, Content, the details pane, the preview pane, and the Show list.",
      "Details: how many items are selected, Show details, Copy location, and Info.",
      "Shortcuts: Starred places and folders you opened recently.",
      "Layout: switch between one and two panes, compare folders, the queue, the activity log, and this manual.",
    ],
  },
  {
    title: "One pane and two panes",
    items: [
      "Layout starts on One pane. The menu says Two panes. Click it and a second folder opens under the first.",
      "While two panes are open, the same item says One pane. Click it to close the second folder.",
      "Click a pane to make it active. The active pane has a blue edge. F6 moves between panes.",
      "Gaps tints names that exist in one pane and not the other. Copy missing adds the missing names. Update other also replaces files that are older than the active pane.",
      "Line up compares the two folders. Same size marks files that share a size.",
    ],
  },
  {
    title: "View",
    items: [
      "Details is the table with Name, Size, Size bar, Type, and Modified. Drag a column header to make a cut-off name, size, or date readable.",
      "Extra large, Large, Medium, and Small icons, plus List, Tiles, and Content, change how the folder is drawn. A check marks the current choice.",
      "Show holds independent checks. Hidden items starts unchecked. Read-only items and System items start checked. Turning System items off hides system files and folders. It does not hide drive letters.",
      "Navigation pane shows or hides the folder tree. Compact view tightens the rows. Item check boxes adds a box on each row. File name extensions shows or hides the ending of a file name.",
      "Details pane and Preview pane add a side panel for the selection. The details strip also opens from Details on the bottom bar, and it starts closed.",
      "Larger text, on the View tab, enlarges the file list and the folder tree.",
      "Dark and light mode are on the View tab. The choice is remembered.",
    ],
  },
  {
    title: "Drives",
    items: [
      "This computer lists each drive as a letter and a name, such as C:\\ [Local Disk], plus whether it is mounted.",
      "Right-click a drive for Unmount or Format. The Windows drive does not offer those, because Windows is running from it.",
      "Unmount closes the volume. A removable drive is ejected.",
      "Format erases an extra drive. Confirm the drive, pick NTFS, exFAT, or FAT32, and a name. The Windows drive cannot be formatted.",
      "Right-click an ISO file and choose Mount image. Windows mounts it as a drive. Refresh if the new letter is slow to appear.",
    ],
  },
  {
    title: "Files and folders",
    items: [
      "Double-click or press Enter to open a folder or file. Backspace goes up. F5 refreshes. F2 renames. Delete asks before removing the selection.",
      "Drag a row onto a folder or the other pane to move it. Hold Ctrl while you drop to copy.",
      "Paste asks when the name is already there: keep both, rename the old file, overwrite, update newer files, or skip.",
      "Right-click for Open, Cut, Copy, Paste, Rename, Delete, New folder, New file, Copy location, Info, Pin, Refresh, and Save snapshot. The menu stays on the screen.",
      "Folder sizes are measured for the folders in view. A plus sign means the walk stopped early and the size is partial. Measure on the Go menu runs it again.",
      "Ctrl+Z undoes the last change in the practice catalog. Changes on a real disk are not undone.",
    ],
  },
  {
    title: "Find and Analyze",
    items: [
      "Find narrows the current folder by name, size, type, or date. Pattern selects names such as *.sys or files over 100 MB and leaves the rest of the folder on screen.",
      "Deep search looks through a folder or the whole computer. Jump to path opens a typed path.",
      "Analyze keeps snapshots. The practice copies are C:, Users, Downloads, and Program Files. Open one to see that saved list. Bring back copies missing names into the practice catalog only. Those copies are not written onto a real disk.",
      "Save snapshot stores the folder you have open. Bring back restores missing names in that folder, including on a real drive.",
    ],
  },
  {
    title: "Keys",
    items: [
      "Enter opens. Backspace goes up. F5 refreshes. F2 renames. Delete removes.",
      "Ctrl+C, Ctrl+X, and Ctrl+V copy, cut, and paste. Ctrl+A selects the folder. Ctrl+Shift+C copies the location.",
      "Ctrl+F opens Find. Ctrl+Shift+F starts a deep search. Ctrl+Shift+N makes a folder.",
      "Alt+Enter opens Info. Escape closes a menu or a dialog.",
    ],
  },
];
