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
  updated: "October 19, 2026",
  version: "0.2.0",
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
      "The folder tree starts with Pinned and Recent. Desktop, Documents, Downloads, Pictures, Music, and Videos are pinned the first time the program runs. Pin on the right-click menu adds the folder you have open.",
      "The search box at the top right filters the folder you have open. Refresh sits next to the path. Check boxes sit beside each name.",
      "Home menus are New, Edit, Go, Drives, View, Filter, Details, Shortcuts, and Layout. A second bar has Cut, Copy, Paste, Rename, Delete, Sort, and View.",
      "New creates a folder or a file. The list includes a text document, markdown, spreadsheet, web page, JSON, settings, PowerShell, batch, log, and an empty file. If the name is already there, a number is added.",
      "Filter sorts by name, size, date, or type. Click the same sort again to reverse it. It can also show folders, files, documents, pictures, music, videos, programs, archives, or items of 100 MB and up, and limit them to today, the past week, or the past month.",
      "Drag across empty space, or across items that are not already selected, to draw a box and select every file and folder inside it. Drag an item that is already selected to move it.",
      "The address bar shows the path. Click it to type a path such as C:\\Users.",
      "The bottom bar shows how many items are selected, a Details button, and the drive's free space. A drive you can see is mounted.",
      "Select one or more files and folders, then open Details. Each item is listed with its type and size. Each folder also lists what is inside it, grouped by type. The top line adds every selected size into one total.",
    ],
  },
  {
    title: "Home menus",
    items: [
      "New: folder and the file types Data Finder can create.",
      "Edit: Open, Delete, Rename, Undo, New folder, and New file.",
      "Go: Up, This computer, Unmount, Format, Refresh, Measure, and the size-bar style.",
      "Drives: show every drive, mount a drive that is waiting for a letter, map a network drive, add a network location, and disconnect a network drive.",
      "View: icon sizes, List, Details, Tiles, Content, the details pane, the preview pane, and the Show list.",
      "Filter: sort order, file kind, and how recently an item changed.",
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
      "This computer lists each drive as a letter and a name, such as C:\\ [Local Disk]. A drive you can see is mounted. Drives that are not mounted stay off the list unless Show every drive is checked.",
      "Drives that can be given a letter appear in the Drives menu. Mount assigns the next free letter. An empty optical drive is not listed there, because there is nothing to mount.",
      "Map network drive connects \\\\server\\share to a letter. Add network location connects the share without a letter. Disconnect closes a network drive. The Windows drive cannot be unmounted or formatted.",
    ],
  },
  {
    title: "Files and folders",
    items: [
      "Double-click or press Enter to open a folder or file. Backspace goes up. F5 refreshes. F2 renames. Delete asks before removing the selection.",
      "Drag a row onto a folder or the other pane to move it. Hold Ctrl while you drop to copy.",
      "Paste asks when the name is already there: keep both, rename the old file, overwrite, update newer files, or skip.",
      "Right-click for Open, Cut, Copy, Paste, Rename, Delete, New folder, New file, Copy location, Info, Pin, Refresh, and Save snapshot. The menu stays on the screen.",
      "If a folder cannot be opened, the list says why and Try again reads it once more. A folder that cannot be measured says No access. Shortcuts to folders are opened as folders.",
      "Ctrl+Z undoes the last change in the practice catalog. Changes on a real disk are not undone.",
    ],
  },
  {
    title: "Find and Analyze",
    items: [
      "Find narrows the current folder by name, size, type, or date. Pattern selects names such as *.sys or files over 100 MB and leaves the rest of the folder on screen.",
      "Deep search looks through a folder or the whole computer. Jump to path opens a typed path.",
      "Snapshots copies the real files into a Data Finder folder on this PC, so a deleted file can be restored. The Snapshots window lists each copy, what it captured, and how much space it uses. User folders copies Desktop, Documents, Downloads, Pictures, Music, and Videos. That can use a lot of disk space, so the program asks first.",
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
