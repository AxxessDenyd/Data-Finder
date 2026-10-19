use serde::Serialize;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
struct DiskEntry {
    name: String,
    path: String,
    kind: String,
    bytes: Option<u64>,
    modified: u64,
    hidden: bool,
    readonly: bool,
    system: bool,
    mounted: bool,
    capacity: Option<u64>,
    free: Option<u64>,
    media: String,
    label: String,
}

#[derive(Serialize)]
struct Measured {
    name: String,
    bytes: Option<u64>,
    partial: bool,
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|dur| dur.as_millis() as u64)
        .unwrap_or(0)
}

fn flags(meta: &fs::Metadata, name: &str) -> (bool, bool, bool) {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        let attrs = meta.file_attributes();
        (
            (attrs & 0x2) != 0 || name.starts_with('.'),
            (attrs & 0x1) != 0,
            (attrs & 0x4) != 0,
        )
    }
    #[cfg(not(windows))]
    {
        (name.starts_with('.'), meta.permissions().readonly(), false)
    }
}

fn push_entry(out: &mut Vec<DiskEntry>, name: String, path: PathBuf, meta: &fs::Metadata) {
    let is_dir = meta.is_dir();
    let (hidden, readonly, system) = flags(meta, &name);
    out.push(DiskEntry {
        name,
        path: path.to_string_lossy().to_string(),
        kind: if is_dir { "dir" } else { "file" }.into(),
        bytes: if is_dir { None } else { Some(meta.len()) },
        modified: modified_ms(meta),
        hidden,
        readonly,
        system,
        mounted: true,
        capacity: None,
        free: None,
        media: String::new(),
        label: String::new(),
    });
}

#[tauri::command]
fn drives() -> Vec<DiskEntry> {
    #[cfg(windows)]
    {
        windows_drives()
    }
    #[cfg(not(windows))]
    {
        let mut out = Vec::new();
        if Path::new("/").exists() {
            out.push(DiskEntry {
                name: "/".into(),
                path: "/".into(),
                kind: "drive".into(),
                bytes: None,
                modified: 0,
                hidden: false,
                readonly: false,
                system: false,
                mounted: true,
                capacity: None,
                free: None,
                media: "Local Disk".into(),
                label: String::new(),
            });
        }
        out
    }
}

