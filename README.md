# Data Finder

Data Finder is a Windows file window. It lists the drives on the computer it runs on and can copy, move, rename, delete, and create real files.

## Download

Close Data Finder before you replace a file that is already open.

- [Data-Finder-Setup.exe](https://github.com/AxxessDenyd/Data-Finder/raw/main/Data-Finder-Setup.exe) installs the program for the current Windows user.
- [Data-Finder.exe](https://github.com/AxxessDenyd/Data-Finder/raw/main/Data-Finder.exe) is portable. Copy it to a flash drive and double-click it. Nothing is installed.

The same guide is inside the program. Open the Help tab, then Manual. Search the manual from the box on that tab. About names the author, the date it was created, and where the latest copy is.

## The window

The program opens in one pane. The folder tree is on the left and the file list is on the right. The tabs are Home, Find, Keeps, Recovery, Decryption, and Help.

Home is one bar: New, Go, Drives, Filter, Tools, and Settings, then Cut, Copy, Paste, Rename, Delete, Sort, and View, then Two panes, then Search at the right. The tabs are Home, Find, Keeps, Recovery, Decryption, and Help. The menu button holds Dark mode, Help, and About.

Double-click a file to open it in the program Windows already uses for that file. Folder sizes are the full measured size. Recent, in the folder tree, folds open and closed.

The newest installer and portable program are the Latest release on GitHub.

The search control sits on the Home bar, to the right of Two panes. It is a box that says Search, with a magnifying glass. Click it and the box opens so you can type. It filters the folder you have open. Click away with nothing typed, or press Escape, and it closes. Refresh sits next to the path. Check boxes sit beside each name and can select more than one file or folder at a time. Pinned and Recent are at the top of the folder tree, and each can be folded. Pinned starts open. Folding it in one pane leaves the other pane as it was. The star on a folder pins or unpins it, and the X unpins a folder from the list. Desktop, Documents, Downloads, Pictures, Music, and Videos start pinned.

Refresh reads the open folder again and measures every folder size. On This computer, Refresh and clicking This computer update each drive's used space without opening the drive.

Recovery's Choose folder button opens a window for the folder where recovered files are saved. Clear wipes the last recovery scan.

View, then Show, includes Hidden items, Read-only items, System items, and No access folders. No access folders starts unchecked. Check it to show folders Windows will not open, in the file list and in the folder tree. The Show menu stays open while the pointer moves onto it.

Info measures the selected file or folder and shows the exact size in bytes. Recovery scans a drive for deleted files and saves the ones you pick onto a different drive. Deep scan also searches free space. Run Data Finder as administrator if a scan cannot read the drive.

Drives you can see are mounted. Show every drive, in the Drives menu, lists the rest. That menu also mounts a drive that is waiting for a letter, maps a network drive, adds a network location, and disconnects a network drive.

A snapshot asks where to save the copy. Leave the folder blank to keep it on this PC, or choose a folder on an external drive. Keeps, the tab between Find and Recovery, lists each saved copy. User folders can copy Desktop, Documents, Downloads, Pictures, Music, and Videos, and it asks where to save them because that can use a lot of space. Earlier copies is on the same Keeps tab. It reads restore points Windows already saved and copies files out of them. It is not a snapshot. If restore points have never been turned on, Keeps can turn them on. Windows asks for permission, sets aside some disk space on the drive you pick, and saves the first restore point.

Decryption sits between Recovery and Help. A locked BitLocker drive opens with the recovery key, password, or key file you already have. Data Finder does not guess a missing key. Where to find the key covers a personal Microsoft account, a school, a workplace, Active Directory, and Intune, and it says what is left when no key can be found. The blue screen shows an eight-character Key ID. The key has to match that ID. If the drive is encrypted and you can already open it, Read the key shows a recovery password Windows stored, and Decrypt removes BitLocker and leaves the files. If it is not encrypted, Turn on BitLocker shows the recovery key, and Save the key writes that key into a text document on a different drive. If every copy of the key is gone, the files on that drive cannot be opened. Use a backup. Formatting does not bring them back.

About links open in the browser.

New creates a folder or a file of a chosen type: text, markdown, spreadsheet, web page, JSON, settings, PowerShell, batch, log, or an empty file.

Filter sorts by name, size, date modified, or type. Click the same sort again to flip the order. It can show folders, files, documents, pictures, music, videos, programs, archives, or items of 100 MB and up, and limit them to today, the past week, or the past month.

Drag across the list to draw a box and select every file and folder inside it. Drag an item that is already selected to move it.

The bottom bar shows the selection count, a Details button, and the drive name, mount state, and free space. The details strip starts closed. Click Details on the bottom bar to open it.

Select several files and folders, then open Details. Each item is listed with its type and size. Each folder also shows what is inside it, grouped by type. The top line adds those sizes into one total.

## Home menus

- **New:** a folder or a file of a chosen type.
- **Go:** Up, This computer, Refresh, and Jump to path.
- **Drives:** show every drive, mount a waiting drive, map a network drive, add a network location, and disconnect.
- **Filter:** sort order, file kind, and how recently an item changed.
- **Tools:** Keeps, disk use, copy list, the queue, and activity.
- **Settings:** dark mode, larger text, folder measuring, unmount, and format.
- **Cut, Copy, Paste, Rename, Delete:** act on the selection.
- **Sort and View:** sort the folder, and change icons, details, check boxes, and the Show list.
- **Two panes:** sits to the right of View. It opens a second folder, then the button says One pane.
- **Search:** sits at the right end of that same bar. The box says Search and has a magnifying glass. Click it to type.

## One pane and two panes

The **Two panes** button sits to the right of View. Click it and a second folder opens underneath. The button then says **One pane**. Click it to close the second folder.

Click a pane to make it active. The active pane has a blue edge. F6 moves between panes. Gaps tints names that exist in only one pane. Copy missing adds those names. Update other also replaces files that are older than the active pane.

## View

Details is the table. Drag a column header if a name, size, or date is cut off.

Hidden items starts unchecked. Read-only items and System items start checked. Turning System items off hides system files and folders. Drive letters stay on the list.

Larger text, on the View tab, enlarges the file list and the folder tree. Dark and light mode are on that tab too.

## Drives

This computer shows each drive as a letter and a name, such as `C:\ [Local Disk]`, and whether it is mounted.

Right-click a drive for Unmount or Format. The Windows drive does not offer those. Format asks you to confirm, then picks NTFS, exFAT, or FAT32. Right-click an ISO and choose Mount image.

## Files and folders

Enter opens. Backspace goes up. F5 refreshes. F2 renames. Delete asks first. Drag a row to move it, or hold Ctrl while you drop to copy. Paste asks when the name already exists.

Right-click for Open, Cut, Copy, Paste, Rename, Delete, New folder, New file, Copy location, Info, Pin, Refresh, and Save snapshot.

Folder sizes are measured for the folders in view. A plus sign means the size is partial. Ctrl+Z undoes a practice-catalog change only. A change on a real disk is not undone.

## Find and Analyze

Find narrows the open folder. Save snapshot asks where to store the copy of the open folder, including an external drive. Keeps lists those copies, and earlier copies Windows already saved. Bring back restores a saved copy.

## Keys

| Key | Action |
| --- | --- |
| Enter | Open |
| Backspace | Up |
| F5 | Refresh |
| F2 | Rename |
| Delete | Delete |
| Ctrl+C / X / V | Copy, cut, paste |
| Ctrl+A | Select the folder |
| Ctrl+Shift+C | Copy the location |
| Ctrl+F | Find |
| Ctrl+Shift+F | Deep search |
| Ctrl+Shift+N | New folder |
| F6 | Switch panes |
| Alt+Enter | Info |
| Escape | Close a menu or dialog |
