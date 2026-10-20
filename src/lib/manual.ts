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
  version: "0.2.4",
  latest: "https://github.com/AxxessDenyd/Data-Finder/releases/latest",
  setup: "https://github.com/AxxessDenyd/Data-Finder/releases/latest/download/Data-Finder-Setup.exe",
  portable: "https://github.com/AxxessDenyd/Data-Finder/releases/latest/download/Data-Finder.exe",
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
      { label: "Download the installer", href: "https://github.com/AxxessDenyd/Data-Finder/releases/latest/download/Data-Finder-Setup.exe" },
      { label: "Download the portable program", href: "https://github.com/AxxessDenyd/Data-Finder/releases/latest/download/Data-Finder.exe" },
      { label: "Latest release", href: "https://github.com/AxxessDenyd/Data-Finder/releases/latest" },
    ],
  },
  {
    title: "The window",
    items: [
      "The folder tree starts with Pinned and Recent. Both can be folded. Pinned starts open and stays that way until you fold it. Desktop, Documents, Downloads, Pictures, Music, and Videos are pinned the first time the program runs. The star on a folder pins or unpins it. The X next to a pinned folder unpins it. Any folder can be pinned.",
      "The search box sits on the same bar as Home, Find, Recovery, and Help, at the right. It filters the folder you have open. Refresh sits next to the path. Check boxes sit beside each name.",
      "Home is one bar: New, Go, Drives, Filter, Tools, and Settings, then Cut, Copy, Paste, Rename, Delete, Two panes, Sort, and View. The tabs are Home, Find, Recovery, and Help.",
      "The menu button holds Second pane, Dark mode, Help, and About.",
      "New creates a folder or a file. The list includes a text document, markdown, spreadsheet, web page, JSON, settings, PowerShell, batch, log, and an empty file. If the name is already there, a number is added.",
      "Filter sorts by name, size, date, or type. Click the same sort again to reverse it. It can also show folders, files, documents, pictures, music, videos, programs, archives, or items of 100 MB and up, and limit them to today, the past week, or the past month.",
      "Check boxes select more than one file or folder. Each box adds or removes that item without clearing the others. Drag across empty space to draw a box around several items.",
      "The address bar shows the path. Click it to type a path such as C:\\Users.",
      "The bottom bar shows how many items are selected, a Details button, and the drive's free space. A drive you can see is mounted.",
      "Select one or more files and folders, then open Details. Each item is listed with its type and size. Each folder also lists what is inside it, grouped by type. The top line adds every selected size into one total.",
    ],
  },
  {
    title: "Home menus",
    items: [
      "New: folder and the file types Data Finder can create.",
      "Go: Up, This computer, Refresh, and Jump to path.",
      "Drives: show every drive, mount a drive that is waiting for a letter, map a network drive, add a network location, and disconnect a network drive.",
      "Filter: sort order, file kind, and how recently an item changed.",
      "Tools: snapshots, disk use, copy list, the queue, and activity.",
      "Settings: dark mode, larger text, folder measuring, unmount, and format.",
    ],
  },
  {
    title: "One pane and two panes",
    items: [
      "Layout starts on One pane. Two panes sits on the Home bar, between Delete and Sort. Click it and a second folder opens under the first.",
      "While two panes are open, the same button says One pane. Click it to close the second folder.",
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
      "Show stays open while you move the pointer onto it. Hidden items starts unchecked. Read-only items and System items start checked. No access folders starts checked, so folders Windows will not open stay visible. Uncheck it to hide them in the file list and in the folder tree. Turning System items off hides system files and folders. It does not hide drive letters.",
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
      "Double-click a file to open it in the program Windows uses for that kind of file, such as a photo viewer or a PDF reader. Double-click a folder to open it.",
      "Right-click and choose Info, or press Alt+Enter. Data Finder measures that file or folder and shows the exact size in bytes, whether the measure was complete, and how many files and folders are inside. A folder Windows will not open says No access.",
      "Ctrl+Z undoes the last change in the practice catalog. Changes on a real disk are not undone.",
    ],
  },
  {
    title: "Find and Analyze",
    items: [
      "Find narrows the current folder by name, size, type, or date. Pattern selects names such as *.sys or files over 100 MB and leaves the rest of the folder on screen.",
      "Deep search looks through a folder or the whole computer. Jump to path opens a typed path.",
      "Snapshots copies the real files. Data Finder asks where to save them first. Leave the folder blank to keep the copy on this PC, or choose an external drive. The Snapshots window lists each copy, what it captured, and how much space it uses. User folders copies Desktop, Documents, Downloads, Pictures, Music, and Videos, and it asks where to save them because that can use a lot of space.",
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
  {
    title: "Recovery",
    items: [
      "The Recovery tab looks for files that were deleted. It does not change the drive you scan.",
      "Quick scan reads the Recycle Bin and deleted file records on an NTFS drive. Deep scan also searches free space for pictures, documents, music, video, and archives. Deep scan can take a long time. Stop ends it.",
      "Choose the kinds of files you want. The list shows the name, original location, size, kind, chance, and where it was found. Excellent and Good are the safer recoveries. Fair comes from free space. Poor means only part of the file may remain.",
      "Select the files, then choose a folder on a different drive. Choose folder opens a window so you can pick it. Data Finder will not save onto the drive it just scanned, because that can overwrite the data.",
      "If the scan says it cannot read the drive, close Data Finder, right-click it, and choose Run as administrator.",
    ],
  },
];