#[cfg(windows)]
fn wide(text: &str) -> Vec<u16> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn from_wide(buf: &[u16]) -> String {
    let end = buf.iter().position(|unit| *unit == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

#[cfg(windows)]
fn multi_wide(buf: &[u16]) -> Vec<String> {
    let mut out = Vec::new();
    let mut start = 0;
    for (index, unit) in buf.iter().enumerate() {
        if *unit != 0 {
            continue;
        }
        if index == start {
            break;
        }
        out.push(String::from_utf16_lossy(&buf[start..index]));
        start = index + 1;
    }
    out
}

#[cfg(windows)]
mod winvol {
    pub const DRIVE_REMOVABLE: u32 = 2;
    pub const DRIVE_FIXED: u32 = 3;
    pub const DRIVE_REMOTE: u32 = 4;
    pub const DRIVE_CDROM: u32 = 5;
    pub const DRIVE_RAMDISK: u32 = 6;
    pub const GENERIC_READ: u32 = 0x8000_0000;
    pub const GENERIC_WRITE: u32 = 0x4000_0000;
    pub const FILE_SHARE_READ: u32 = 1;
    pub const FILE_SHARE_WRITE: u32 = 2;
    pub const OPEN_EXISTING: u32 = 3;
    pub const FSCTL_LOCK_VOLUME: u32 = 0x0009_0018;
    pub const FSCTL_DISMOUNT_VOLUME: u32 = 0x0009_0020;
    pub const IOCTL_STORAGE_EJECT_MEDIA: u32 = 0x002D_4808;
    pub const ERROR_MORE_DATA: u32 = 234;
    pub const INVALID_HANDLE: isize = -1;

    #[link(name = "kernel32")]
    extern "system" {
        pub fn GetLogicalDrives() -> u32;
        pub fn GetDriveTypeW(root: *const u16) -> u32;
        pub fn GetDiskFreeSpaceExW(dir: *const u16, free: *mut u64, total: *mut u64, total_free: *mut u64) -> i32;
        pub fn GetVolumeInformationW(
            root: *const u16,
            name: *mut u16,
            name_len: u32,
            serial: *mut u32,
            max_component: *mut u32,
            flags: *mut u32,
            fs: *mut u16,
            fs_len: u32,
        ) -> i32;
        pub fn FindFirstVolumeW(name: *mut u16, len: u32) -> isize;
        pub fn FindNextVolumeW(handle: isize, name: *mut u16, len: u32) -> i32;
        pub fn FindVolumeClose(handle: isize) -> i32;
        pub fn GetVolumePathNamesForVolumeNameW(volume: *const u16, paths: *mut u16, len: u32, returned: *mut u32) -> i32;
        pub fn GetWindowsDirectoryW(buf: *mut u16, len: u32) -> u32;
        pub fn CreateFileW(
            name: *const u16,
            access: u32,
            share: u32,
            security: *mut core::ffi::c_void,
            disposition: u32,
            flags: u32,
            template: isize,
        ) -> isize;
        pub fn DeviceIoControl(
            handle: isize,
            code: u32,
            input: *mut core::ffi::c_void,
            input_len: u32,
            output: *mut core::ffi::c_void,
            output_len: u32,
            returned: *mut u32,
            overlapped: *mut core::ffi::c_void,
        ) -> i32;
        pub fn CloseHandle(handle: isize) -> i32;
        pub fn DeleteVolumeMountPointW(path: *const u16) -> i32;
        pub fn GetLastError() -> u32;
    }

    #[link(name = "mpr")]
    extern "system" {
        pub fn WNetCancelConnection2W(name: *const u16, flags: u32, force: i32) -> u32;
    }
}

#[cfg(windows)]
fn volume_label(root: &str) -> String {
    let mut name = [0u16; 64];
    let ok = unsafe {
        winvol::GetVolumeInformationW(
            wide(root).as_ptr(),
            name.as_mut_ptr(),
            name.len() as u32,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            0,
        )
    };
    if ok == 0 {
        return String::new();
    }
    from_wide(&name).trim().to_string()
}

#[cfg(windows)]
fn windows_letter() -> Option<char> {
    let mut buf = [0u16; 260];
    let len = unsafe { winvol::GetWindowsDirectoryW(buf.as_mut_ptr(), buf.len() as u32) };
    if len == 0 {
        return None;
    }
    from_wide(&buf).chars().next().map(|ch| ch.to_ascii_uppercase())
}

#[cfg(windows)]
fn windows_drives() -> Vec<DiskEntry> {
    let mut out = Vec::new();
    let mask = unsafe { winvol::GetLogicalDrives() };
    for index in 0..26 {
        if mask & (1 << index) == 0 {
            continue;
        }
        let letter = (b'A' + index) as char;
        let root = format!("{letter}:\\");
        let kind = unsafe { winvol::GetDriveTypeW(wide(&root).as_ptr()) };
        if kind == 1 {
            continue;
        }
        let mut caller_free = 0u64;
        let mut total = 0u64;
        let ready = unsafe { winvol::GetDiskFreeSpaceExW(wide(&root).as_ptr(), &mut caller_free, &mut total, std::ptr::null_mut()) } != 0;
        let label = volume_label(&root);
        let media = match kind {
            winvol::DRIVE_REMOVABLE => "Removable Disk",
            winvol::DRIVE_FIXED => "Local Disk",
            winvol::DRIVE_REMOTE => "Network Drive",
            winvol::DRIVE_CDROM => "Optical Drive",
            winvol::DRIVE_RAMDISK => "RAM Disk",
            _ => "Disk",
        };
        out.push(DiskEntry {
            name: format!("{letter}:"),
            path: root,
            kind: "drive".into(),
            bytes: None,
            modified: 0,
            hidden: false,
            readonly: false,
            system: windows_letter() == Some(letter.to_ascii_uppercase()),
            mounted: ready,
            capacity: if ready { Some(total) } else { None },
            free: if ready { Some(caller_free) } else { None },
            media: media.into(),
            label,
        });
    }

    let mut volume = [0u16; 260];
    let handle = unsafe { winvol::FindFirstVolumeW(volume.as_mut_ptr(), volume.len() as u32) };
    if handle != winvol::INVALID_HANDLE && handle != 0 {
        let mut disks = 1u32;
        loop {
            let vol = from_wide(&volume);
            let mut paths = [0u16; 1024];
            let mut returned = 0u32;
            let ok = unsafe {
                winvol::GetVolumePathNamesForVolumeNameW(wide(&vol).as_ptr(), paths.as_mut_ptr(), paths.len() as u32, &mut returned)
            };
            let err = if ok == 0 { unsafe { winvol::GetLastError() } } else { 0 };
            let mounted_somewhere = ok != 0 && multi_wide(&paths).iter().any(|path| !path.is_empty());
            if !mounted_somewhere && err != winvol::ERROR_MORE_DATA {
                let label = volume_label(&vol);
                out.push(DiskEntry {
                    name: format!("Disk {disks}"),
                    path: vol,
                    kind: "drive".into(),
                    bytes: None,
                    modified: 0,
                    hidden: false,
                    readonly: false,
                    system: false,
                    mounted: false,
                    capacity: None,
                    free: None,
                    media: "Disk".into(),
                    label,
                });
                disks += 1;
            }
            volume = [0; 260];
            if unsafe { winvol::FindNextVolumeW(handle, volume.as_mut_ptr(), volume.len() as u32) } == 0 {
                break;
            }
        }
        unsafe { winvol::FindVolumeClose(handle); }
    }
    out
}

#[cfg(windows)]
fn device_path(path: &str) -> String {
    if path.starts_with("\\\\?\\Volume") || path.starts_with("\\\\.\\Volume") {
        let trimmed = path.trim_end_matches('\\');
        return trimmed.replacen("\\\\?\\", "\\\\.\\", 1);
    }
    let letter = path.chars().next().unwrap_or('C');
    format!("\\\\.\\{letter}:")
}

#[cfg(windows)]
fn ioctl(handle: isize, code: u32) -> bool {
    let mut returned = 0u32;
    unsafe {
        winvol::DeviceIoControl(
            handle,
            code,
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            0,
            &mut returned,
            std::ptr::null_mut(),
        ) != 0
    }
}

#[cfg(windows)]
fn unmount_windows(path: &str) -> Result<String, String> {
    let root = if path.starts_with("\\\\") {
        if path.ends_with('\\') { path.to_string() } else { format!("{path}\\") }
    } else {
        let letter = path.chars().next().ok_or_else(|| "That drive is not mounted".to_string())?;
        format!("{}:\\", letter.to_ascii_uppercase())
    };
    if let Some(letter) = root.chars().next() {
        if !root.starts_with("\\\\") && windows_letter() == Some(letter.to_ascii_uppercase()) {
            return Err("Windows is running from this drive, so it stays mounted".into());
        }
    }
    let kind = unsafe { winvol::GetDriveTypeW(wide(&root).as_ptr()) };
    if kind == winvol::DRIVE_REMOTE {
        let share = root.trim_end_matches('\\');
        let code = unsafe { winvol::WNetCancelConnection2W(wide(share).as_ptr(), 0, 1) };
        if code != 0 {
            return Err(format!("Could not disconnect {share} ({code})"));
        }
        return Ok(format!("{share} disconnected"));
    }
    let handle = unsafe {
        winvol::CreateFileW(
            wide(&device_path(&root)).as_ptr(),
            winvol::GENERIC_READ | winvol::GENERIC_WRITE,
            winvol::FILE_SHARE_READ | winvol::FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            winvol::OPEN_EXISTING,
            0,
            0,
        )
    };
    if handle == winvol::INVALID_HANDLE {
        let code = unsafe { winvol::GetLastError() };
        return Err(format!("Could not open that drive ({code}). Close anything using it and try again."));
    }
    let _locked = ioctl(handle, winvol::FSCTL_LOCK_VOLUME);
    let dismounted = ioctl(handle, winvol::FSCTL_DISMOUNT_VOLUME);
    let ejected = if kind == winvol::DRIVE_REMOVABLE || kind == winvol::DRIVE_CDROM {
        ioctl(handle, winvol::IOCTL_STORAGE_EJECT_MEDIA)
    } else {
        false
    };
    unsafe { winvol::CloseHandle(handle); }
    let mut letter_removed = false;
    if root.chars().nth(1) == Some(':') {
        letter_removed = unsafe { winvol::DeleteVolumeMountPointW(wide(&root).as_ptr()) } != 0;
    }
    if !dismounted && !ejected && !letter_removed {
        return Err("Could not unmount that drive. Close anything using it and try again.".into());
    }
    if ejected {
        return Ok(format!("{root} ejected"));
    }
    Ok(format!("{root} unmounted"))
}

#[tauri::command]
fn unmount_drive(path: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        unmount_windows(&path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Unmount only works in the Windows program".into())
    }
}

#[tauri::command]
async fn list_dir(path: String) -> Result<Vec<DiskEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || list_dir_sync(&path))
        .await
        .map_err(|err| err.to_string())?
}

fn list_dir_sync(path: &str) -> Result<Vec<DiskEntry>, String> {
    let read = fs::read_dir(path).map_err(|err| err.to_string())?;
    let mut out = Vec::new();
    for item in read.flatten() {
        let file_path = item.path();
        let name = item.file_name().to_string_lossy().to_string();
        if name == "." || name == ".." {
            continue;
        }
        let Ok(meta) = fs::symlink_metadata(&file_path) else {
            continue;
        };
        push_entry(&mut out, name, file_path, &meta);
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(out)
}

fn safe_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name == "." || name == ".." {
        return Err("That name cannot be used".into());
    }
    Ok(())
}

fn nested(ancestor: &Path, path: &Path) -> bool {
    let root = ancestor.components().collect::<Vec<_>>();
    let child = path.components().collect::<Vec<_>>();
    child.len() >= root.len() && root.iter().zip(child.iter()).all(|(left, right)| left == right)
}

fn remove_any(target: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(target).map_err(|err| err.to_string())?;
    if meta.is_dir() && !meta.file_type().is_symlink() {
        fs::remove_dir_all(target).map_err(|err| err.to_string())
    } else {
        fs::remove_file(target).map_err(|err| err.to_string())
    }
}

fn copy_rec(from: &Path, to: &Path) -> Result<(), String> {
    let meta = fs::symlink_metadata(from).map_err(|err| err.to_string())?;
    if meta.is_dir() && !meta.file_type().is_symlink() {
        fs::create_dir_all(to).map_err(|err| err.to_string())?;
        for entry in fs::read_dir(from).map_err(|err| err.to_string())?.flatten() {
            copy_rec(&entry.path(), &to.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        if let Some(parent) = to.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        fs::copy(from, to).map_err(|err| err.to_string())?;
        Ok(())
    }
}

fn place(from: &str, parent: &str, name: &str, remove_source: bool) -> Result<(), String> {
    safe_name(name)?;
    let source = PathBuf::from(from);
    let dest_parent = PathBuf::from(parent);
    let dest = dest_parent.join(name);
    if nested(&source, &dest_parent) {
        return Err("Cannot put a folder inside itself".into());
    }
    if dest == source {
        return Ok(());
    }
    if dest.exists() {
        remove_any(&dest)?;
    }
    if remove_source {
        match fs::rename(&source, &dest) {
            Ok(()) => Ok(()),
            Err(_) => {
                copy_rec(&source, &dest)?;
                remove_any(&source)
            }
        }
    } else {
        copy_rec(&source, &dest)
    }
}

#[tauri::command]
async fn copy_item(from: String, parent: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || place(&from, &parent, &name, false))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn move_item(from: String, parent: String, name: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || place(&from, &parent, &name, true))
        .await
        .map_err(|err| err.to_string())?
}

fn dir_size(path: &Path, budget: &mut u32, depth: u32) -> (u64, bool) {
    if *budget == 0 || depth > 48 {
        return (0, false);
    }
    *budget -= 1;
    let Ok(meta) = fs::symlink_metadata(path) else {
        return (0, false);
    };
    if meta.file_type().is_symlink() || !meta.is_dir() {
        return (meta.len(), true);
    }
    let Ok(entries) = fs::read_dir(path) else {
        return (0, false);
    };
    let mut total = 0u64;
    let mut complete = true;
    for entry in entries.flatten() {
        let (bytes, child_ok) = dir_size(&entry.path(), budget, depth + 1);
        total = total.saturating_add(bytes);
        if !child_ok {
            complete = false;
            if *budget == 0 {
                break;
            }
        }
    }
    (total, complete)
}

#[tauri::command]
async fn measure_children(path: String) -> Result<Vec<Measured>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        for entry in fs::read_dir(&path).map_err(|err| err.to_string())?.flatten() {
            let meta = match fs::symlink_metadata(entry.path()) {
                Ok(meta) => meta,
                Err(_) => continue,
            };
            if !(meta.is_dir() && !meta.file_type().is_symlink()) {
                continue;
            }
            let mut budget = 25_000u32;
            let (bytes, complete) = dir_size(&entry.path(), &mut budget, 0);
            let partial = !complete;
            out.push(Measured {
                name: entry.file_name().to_string_lossy().to_string(),
                bytes: if bytes == 0 && partial { None } else { Some(bytes) },
                partial,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
fn create_item(parent: String, name: String, file: bool) -> Result<(), String> {
    safe_name(&name)?;
    let dest = Path::new(&parent).join(&name);
    if file {
        File::create(&dest).map_err(|err| err.to_string())?;
    } else {
        fs::create_dir(&dest).map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn rename_path(path: String, name: String) -> Result<(), String> {
    safe_name(&name)?;
    let from = PathBuf::from(&path);
    let parent = from.parent().ok_or_else(|| "That item cannot be renamed".to_string())?;
    fs::rename(&from, parent.join(name)).map_err(|err| err.to_string())
}

#[tauri::command]
fn remove_path(path: String) -> Result<(), String> {
    remove_any(Path::new(&path))
}

#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    let meta = fs::metadata(&path).map_err(|err| err.to_string())?;
    if meta.len() > 256 * 1024 {
        return Err("That file is too large to show here".into());
    }
    let mut file = File::open(&path).map_err(|err| err.to_string())?;
    let mut buf = String::new();
    file.read_to_string(&mut buf).map_err(|_| "This file is not text".to_string())?;
    Ok(buf)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            drives,
            list_dir,
            create_item,
            rename_path,
            remove_path,
            read_text,
            copy_item,
            move_item,
            measure_children,
            unmount_drive
        ])
        .run(tauri::generate_context!())
        .expect("Data Finder failed to start");
}