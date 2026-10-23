use serde::Serialize;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Emitter;

mod recover;

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
    blocked: bool,
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
fn drive_mask() -> u32 {
    #[cfg(windows)]
    {
        unsafe { winvol::GetLogicalDrives() }
    }
    #[cfg(not(windows))]
    {
        0
    }
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
        pub fn SetVolumeMountPointW(mount: *const u16, volume: *const u16) -> i32;
        pub fn GetLastError() -> u32;
    }

    #[link(name = "mpr")]
    extern "system" {
        pub fn WNetCancelConnection2W(name: *const u16, flags: u32, force: i32) -> u32;
        pub fn WNetAddConnection2W(resource: *const NetResource, password: *const u16, user: *const u16, flags: u32) -> u32;
    }

    #[repr(C)]
    pub struct NetResource {
        pub scope: u32,
        pub kind: u32,
        pub display: u32,
        pub usage: u32,
        pub local: *const u16,
        pub remote: *const u16,
        pub comment: *mut u16,
        pub provider: *mut u16,
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
    let read = fs::read_dir(path).map_err(|err| format!("Could not open this folder ({err})"))?;
    let mut out = Vec::new();
    for item in read.flatten() {
        let file_path = item.path();
        let name = item.file_name().to_string_lossy().to_string();
        if name == "." || name == ".." {
            continue;
        }
        let meta = match fs::symlink_metadata(&file_path).or_else(|_| fs::metadata(&file_path)) {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        let followed = if meta.file_type().is_symlink() {
            fs::metadata(&file_path).unwrap_or(meta)
        } else {
            meta
        };
        push_entry(&mut out, name, file_path, &followed);
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
    if meta.file_type().is_symlink() {
        return match fs::metadata(path) {
            Ok(followed) if followed.is_dir() => walk_dir(path, budget, depth),
            Ok(followed) => (followed.len(), true),
            Err(_) => (0, false),
        };
    }
    if !meta.is_dir() {
        return (meta.len(), true);
    }
    walk_dir(path, budget, depth)
}

fn walk_dir(path: &Path, budget: &mut u32, depth: u32) -> (u64, bool) {
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
                if meta.file_type().is_symlink() {
                    if let Ok(followed) = fs::metadata(entry.path()) {
                        if followed.is_dir() {
                            let mut budget = u32::MAX;
                            let (bytes, complete) = dir_size(&entry.path(), &mut budget, 0);
                            out.push(Measured {
                                name: entry.file_name().to_string_lossy().to_string(),
                                bytes: Some(bytes),
                                partial: !complete,
                                blocked: bytes == 0 && !complete,
                            });
                        }
                    }
                }
                continue;
            }
            if fs::read_dir(entry.path()).is_err() {
                out.push(Measured {
                    name: entry.file_name().to_string_lossy().to_string(),
                    bytes: None,
                    partial: true,
                    blocked: true,
                });
                continue;
            }
            let mut budget = u32::MAX;
            let (bytes, complete) = dir_size(&entry.path(), &mut budget, 0);
            let partial = !complete;
            out.push(Measured {
                name: entry.file_name().to_string_lossy().to_string(),
                bytes: if bytes == 0 && partial { None } else { Some(bytes) },
                partial,
                blocked: bytes == 0 && partial,
            });
        }
        Ok(out)
    })
    .await
    .map_err(|err| err.to_string())?
}

#[derive(Serialize)]
struct ExactSize {
    bytes: u64,
    files: u64,
    folders: u64,
    exact: bool,
    blocked: bool,
}

fn measure_tree(root: &Path) -> ExactSize {
    let mut bytes = 0u64;
    let mut files = 0u64;
    let mut folders = 0u64;
    let mut exact = true;
    let mut stack = vec![root.to_path_buf()];
    let mut saw_root = false;
    while let Some(path) = stack.pop() {
        let meta = match fs::symlink_metadata(&path) {
            Ok(meta) => meta,
            Err(_) => {
                if !saw_root {
                    return ExactSize { bytes: 0, files: 0, folders: 0, exact: false, blocked: true };
                }
                exact = false;
                continue;
            }
        };
        let followed = if meta.file_type().is_symlink() {
            match fs::metadata(&path) {
                Ok(item) => item,
                Err(_) => {
                    exact = false;
                    saw_root = true;
                    continue;
                }
            }
        } else {
            meta
        };
        if followed.is_dir() {
            if saw_root {
                folders += 1;
            }
            saw_root = true;
            match fs::read_dir(&path) {
                Ok(entries) => {
                    for entry in entries.flatten() {
                        stack.push(entry.path());
                    }
                }
                Err(_) => {
                    if folders == 0 && files == 0 && path == root {
                        return ExactSize { bytes: 0, files: 0, folders: 0, exact: false, blocked: true };
                    }
                    exact = false;
                }
            }
        } else {
            saw_root = true;
            files += 1;
            bytes = bytes.saturating_add(followed.len());
        }
    }
    ExactSize { bytes, files, folders, exact, blocked: false }
}

#[tauri::command]
async fn measure_path(path: String) -> Result<ExactSize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(&path);
        if !path.exists() {
            return Err("That item was not found".into());
        }
        Ok(measure_tree(&path))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
fn recovery_start(letter: String, kinds: Vec<String>, deep: bool, name: String) -> Result<(), String> {
    recover::start(letter, kinds, deep, name)
}

#[tauri::command]
fn recovery_status() -> recover::RecoveryStatus {
    recover::status()
}

#[tauri::command]
fn recovery_stop() {
    recover::stop()
}

#[tauri::command]
fn recovery_save(ids: Vec<u64>, folder: String) -> Result<recover::RecoverResult, String> {
    recover::save(ids, folder)
}

#[tauri::command]
fn recovery_clear() -> Result<(), String> {
    recover::clear()
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

#[tauri::command]
fn mount_image(path: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        let lower = path.to_lowercase();
        if !lower.ends_with(".iso") {
            return Err("Only an ISO image can be mounted".into());
        }
        if !Path::new(&path).is_file() {
            return Err("That image was not found".into());
        }
        let status = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Mount-DiskImage -ImagePath $env:DF_IMAGE | Out-Null",
            ])
            .env("DF_IMAGE", &path)
            .status()
            .map_err(|err| err.to_string())?;
        if !status.success() {
            return Err("Could not mount that image".into());
        }
        Ok("Image mounted".into())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Mount only works in the Windows program".into())
    }
}

#[tauri::command]
fn format_drive(path: String, filesystem: String, label: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        let letter = path
            .chars()
            .next()
            .filter(|ch| ch.is_ascii_alphabetic())
            .ok_or_else(|| "That drive cannot be formatted".to_string())?
            .to_ascii_uppercase();
        if path.starts_with("\\\\") || windows_letter() == Some(letter) {
            return Err("The Windows drive cannot be formatted".into());
        }
        let fs = match filesystem.to_ascii_uppercase().as_str() {
            "NTFS" => "NTFS",
            "EXFAT" => "exFAT",
            "FAT32" => "FAT32",
            _ => return Err("Choose NTFS, exFAT, or FAT32".into()),
        };
        let limit = if fs == "FAT32" { 11 } else { 32 };
        let clean: String = label
            .chars()
            .filter(|ch| ch.is_ascii_alphanumeric() || *ch == ' ' || *ch == '-' || *ch == '_')
            .take(limit)
            .collect();
        let vol = clean.trim();
        let volume = if vol.is_empty() { "Data" } else { vol };
        let status = Command::new("format.com")
            .args([
                format!("{letter}:"),
                format!("/FS:{fs}"),
                format!("/V:{volume}"),
                "/Q".into(),
                "/Y".into(),
            ])
            .status()
            .map_err(|err| err.to_string())?;
        if !status.success() {
            return Err("Could not format that drive. Windows may need an administrator.".into());
        }
        Ok(format!("{letter}:\\ formatted"))
    }
    #[cfg(not(windows))]
    {
        let _ = (path, filesystem, label);
        Err("Format only works in the Windows program".into())
    }
}

#[derive(Serialize, serde::Deserialize, Clone)]
struct SnapInfo {
    id: String,
    taken: u64,
    sources: Vec<String>,
    files: u64,
    bytes: u64,
    skipped: u64,
}

#[derive(Serialize)]
struct KnownFolder {
    name: String,
    path: String,
}

fn snap_root() -> PathBuf {
    let base = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().to_string());
    PathBuf::from(base).join("Data Finder").join("Snapshots")
}

fn locations_file() -> PathBuf {
    snap_root().join("locations.json")
}

fn read_locations() -> Vec<String> {
    let Ok(text) = fs::read_to_string(locations_file()) else {
        return Vec::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

fn remember_location(dir: &Path) {
    let mut paths = read_locations();
    let text = dir.to_string_lossy().to_string();
    if paths.iter().any(|item| item.eq_ignore_ascii_case(&text)) {
        return;
    }
    paths.push(text);
    let _ = fs::create_dir_all(snap_root());
    if let Ok(body) = serde_json::to_string_pretty(&paths) {
        let _ = fs::write(locations_file(), body);
    }
}

fn read_snap(dir: &Path) -> Option<SnapInfo> {
    let text = fs::read_to_string(dir.join("manifest.json")).ok()?;
    serde_json::from_str(&text).ok()
}

fn find_snapshot(id: &str) -> Option<PathBuf> {
    let direct = snap_root().join(id);
    if read_snap(&direct).is_some() {
        return Some(direct);
    }
    for path in read_locations() {
        let dir = PathBuf::from(path);
        if read_snap(&dir).is_some_and(|info| info.id == id) {
            return Some(dir);
        }
    }
    None
}

fn copy_tree(from: &Path, to: &Path, files: &mut u64, bytes: &mut u64, skipped: &mut u64, depth: u32) {
    if depth > 40 {
        *skipped += 1;
        return;
    }
    let Ok(meta) = fs::symlink_metadata(from) else {
        *skipped += 1;
        return;
    };
    let directory = if meta.file_type().is_symlink() {
        fs::metadata(from).map(|item| item.is_dir()).unwrap_or(false)
    } else {
        meta.is_dir()
    };
    if directory {
        if fs::create_dir_all(to).is_err() {
            *skipped += 1;
            return;
        }
        let Ok(entries) = fs::read_dir(from) else {
            *skipped += 1;
            return;
        };
        for entry in entries.flatten() {
            copy_tree(&entry.path(), &to.join(entry.file_name()), files, bytes, skipped, depth + 1);
        }
        return;
    }
    if let Some(parent) = to.parent() {
        let _ = fs::create_dir_all(parent);
    }
    match fs::copy(from, to) {
        Ok(len) => {
            *files += 1;
            *bytes += len;
        }
        Err(_) => *skipped += 1,
    }
}

#[tauri::command]
async fn snapshot_save(sources: Vec<String>, folder: String) -> Result<SnapInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if sources.is_empty() {
            return Err("Choose a folder to snapshot".into());
        }
        let id = format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
        let parent = {
            let trimmed = folder.trim();
            if trimmed.is_empty() { snap_root() } else { PathBuf::from(trimmed) }
        };
        fs::create_dir_all(&parent).map_err(|err| err.to_string())?;
        let root = parent.join(&id);
        let store = root.join("files");
        fs::create_dir_all(&store).map_err(|err| err.to_string())?;
        let mut files = 0u64;
        let mut bytes = 0u64;
        let mut skipped = 0u64;
        let mut kept = Vec::new();
        for (index, source) in sources.iter().enumerate() {
            let from = PathBuf::from(source);
            if !from.exists() {
                skipped += 1;
                continue;
            }
            if nested(&root, &from) || nested(&from, &root) {
                return Err("A snapshot cannot copy its own storage folder".into());
            }
            copy_tree(&from, &store.join(index.to_string()), &mut files, &mut bytes, &mut skipped, 0);
            kept.push(source.clone());
        }
        if kept.is_empty() {
            let _ = fs::remove_dir_all(&root);
            return Err("None of those folders could be read".into());
        }
        let info = SnapInfo {
            id,
            taken: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0),
            sources: kept,
            files,
            bytes,
            skipped,
        };
        fs::write(root.join("manifest.json"), serde_json::to_string_pretty(&info).map_err(|err| err.to_string())?).map_err(|err| err.to_string())?;
        remember_location(&root);
        Ok(info)
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
fn snapshot_list() -> Vec<SnapInfo> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut consider = |dir: PathBuf| {
        let Some(info) = read_snap(&dir) else { return };
        if seen.insert(info.id.clone()) {
            out.push(info);
        }
    };
    if let Ok(entries) = fs::read_dir(snap_root()) {
        for entry in entries.flatten() {
            if entry.path().is_dir() {
                consider(entry.path());
            }
        }
    }
    for path in read_locations() {
        consider(PathBuf::from(path));
    }
    out.sort_by(|a, b| b.taken.cmp(&a.taken));
    out
}

#[tauri::command]
async fn snapshot_restore(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = find_snapshot(&id).ok_or_else(|| "That snapshot was not found".to_string())?;
        let text = fs::read_to_string(root.join("manifest.json")).map_err(|_| "That snapshot was not found".to_string())?;
        let info: SnapInfo = serde_json::from_str(&text).map_err(|err| err.to_string())?;
        let mut restored = 0u64;
        let mut bytes = 0u64;
        let mut skipped = 0u64;
        for (index, source) in info.sources.iter().enumerate() {
            let from = root.join("files").join(index.to_string());
            if !from.exists() {
                skipped += 1;
                continue;
            }
            copy_tree(&from, Path::new(source), &mut restored, &mut bytes, &mut skipped, 0);
        }
        Ok(format!("Restored {restored} file(s)"))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
fn snapshot_remove(id: String) -> Result<(), String> {
    let root = find_snapshot(&id).ok_or_else(|| "That snapshot was not found".to_string())?;
    let allowed = root.starts_with(snap_root()) || read_locations().iter().any(|path| PathBuf::from(path) == root);
    if !allowed {
        return Err("That snapshot cannot be removed".into());
    }
    fs::remove_dir_all(&root).map_err(|err| err.to_string())?;
    let left: Vec<String> = read_locations().into_iter().filter(|path| PathBuf::from(path) != root).collect();
    if let Ok(body) = serde_json::to_string_pretty(&left) {
        let _ = fs::write(locations_file(), body);
    }
    Ok(())
}

#[tauri::command]
fn known_folders() -> Vec<KnownFolder> {
    #[cfg(windows)]
    {
        let ids = [
            ("Desktop", (0xB4BFCC3A, 0xDB2C, 0x424C, [0xB0, 0x29, 0x7F, 0xE9, 0x9A, 0x87, 0xC6, 0x41])),
            ("Documents", (0xFDD39AD0, 0x238F, 0x46AF, [0xAD, 0xB4, 0x6C, 0x85, 0x48, 0x03, 0x69, 0xC7])),
            ("Downloads", (0x374DE290, 0x123F, 0x4565, [0x91, 0x64, 0x39, 0xC4, 0x92, 0x5E, 0x46, 0x7B])),
            ("Pictures", (0x33E28130, 0x4E1E, 0x4676, [0x83, 0x5A, 0x98, 0x39, 0x5C, 0x3B, 0xC3, 0xBB])),
            ("Music", (0x4BD8D571, 0x6D19, 0x48D3, [0xBE, 0x97, 0x42, 0x22, 0x20, 0x08, 0x0E, 0x43])),
            ("Videos", (0x18989B1D, 0x99B5, 0x455B, [0x84, 0x1C, 0xAB, 0x7C, 0x74, 0xE4, 0xDD, 0xFC])),
            ("Windows", (0xF38BF404, 0x1D43, 0x42F2, [0x93, 0x05, 0x67, 0xDE, 0x0B, 0x28, 0xFC, 0x23])),
            ("Program Files", (0x905E63B6, 0xC1BF, 0x494E, [0xB2, 0x9C, 0x65, 0xB7, 0x32, 0xD3, 0xD2, 0x1A])),
            ("Program Files (x86)", (0x7C5A40EF, 0xA0FB, 0x4BFC, [0x87, 0x4A, 0xC0, 0xF2, 0xE0, 0xB9, 0xFA, 0x8E])),
        ];
        let mut out = Vec::new();
        for (name, id) in ids {
            if let Some(path) = known_folder_path(id) {
                if Path::new(&path).is_dir() {
                    out.push(KnownFolder { name: name.into(), path });
                }
            }
        }
        return out;
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
fn known_folder_path(id: (u32, u16, u16, [u8; 8])) -> Option<String> {
    #[repr(C)]
    struct Guid {
        d1: u32,
        d2: u16,
        d3: u16,
        d4: [u8; 8],
    }
    #[link(name = "shell32")]
    extern "system" {
        fn SHGetKnownFolderPath(id: *const Guid, flags: u32, token: *mut core::ffi::c_void, path: *mut *mut u16) -> i32;
    }
    #[link(name = "ole32")]
    extern "system" {
        fn CoTaskMemFree(ptr: *mut core::ffi::c_void);
    }
    let guid = Guid { d1: id.0, d2: id.1, d3: id.2, d4: id.3 };
    let mut ptr: *mut u16 = std::ptr::null_mut();
    let hr = unsafe { SHGetKnownFolderPath(&guid, 0, std::ptr::null_mut(), &mut ptr) };
    if hr != 0 || ptr.is_null() {
        return None;
    }
    let mut len = 0usize;
    unsafe {
        while *ptr.add(len) != 0 {
            len += 1;
        }
    }
    let text = unsafe { String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len)) };
    unsafe { CoTaskMemFree(ptr as *mut core::ffi::c_void); }
    if text.is_empty() { None } else { Some(text) }
}

#[tauri::command]
fn mount_volume(path: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        if !path.starts_with("\\\\?\\Volume") {
            return Err("That drive cannot be given a letter".into());
        }
        let volume = if path.ends_with('\\') { path.clone() } else { format!("{path}\\") };
        let mask = unsafe { winvol::GetLogicalDrives() };
        let mut letter = None;
        for index in 0..26 {
            if mask & (1 << index) == 0 {
                letter = Some((b'A' + index) as char);
                break;
            }
        }
        let letter = letter.ok_or_else(|| "No free drive letter".to_string())?;
        let mount = format!("{letter}:\\");
        let ok = unsafe { winvol::SetVolumeMountPointW(wide(&mount).as_ptr(), wide(&volume).as_ptr()) };
        if ok == 0 {
            let code = unsafe { winvol::GetLastError() };
            return Err(format!("Could not mount that drive ({code})"));
        }
        return Ok(format!("Mounted as {letter}:"));
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Mount only works in the Windows program".into())
    }
}

#[tauri::command]
fn map_network(unc: String, letter: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        let remote = unc.trim().to_string();
        if !remote.starts_with("\\\\") || remote.chars().any(|ch| ch.is_control()) {
            return Err("Use a path like \\\\server\\share".into());
        }
        let local = letter.trim().to_string();
        let local_wide;
        let local_ptr: *const u16 = if local.is_empty() {
            std::ptr::null::<u16>()
        } else {
            let ch = local.chars().next().filter(|item| item.is_ascii_alphabetic()).ok_or_else(|| "Choose a drive letter".to_string())?;
            local_wide = wide(&format!("{}:", ch.to_ascii_uppercase()));
            local_wide.as_ptr()
        };
        let remote_wide = wide(&remote);
        let resource = winvol::NetResource {
            scope: 0,
            kind: 1,
            display: 0,
            usage: 0,
            local: local_ptr,
            remote: remote_wide.as_ptr(),
            comment: std::ptr::null_mut(),
            provider: std::ptr::null_mut(),
        };
        let code = unsafe { winvol::WNetAddConnection2W(&resource, std::ptr::null::<u16>(), std::ptr::null::<u16>(), 1) };
        if code != 0 {
            return Err(format!("Could not add that network place ({code})"));
        }
        return Ok(if local.is_empty() { format!("Added {remote}") } else { format!("Mapped {remote}") });
    }
    #[cfg(not(windows))]
    {
        let _ = (unc, letter);
        Err("Network drives only work in the Windows program".into())
    }
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://github.com/AxxessDenyd/Data-Finder") || url.chars().any(|ch| ch.is_control() || ch == '"') {
        return Err("That link cannot be opened".into());
    }
    #[cfg(windows)]
    {
        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteW(hwnd: isize, op: *const u16, file: *const u16, params: *const u16, dir: *const u16, show: i32) -> isize;
        }
        let code = unsafe {
            ShellExecuteW(0, wide("open").as_ptr(), wide(&url).as_ptr(), std::ptr::null::<u16>(), std::ptr::null::<u16>(), 1)
        };
        if code <= 32 {
            return Err("Could not open that link".into());
        }
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        Err("Open the project page from a browser".into())
    }
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    if path.chars().any(|ch| ch.is_control()) || !Path::new(&path).exists() {
        return Err("That file could not be opened".into());
    }
    #[cfg(windows)]
    {
        #[link(name = "shell32")]
        extern "system" {
            fn ShellExecuteW(hwnd: isize, op: *const u16, file: *const u16, params: *const u16, dir: *const u16, show: i32) -> isize;
        }
        let code = unsafe { ShellExecuteW(0, wide("open").as_ptr(), wide(&path).as_ptr(), std::ptr::null::<u16>(), std::ptr::null::<u16>(), 1) };
        if code <= 32 {
            return Err("Windows could not open that file".into());
        }
        return Ok(());
    }
    #[cfg(not(windows))]
    {
        Err("Opening a file works in the Windows program".into())
    }
}

#[derive(Serialize)]
struct EarlierCopy {
    id: String,
    created: String,
    volume: String,
    device: String,
}

#[derive(Serialize)]
struct EarlierEntry {
    name: String,
    kind: String,
    bytes: Option<u64>,
}

fn shadow_device_ok(device: &str) -> bool {
    match device.strip_prefix(r"\\?\GLOBALROOT\Device\HarddiskVolumeShadowCopy") {
        Some(rest) => !rest.is_empty() && rest.chars().all(|ch| ch.is_ascii_digit()),
        None => false,
    }
}

fn earlier_relative(folder: &str) -> Result<PathBuf, String> {
    let folder = folder.trim().trim_matches(|ch: char| ch == '\\' || ch == '/');
    if folder.chars().any(|ch| ch.is_control()) || folder.split(['\\', '/']).any(|part| part == "." || part == "..") {
        return Err("That folder cannot be opened".into());
    }
    Ok(PathBuf::from(folder))
}

fn parse_shadows(text: &str) -> Vec<EarlierCopy> {
    let mut out = Vec::new();
    let mut created = String::new();
    let mut volume = String::new();
    let mut id = String::new();
    for line in text.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Contains ") {
            if let Some(when) = rest.split("creation time:").nth(1) {
                created = when.trim().to_string();
            }
        } else if let Some(rest) = line.strip_prefix("Shadow Copy ID:") {
            id = rest.trim().to_string();
            volume.clear();
        } else if let Some(rest) = line.strip_prefix("Original Volume:") {
            let raw = rest.trim();
            volume = match (raw.find('('), raw.find(')')) {
                (Some(start), Some(end)) if end > start => raw[start + 1..end].to_string(),
                _ => raw.to_string(),
            };
        } else if let Some(rest) = line.strip_prefix("Shadow Copy Volume:") {
            let device = rest.trim().to_string();
            if shadow_device_ok(&device) {
                out.push(EarlierCopy {
                    id: if id.is_empty() { device.clone() } else { id.clone() },
                    created: created.clone(),
                    volume: if volume.is_empty() { "Disk".into() } else { volume.clone() },
                    device,
                });
            }
            id.clear();
            volume.clear();
        }
    }
    out
}

#[tauri::command]
fn earlier_list() -> Result<Vec<EarlierCopy>, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let output = Command::new("vssadmin")
            .args(["list", "shadows"])
            .creation_flags(0x08000000)
            .output()
            .map_err(|err| err.to_string())?;
        let text = String::from_utf8_lossy(&output.stdout);
        let err = String::from_utf8_lossy(&output.stderr);
        let copies = parse_shadows(&text);
        if copies.is_empty() && !output.status.success() {
            let message = if text.trim().is_empty() { err.trim().to_string() } else { text.trim().to_string() };
            let lower = message.to_lowercase();
            if lower.contains("denied") || lower.contains("privilege") || lower.contains("administrator") {
                return Err("Earlier copies need Data Finder to run as administrator.".into());
            }
            if lower.contains("no items") || lower.contains("no shadow") {
                return Ok(Vec::new());
            }
            let short = message.lines().next().unwrap_or("Could not read earlier copies").to_string();
            return Err(short);
        }
        Ok(copies)
    }
    #[cfg(not(windows))]
    {
        Err("Earlier copies work in the Windows program".into())
    }
}

#[tauri::command]
fn earlier_entries(device: String, folder: String) -> Result<Vec<EarlierEntry>, String> {
    if !shadow_device_ok(&device) {
        return Err("That earlier copy cannot be opened".into());
    }
    let dir = PathBuf::from(&device).join(earlier_relative(&folder)?);
    let listed = list_dir_sync(dir.to_str().ok_or("That folder cannot be opened")?)?;
    Ok(listed
        .into_iter()
        .map(|entry| EarlierEntry { name: entry.name, kind: entry.kind, bytes: entry.bytes })
        .collect())
}

#[tauri::command]
async fn earlier_copy(device: String, folder: String, names: Vec<String>, dest: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !shadow_device_ok(&device) {
            return Err("That earlier copy cannot be opened".into());
        }
        let dest_text = dest.trim();
        if dest_text.is_empty() || dest_text.starts_with(r"\\?\GLOBALROOT") {
            return Err("Choose a normal folder to copy into".into());
        }
        let dest_path = PathBuf::from(dest_text);
        fs::create_dir_all(&dest_path).map_err(|err| err.to_string())?;
        let base = PathBuf::from(&device).join(earlier_relative(&folder)?);
        let mut files = 0u64;
        let mut bytes = 0u64;
        let mut skipped = 0u64;
        let mut copied = 0u32;
        for name in names {
            if name.is_empty() || name.contains('\\') || name.contains('/') || name.contains("..") {
                skipped += 1;
                continue;
            }
            let from = base.join(&name);
            if !from.exists() {
                skipped += 1;
                continue;
            }
            copy_tree(&from, &dest_path.join(&name), &mut files, &mut bytes, &mut skipped, 0);
            copied += 1;
        }
        if copied == 0 {
            return Err("None of those items could be copied".into());
        }
        let extra = if skipped == 0 { String::new() } else { format!(" · {skipped} skipped") };
        Ok(format!("Copied {files} file(s){extra}"))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[derive(Serialize)]
struct RestoreStatus {
    drive: String,
    enabled: String,
}

fn system_drive_letter() -> char {
    std::env::var("SystemDrive")
        .ok()
        .and_then(|value| value.chars().find(|ch| ch.is_ascii_alphabetic()))
        .map(|ch| ch.to_ascii_uppercase())
        .unwrap_or('C')
}

fn one_drive_letter(raw: &str) -> Result<char, String> {
    let trimmed = raw.trim().trim_end_matches(['\\', '/']);
    let letter = trimmed
        .chars()
        .next()
        .filter(|ch| ch.is_ascii_alphabetic())
        .ok_or_else(|| "Choose a drive letter".to_string())?;
    let rest = trimmed.chars().nth(1);
    let ok = trimmed.chars().count() == 1 || (trimmed.chars().count() == 2 && rest == Some(':'));
    if !ok {
        return Err("Choose a drive letter".into());
    }
    Ok(letter.to_ascii_uppercase())
}

#[tauri::command]
fn restore_status() -> Result<RestoreStatus, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let script = r#"$ErrorActionPreference = 'SilentlyContinue'
$drive = $env:SystemDrive
if (-not $drive) { $drive = 'C:' }
$drive = $drive.TrimEnd('\')
$global = 'unknown'
try {
  $props = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore' -ErrorAction Stop
  if ($null -ne $props.DisableSR) {
    if ([int]$props.DisableSR -eq 0) { $global = 'yes' } else { $global = 'no' }
  }
} catch {}
$storage = & vssadmin.exe list shadowstorage /for=$drive 2>&1 | Out-String
if ($storage -match 'Shadow Copy Storage volume') { $enabled = 'yes' }
elseif ($storage -match 'No items found') { $enabled = 'no' }
elseif ($global -eq 'no') { $enabled = 'no' }
elseif ($global -eq 'yes') { $enabled = 'yes' }
else { $enabled = 'unknown' }
Write-Output ('drive=' + $drive.TrimEnd(':'))
Write-Output ('enabled=' + $enabled)
"#;
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|err| err.to_string())?;
        let text = String::from_utf8_lossy(&output.stdout);
        let mut drive = system_drive_letter().to_string();
        let mut enabled = "unknown".to_string();
        for line in text.lines() {
            if let Some(rest) = line.trim().strip_prefix("drive=") {
                if let Ok(letter) = one_drive_letter(rest) {
                    drive = letter.to_string();
                }
            } else if let Some(rest) = line.trim().strip_prefix("enabled=") {
                if matches!(rest, "yes" | "no" | "unknown") {
                    enabled = rest.to_string();
                }
            }
        }
        Ok(RestoreStatus { drive, enabled })
    }
    #[cfg(not(windows))]
    {
        Err("Restore points work in the Windows program".into())
    }
}

#[tauri::command]
async fn restore_setup(drive: String) -> Result<String, String> {
    let letter = one_drive_letter(&drive)?;
    tauri::async_runtime::spawn_blocking(move || setup_restore_points(letter))
        .await
        .map_err(|err| err.to_string())?
}

fn setup_restore_points(letter: char) -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|dur| dur.as_millis())
            .unwrap_or(0);
        let dir = std::env::temp_dir();
        let script_path = dir.join(format!("df-restore-{stamp}.ps1"));
        let result_path = dir.join(format!("df-restore-{stamp}.txt"));
        let script_text = script_path.to_string_lossy().to_string();
        let result_text = result_path.to_string_lossy().to_string();
        if script_text.contains(['\'', '"', '\n', '\r']) || result_text.contains(['\'', '"', '\n', '\r']) {
            return Err("Could not turn on restore points".into());
        }
        let body = format!(
            r#"$ErrorActionPreference = 'Stop'
$drive = '{letter}:\'
$for = '{letter}:'
$result = '{result}'
function Save([string]$text) {{ Set-Content -LiteralPath $result -Value $text -Encoding ascii }}
try {{
  Enable-ComputerRestore -Drive $drive
}} catch {{
  Save ('error:' + $_.Exception.Message)
  exit 1
}}
$ready = $false
foreach ($size in @('10GB','5%')) {{
  & vssadmin.exe Resize ShadowStorage /For=$for /On=$for /MaxSize=$size 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {{ $ready = $true; break }}
  & vssadmin.exe Add ShadowStorage /For=$for /On=$for /MaxSize=$size 2>&1 | Out-Null
  if ($LASTEXITCODE -eq 0) {{ $ready = $true; break }}
}}
$point = 'later'
try {{
  Checkpoint-Computer -Description 'Data Finder' -RestorePointType MODIFY_SETTINGS
  $point = 'now'
}} catch {{
  $text = "$_"
  if ($text -match '1440|already been created|within the past') {{ $point = 'recent' }} else {{ $point = 'later' }}
}}
Save $point
exit 0
"#,
            letter = letter,
            result = result_text
        );
        fs::write(&script_path, body).map_err(|err| err.to_string())?;
        let outer = r#"$ErrorActionPreference = 'Stop'
$script = $env:DF_SCRIPT
if (-not $script) { Write-Output 'error:Could not turn on restore points'; exit 1 }
try {
  $text = Get-Content -LiteralPath $script -Raw
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($text))
  $admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  $arg = @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand', $encoded)
  if ($admin) {
    $proc = Start-Process -FilePath powershell.exe -Wait -PassThru -WindowStyle Hidden -ArgumentList $arg
  } else {
    $proc = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList $arg
  }
  if (-not $proc) { Write-Output 'cancelled'; exit 5 }
  exit $proc.ExitCode
} catch {
  $text = "$_"
  if ($text -match 'cancel') { Write-Output 'cancelled'; exit 5 }
  Write-Output ('error:' + $_.Exception.Message)
  exit 1
}
"#;
        let output = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", outer])
            .env("DF_SCRIPT", &script_text)
            .creation_flags(0x08000000)
            .output()
            .map_err(|err| err.to_string())?;
        let saved = fs::read_to_string(&result_path).unwrap_or_default();
        let _ = fs::remove_file(&script_path);
        let _ = fs::remove_file(&result_path);
        let saved = saved.trim();
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stdout.to_lowercase().contains("cancelled") {
            return Err("Windows permission was not given, so restore points stayed off.".into());
        }
        if let Some(message) = saved.strip_prefix("error:") {
            return Err(short_restore_error(message));
        }
        if stdout.trim().to_lowercase().starts_with("error:") {
            return Err(short_restore_error(stdout.trim().trim_start_matches("error:").trim_start_matches("Error:")));
        }
        let named = format!("{letter}:");
        let message = match saved {
            "now" => format!("Restore points are on for {named}. Windows saved one just now and will keep saving them. Earlier copies can open them."),
            "recent" => format!("Restore points are on for {named}. Windows already saved one today, so it did not make another. Earlier copies can open the ones it has."),
            "later" => format!("Restore points are on for {named}. Windows will save restore points from now on. Earlier copies will list the next one."),
            _ => String::new(),
        };
        if !message.is_empty() {
            return Ok(message);
        }
        if !output.status.success() {
            let detail = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
            return Err(short_restore_error(detail));
        }
        Err("Could not turn on restore points".into())
    }
    #[cfg(not(windows))]
    {
        let _ = letter;
        Err("Restore points work in the Windows program".into())
    }
}

fn short_restore_error(message: &str) -> String {
    let line = message.lines().find(|line| !line.trim().is_empty()).unwrap_or("Could not turn on restore points").trim();
    let line = line.strip_prefix("error:").unwrap_or(line).trim();
    if line.is_empty() {
        return "Could not turn on restore points".into();
    }
    let short: String = line.chars().take(180).collect();
    if short.is_empty() {
        return "Could not turn on restore points".into();
    }
    short
}

fn ps_quote(value: &str) -> Result<String, String> {
    if value.is_empty() || value.len() > 1024 || value.chars().any(|ch| ch.is_control()) {
        return Err("That value cannot be used".into());
    }
    Ok(format!("'{}'", value.replace('\'', "''")))
}

fn recovery_groups(raw: &str) -> Result<Vec<String>, String> {
    let mut groups = Vec::new();
    let mut digits = String::new();
    for ch in raw.chars().chain(std::iter::once('\n')) {
        if ch.is_ascii_digit() {
            digits.push(ch);
            if digits.len() > 48 {
                digits.clear();
            }
        } else if !digits.is_empty() {
            if digits.len() == 48 {
                groups.push(recovery_digits(&digits)?);
            }
            digits.clear();
        }
    }
    if groups.is_empty() {
        return Err("No recovery key was found to save".into());
    }
    Ok(groups)
}

fn recovery_digits(raw: &str) -> Result<String, String> {
    let digits: String = raw.chars().filter(|ch| ch.is_ascii_digit()).collect();
    if digits.len() != 48 {
        return Err("A recovery key is 48 digits, in eight groups of six.".into());
    }
    let mut out = String::new();
    for (index, ch) in digits.chars().enumerate() {
        if index > 0 && index % 6 == 0 {
            out.push('-');
        }
        out.push(ch);
    }
    Ok(out)
}

fn capture_ps(body: &str, elevate: bool) -> Result<String, String> {
    capture_ps_wait(body, elevate, 0, None)
}

fn read_progress(path: &Path) -> Option<(u32, u32, String)> {
    let text = fs::read_to_string(path).ok()?;
    let mut parts = text.trim().splitn(3, '|');
    let done = parts.next()?.trim().parse::<u32>().ok()?;
    let total = parts.next()?.trim().parse::<u32>().ok()?;
    if total == 0 {
        return None;
    }
    let label = parts.next().unwrap_or("").trim().to_string();
    Some((done.min(total), total, label))
}

fn capture_ps_wait(
    body: &str,
    elevate: bool,
    timeout_secs: u64,
    mut on_progress: Option<&mut dyn FnMut(u32, u32, String)>,
) -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|dur| dur.as_millis())
            .unwrap_or(0);
        let dir = std::env::temp_dir();
        let script_path = dir.join(format!("df-bitlocker-{stamp}.ps1"));
        let result_path = dir.join(format!("df-bitlocker-{stamp}.txt"));
        let progress_path = dir.join(format!("df-bitlocker-{stamp}.prog"));
        let script_text = script_path.to_string_lossy().to_string();
        let result_text = result_path.to_string_lossy().to_string();
        let progress_text = progress_path.to_string_lossy().to_string();
        let quoted = ps_quote(&result_text).map_err(|_| "Could not start that BitLocker step".to_string())?;
        let full = format!(
            "$dfResult = {quoted}\nfunction Save([string]$text) {{ Set-Content -LiteralPath $dfResult -Value $text -Encoding ascii }}\n$ErrorActionPreference = 'Stop'\ntry {{\n"
        ) + body + "\n} catch {\n  Save ('error:' + $_.Exception.Message)\n  exit 1\n}\n";
        fs::write(&script_path, full).map_err(|err| err.to_string())?;
        let outer = r#"$ErrorActionPreference = 'Stop'
$script = $env:DF_SCRIPT
if (-not $script) { Write-Output 'error:Could not run that BitLocker step'; exit 1 }
try {
  $text = Get-Content -LiteralPath $script -Raw
  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($text))
  $admin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  $arg = @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand', $encoded)
  $need = $env:DF_ELEVATE -eq 'yes' -and -not $admin
  if ($need) {
    $proc = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList $arg
  } else {
    $proc = Start-Process -FilePath powershell.exe -Wait -PassThru -WindowStyle Hidden -ArgumentList $arg
  }
  if (-not $proc) { Write-Output 'cancelled'; exit 5 }
  exit $proc.ExitCode
} catch {
  $text = "$_"
  if ($text -match 'cancel') { Write-Output 'cancelled'; exit 5 }
  Write-Output ('error:' + $_.Exception.Message)
  exit 1
}
"#;
        let mut command = Command::new("powershell");
        command
            .args(["-NoProfile", "-NonInteractive", "-Command", outer])
            .env("DF_SCRIPT", &script_text)
            .env("DF_ELEVATE", if elevate { "yes" } else { "no" })
            .env("DF_PROGRESS", &progress_text)
            .creation_flags(0x08000000)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let mut child = command.spawn().map_err(|err| err.to_string())?;
        let pid = child.id();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let _ = tx.send(child.wait_with_output());
        });
        let started = std::time::Instant::now();
        let mut last_progress = String::new();
        let waited = loop {
            if timeout_secs > 0 && started.elapsed() >= std::time::Duration::from_secs(timeout_secs) {
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .creation_flags(0x08000000)
                    .output();
                return Err("BitLocker took too long and was stopped. Refresh to try again.".into());
            }
            if let Some(callback) = on_progress.as_mut() {
                if let Some((done, total, label)) = read_progress(&progress_path) {
                    let key = format!("{done}|{total}|{label}");
                    if key != last_progress {
                        last_progress = key;
                        callback(done, total, label);
                    }
                }
            }
            match rx.recv_timeout(std::time::Duration::from_millis(200)) {
                Ok(result) => break result,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    return Err("Windows did not finish that BitLocker step".into());
                }
            }
        };
        let output = waited.map_err(|err| err.to_string())?;
        let saved = fs::read_to_string(&result_path).unwrap_or_default();
        let _ = fs::remove_file(&script_path);
        let _ = fs::remove_file(&result_path);
        let _ = fs::remove_file(&progress_path);
        let saved = saved.trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.to_lowercase().contains("cancelled") {
            return Err("Windows permission was not given.".into());
        }
        if let Some(message) = saved.strip_prefix("error:") {
            return Err(short_bitlocker_error(message));
        }
        if stdout.trim().to_lowercase().starts_with("error:") {
            return Err(short_bitlocker_error(stdout.trim().trim_start_matches("error:")));
        }
        if saved.is_empty() {
            let detail = if stdout.trim().is_empty() {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            } else {
                stdout.trim().to_string()
            };
            if !detail.is_empty() {
                return Err(short_bitlocker_error(&detail));
            }
            return Err("Windows did not finish that BitLocker step".into());
        }
        Ok(saved)
    }
    #[cfg(not(windows))]
    {
        let _ = (body, elevate, on_progress);
        Err("BitLocker works in the Windows program".into())
    }
}

fn short_bitlocker_error(message: &str) -> String {
    let line = message.lines().find(|line| !line.trim().is_empty()).unwrap_or("Windows could not finish that BitLocker step").trim();
    let line = line.strip_prefix("error:").unwrap_or(line).trim();
    let short: String = line.chars().take(220).collect();
    if short.is_empty() {
        "Windows could not finish that BitLocker step".into()
    } else {
        short
    }
}

#[derive(Serialize)]
struct BitLockerDrive {
    letter: String,
    lock: String,
    protection: String,
    state: String,
    percent: u32,
    volume: String,
    protectors: String,
    keyIds: String,
}

fn parse_bitlocker_line(line: &str) -> Option<BitLockerDrive> {
    let parts: Vec<&str> = line.split('|').collect();
    if parts.len() < 7 || !parts[0].contains(':') {
        return None;
    }
    let letter = parts[0].chars().find(|ch| ch.is_ascii_alphabetic())?;
    let percent = parts[4].trim().parse::<u32>().unwrap_or(0);
    Some(BitLockerDrive {
        letter: letter.to_ascii_uppercase().to_string(),
        lock: parts[1].trim().to_string(),
        protection: parts[2].trim().to_string(),
        state: parts[3].trim().to_string(),
        percent,
        volume: parts[5].trim().to_string(),
        protectors: parts[6].trim().to_string(),
        keyIds: parts.get(7).copied().unwrap_or("").trim().to_string(),
    })
}

#[tauri::command]
fn drag_out(window: tauri::WebviewWindow, paths: Vec<String>) -> Result<(), String> {
    #[cfg(windows)]
    {
        let files: Vec<std::path::PathBuf> = paths
            .into_iter()
            .map(|path| path.trim().to_string())
            .filter(|path| !path.is_empty())
            .map(std::path::PathBuf::from)
            .filter(|path| path.exists())
            .collect();
        if files.is_empty() {
            return Err("That item is not on a drive this PC can drag.".into());
        }
        let (tx, rx) = std::sync::mpsc::channel();
        let host = window.clone();
        window
            .run_on_main_thread(move || {
                let item = drag::DragItem::Files(files);
                let image = drag::Image::Raw(include_bytes!("../icons/32x32.png").to_vec());
                let started = drag::start_drag(&host, item, image, |_, _| {}, drag::Options::default());
                let _ = tx.send(started.map_err(|err| err.to_string()));
            })
            .map_err(|err| err.to_string())?;
        return rx.recv().map_err(|_| "The drag did not start.".to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = (window, paths);
        Err("Dragging onto the desktop works in the Windows program.".into())
    }
}

#[derive(Clone, Serialize)]
struct BitLockerProgress {
    done: u32,
    total: u32,
    label: String,
}

#[tauri::command]
async fn bitlocker_status(app: tauri::AppHandle, elevate: bool) -> Result<Vec<BitLockerDrive>, String> {
    tauri::async_runtime::spawn_blocking(move || bitlocker_status_blocking(app, elevate))
        .await
        .map_err(|err| err.to_string())?
}

fn bitlocker_status_blocking(app: tauri::AppHandle, elevate: bool) -> Result<Vec<BitLockerDrive>, String> {
    let body = r#"$ErrorActionPreference = 'Continue'
function Step([int]$done, [int]$total, [string]$label) {
  $path = $env:DF_PROGRESS
  if (-not $path) { return }
  $safe = ($label -replace '[|\r\n]', ' ')
  try { Set-Content -LiteralPath $path -Value ($done.ToString() + '|' + $total.ToString() + '|' + $safe) -Encoding ascii } catch {}
}
Step 4 100 'Listing drives'
function Take([string]$text, [string]$name) {
  $pattern = '(?m)^\s*' + [regex]::Escape($name) + ':\s*(.+)$'
  $match = [regex]::Match($text, $pattern)
  if ($match.Success) { return $match.Groups[1].Value.Trim() }
  return ''
}
function ShortState([string]$value) {
  $lower = $value.ToLower()
  if ($lower -match 'decrypted' -and $lower -notmatch 'progress|paused') { return 'FullyDecrypted' }
  if ($lower -match 'encrypted') { return 'FullyEncrypted' }
  if ($lower -match 'encryption in progress') { return 'EncryptionInProgress' }
  if ($lower -match 'decryption in progress') { return 'DecryptionInProgress' }
  if ($lower -match 'paused') { return 'Paused' }
  $clean = ($value -replace '[^A-Za-z]', '')
  if (-not $clean) { return 'Unknown' }
  return $clean
}
function Clean([string]$value) {
  if (-not $value) { return '' }
  return (($value -replace '[|\r\n]', ' ').Trim())
}
function Rank([string]$line) {
  if ($line -match '\|Locked\|') { return 4 }
  if ($line -match 'FullyEncrypted|EncryptionInProgress|DecryptionInProgress|Paused') { return 3 }
  if ($line -match '\|On\|') { return 3 }
  if ($line -match '\|Unknown\|') { return 1 }
  return 2
}
$found = @{}
$saw = $false
function Keep([string]$letter, [string]$lock, [string]$prot, [string]$state, [int]$pct, [string]$volume, [string]$ids) {
  if ($letter -notmatch '^[A-Za-z]$') { return }
  $letter = $letter.ToUpper()
  $line = ($letter + ':|' + $lock + '|' + $prot + '|' + $state + '|' + $pct + '|' + (Clean $volume) + '||' + $ids)
  if (-not $script:found.ContainsKey($letter) -or (Rank $line) -ge (Rank $script:found[$letter])) {
    $script:found[$letter] = $line
  }
}
try {
  Step 15 100 'Reading BitLocker'
  $vols = @(Get-BitLockerVolume -ErrorAction Stop)
} catch { $vols = @() }
if ($vols.Count -gt 0) { $saw = $true }
foreach ($vol in $vols) {
  $mount = [string]$vol.MountPoint
  if ($mount -notmatch '([A-Za-z]):') { continue }
  $letter = $Matches[1]
  $lock = 'Unlocked'
  if ([string]$vol.LockStatus -match 'Locked') { $lock = 'Locked' }
  $prot = 'Off'
  if ([string]$vol.ProtectionStatus -match 'On') { $prot = 'On' }
  $state = ShortState ([string]$vol.VolumeStatus)
  $pct = 0
  try { $pct = [int]$vol.EncryptionPercentage } catch { $pct = 0 }
  if ($state -eq 'FullyDecrypted' -and ($prot -eq 'On' -or $pct -gt 0 -or $lock -eq 'Locked')) { $state = 'FullyEncrypted' }
  $volume = 'Data'
  if ([string]$vol.VolumeType -match 'Operating') { $volume = 'Operating system' }
  $ids = ''
  if ($lock -eq 'Locked') {
    $idList = New-Object System.Collections.Generic.List[string]
    foreach ($kp in @($vol.KeyProtector)) {
      $hex = (([string]$kp.KeyProtectorId) -replace '[{}-]', '').ToUpper()
      if ($hex.Length -ge 8) {
        $short = $hex.Substring(0, 8)
        if (-not $idList.Contains($short)) { [void]$idList.Add($short) }
      }
    }
    $ids = $idList -join ','
  }
  Keep $letter $lock $prot $state $pct $volume $ids
}
Step 42 100 'Reading encryption records'
try {
  $enc = @(Get-CimInstance -Namespace 'root/CIMV2/Security/MicrosoftVolumeEncryption' -ClassName Win32_EncryptableVolume -ErrorAction Stop)
} catch { $enc = @() }
if ($enc.Count -gt 0) { $saw = $true }
foreach ($item in $enc) {
  $drive = [string]$item.DriveLetter
  if ($drive -notmatch '([A-Za-z])') { continue }
  $letter = $Matches[1]
  $conv = 0
  $protNum = 0
  $pct = 0
  try { $conv = [int]$item.ConversionStatus } catch { $conv = 0 }
  try { $protNum = [int]$item.ProtectionStatus } catch { $protNum = 0 }
  try { $pct = [int]$item.EncryptionPercentage } catch { $pct = 0 }
  $prot = 'Off'
  if ($protNum -eq 1) { $prot = 'On' }
  $state = 'Unknown'
  if ($conv -eq 0) { $state = 'FullyDecrypted' }
  elseif ($conv -eq 1) { $state = 'FullyEncrypted' }
  elseif ($conv -eq 2) { $state = 'EncryptionInProgress' }
  elseif ($conv -eq 3) { $state = 'DecryptionInProgress' }
  elseif ($conv -eq 4 -or $conv -eq 5) { $state = 'Paused' }
  if ($state -eq 'FullyDecrypted' -and ($prot -eq 'On' -or $pct -gt 0)) { $state = 'FullyEncrypted' }
  Keep $letter 'Unlocked' $prot $state $pct 'Data' ''
}
Step 58 100 'Reading drive status'
$bde = Join-Path $env:SystemRoot 'System32\manage-bde.exe'
function ReadBde([string[]]$bdeArgs) {
  if (-not (Test-Path -LiteralPath $bde)) { return '' }
  $stdout = Join-Path $env:TEMP ('df-bde-out-' + [guid]::NewGuid().ToString() + '.txt')
  $stderr = Join-Path $env:TEMP ('df-bde-err-' + [guid]::NewGuid().ToString() + '.txt')
  try {
    Start-Process -FilePath $bde -ArgumentList $bdeArgs -Wait -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
    $text = ''
    if (Test-Path -LiteralPath $stdout) { $text += [IO.File]::ReadAllText($stdout) }
    if (Test-Path -LiteralPath $stderr) { $text += "`n" + [IO.File]::ReadAllText($stderr) }
    return ($text -replace "`r`n", "`n" -replace "`r", "`n")
  } catch { return '' }
  finally {
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
  }
}
$raw = ReadBde @('-status')
if ($raw -match 'Conversion Status') { $saw = $true }
$hits = @([regex]::Matches($raw, '(?s)Volume\s+([A-Za-z]):(.*?)(?=Volume\s+[A-Za-z]:|\z)'))
$hitCount = @($hits).Count
$hitIndex = 0
foreach ($hit in $hits) {
  $hitIndex++
  $letter = $hit.Groups[1].Value.ToUpper()
  $done = 58
  if ($hitCount -gt 0) { $done = 58 + [int](($hitIndex * 32) / $hitCount) }
  Step $done 100 ('Checking ' + $letter + ':')
  $chunk = $hit.Groups[2].Value
  $lock = 'Unlocked'
  if ((Take $chunk 'Lock Status') -match 'Locked') { $lock = 'Locked' }
  $prot = 'Off'
  if ((Take $chunk 'Protection Status') -match '(?i)\bOn\b') { $prot = 'On' }
  $state = 'Unknown'
  $stateText = Take $chunk 'Conversion Status'
  if ($stateText) { $state = ShortState $stateText }
  $pct = 0
  $pctText = Take $chunk 'Percentage Encrypted'
  if ($pctText -match '(\d+)') { $pct = [int]$Matches[1] }
  if ($state -eq 'FullyDecrypted' -and ($prot -eq 'On' -or $pct -gt 0 -or $lock -eq 'Locked')) { $state = 'FullyEncrypted' }
  $label = ''
  if ($chunk -match '\[([^\]]+)\]') { $label = Clean $Matches[1] }
  $volume = 'Data'
  if ($chunk -match 'OS Volume' -or $label -match '^(?i)os$') { $volume = 'Operating system' }
  elseif ($label -and $label -ne 'OS Volume') { $volume = $label }
  $ids = ''
  if ($lock -eq 'Locked') {
    $idRaw = ReadBde @('-protectors', '-get', ($letter + ':'), '-type', 'RecoveryPassword')
    $idList = New-Object System.Collections.Generic.List[string]
    foreach ($item in [regex]::Matches($idRaw, '\{([0-9A-Fa-f\-]+)\}')) {
      $hex = ($item.Groups[1].Value -replace '-', '').ToUpper()
      if ($hex.Length -ge 8) {
        $short = $hex.Substring(0, 8)
        if (-not $idList.Contains($short)) { [void]$idList.Add($short) }
      }
    }
    $ids = $idList -join ','
  }
  Keep $letter $lock $prot $state $pct $volume $ids
}
$disks = @()
try { $disks = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType=2 OR DriveType=3' -ErrorAction Stop) } catch { $disks = @() }
if ($disks.Count -eq 0) {
  try { $disks = @(Get-WmiObject -Class Win32_LogicalDisk -Filter 'DriveType=2 OR DriveType=3' -ErrorAction SilentlyContinue) } catch { $disks = @() }
}
foreach ($disk in $disks) {
  $id = [string]$disk.DeviceID
  if ($id -notmatch '^([A-Za-z]):') { continue }
  $letter = $Matches[1].ToUpper()
  if ($found.ContainsKey($letter)) { continue }
  $name = Clean ([string]$disk.VolumeName)
  $volume = 'Data'
  if ([int]$disk.DriveType -eq 2) { $volume = 'Removable' }
  if ($name) { $volume = $name }
  if ($saw) { Keep $letter 'Unlocked' 'Off' 'FullyDecrypted' 0 $volume '' }
  else { Keep $letter 'Unlocked' 'Off' 'Unknown' 0 $volume '' }
}
Step 100 100 'Finishing'
if ($found.Count -eq 0) {
  if (-not (Test-Path -LiteralPath $bde)) { Save 'error:Windows could not read BitLocker on this PC.' }
  else { Save 'none' }
} else {
  $rows = $found.Keys | Sort-Object | ForEach-Object { $found[$_] }
  Save ($rows -join [char]10)
}
"#;
    let text = capture_ps_wait(body, elevate, 40, Some(&mut |done, total, label| {
        let _ = app.emit(
            "bitlocker-progress",
            BitLockerProgress { done, total, label },
        );
    }))?;
    if text == "none" {
        return Ok(Vec::new());
    }
    Ok(text.lines().filter_map(parse_bitlocker_line).collect())
}

#[tauri::command]
async fn bitlocker_unlock(drive: String, mode: String, secret: String) -> Result<String, String> {
    let letter = one_drive_letter(&drive)?;
    let mode = match mode.as_str() {
        "recovery" | "password" | "bek" => mode,
        _ => return Err("Choose a recovery key, a password, or a key file".into()),
    };
    let secret = match mode.as_str() {
        "recovery" => recovery_digits(&secret)?,
        "password" => {
            if secret.chars().any(|ch| ch.is_control()) || secret.is_empty() || secret.len() > 256 {
                return Err("That password cannot be used".into());
            }
            secret
        }
        "bek" => {
            if secret.chars().any(|ch| ch.is_control()) || secret.len() > 1024 || !Path::new(secret.trim()).is_file() {
                return Err("That key file was not found".into());
            }
            secret.trim().to_string()
        }
        _ => return Err("Choose a recovery key, a password, or a key file".into()),
    };
    let quoted = ps_quote(&secret)?;
    tauri::async_runtime::spawn_blocking(move || {
        let body = format!(
            r#"$mount = '{letter}:'
$mode = '{mode}'
$secret = {quoted}
if ($mode -eq 'recovery') {{
  Unlock-BitLocker -MountPoint $mount -RecoveryPassword $secret | Out-Null
}} elseif ($mode -eq 'password') {{
  $secure = ConvertTo-SecureString $secret -AsPlainText -Force
  Unlock-BitLocker -MountPoint $mount -Password $secure | Out-Null
}} else {{
  Unlock-BitLocker -MountPoint $mount -RecoveryKeyPath $secret | Out-Null
}}
Save 'unlocked'
"#,
            letter = letter,
            mode = mode,
            quoted = quoted
        );
        capture_ps(&body, true)?;
        Ok(format!("{letter}: is unlocked. Open it from This computer, or decrypt it if you want BitLocker removed."))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn bitlocker_off(drive: String) -> Result<String, String> {
    let letter = one_drive_letter(&drive)?;
    tauri::async_runtime::spawn_blocking(move || {
        let body = format!(
            "$vol = Get-BitLockerVolume -MountPoint '{letter}:'\nif ([string]$vol.LockStatus -eq 'Locked') {{ throw 'This drive is locked. Enter its recovery key, password, or key file first.' }}\nDisable-BitLocker -MountPoint '{letter}:' | Out-Null\nSave 'started'\n",
            letter = letter
        );
        capture_ps(&body, true)?;
        Ok(format!("Decryption started on {letter}:. Windows keeps the files and finishes in the background. The drive stays usable."))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn bitlocker_on(drive: String) -> Result<String, String> {
    let letter = one_drive_letter(&drive)?;
    tauri::async_runtime::spawn_blocking(move || {
        let body = format!(
            r#"$mount = '{letter}:'
$os = $false
$system = $env:SystemDrive
if ($system -and $mount.TrimEnd('\') -eq $system.TrimEnd('\')) {{ $os = $true }}
if ($os) {{
  try {{
    Enable-BitLocker -MountPoint $mount -TpmProtector -UsedSpaceOnly -ErrorAction Stop | Out-Null
  }} catch {{
    $text = "$_"
    if ($text -notmatch 'already|protection is on|encryption') {{ throw }}
  }}
  $added = Add-BitLockerKeyProtector -MountPoint $mount -RecoveryPasswordProtector
  $key = [string]$added.RecoveryPassword
}} else {{
  $vol = Enable-BitLocker -MountPoint $mount -EncryptionMethod XtsAes128 -UsedSpaceOnly -RecoveryPasswordProtector
  $key = @($vol.KeyProtector | Where-Object {{ $_.RecoveryPassword }} | Select-Object -Last 1 -ExpandProperty RecoveryPassword)
  $key = [string]$key
}}
if (-not $key) {{
  $again = Get-BitLockerVolume -MountPoint $mount
  $key = @($again.KeyProtector | Where-Object {{ $_.RecoveryPassword }} | Select-Object -Last 1 -ExpandProperty RecoveryPassword)
  $key = [string]$key
}}
if (-not $key) {{ throw 'BitLocker started, but Windows did not show a recovery key. Check the drive, then try again.' }}
Save ('key:' + $key)
"#,
            letter = letter
        );
        let saved = capture_ps(&body, true)?;
        let key = saved.strip_prefix("key:").unwrap_or("").trim();
        if key.is_empty() {
            return Err("BitLocker started, but Windows did not show a recovery key.".into());
        }
        Ok(recovery_digits(key).unwrap_or_else(|_| key.to_string()))
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn bitlocker_read_key(drive: String) -> Result<String, String> {
    let letter = one_drive_letter(&drive)?;
    tauri::async_runtime::spawn_blocking(move || {
        let body = format!(
            r#"$mount = '{letter}:'
$vol = Get-BitLockerVolume -MountPoint $mount
if ([string]$vol.LockStatus -eq 'Locked') {{ throw 'This drive is locked. Windows will not show a recovery key until the drive is unlocked.' }}
$rows = New-Object System.Collections.Generic.List[string]
foreach ($prot in @($vol.KeyProtector)) {{
  $pass = [string]$prot.RecoveryPassword
  if ($pass) {{
    $id = ([string]$prot.KeyProtectorId).Trim('{{}}')
    $rows.Add($id + ' ' + $pass)
  }}
}}
if ($rows.Count -eq 0) {{
  $kinds = @($vol.KeyProtector | ForEach-Object {{ [string]$_.KeyProtectorType }}) -join ', '
  if (-not $kinds) {{ $kinds = 'none' }}
  Save ('none:' + $kinds)
}} else {{
  Save ('found:' + ($rows -join "`n"))
}}
"#,
            letter = letter
        );
        let saved = capture_ps(&body, true)?;
        if let Some(kinds) = saved.strip_prefix("none:") {
            let kinds = kinds.trim();
            return Err(format!(
                "Windows did not store a recovery password on {letter}:. Protectors on the drive: {kinds}. A TPM unlocks the drive when you sign in. It is not a key you can type. Use the list below for a Microsoft account, a school, work, Active Directory, or Intune."
            ));
        }
        let found = saved.strip_prefix("found:").unwrap_or(saved.as_str()).trim();
        if found.is_empty() {
            return Err(format!("Windows did not show a recovery key for {letter}:."));
        }
        Ok(found.to_string())
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
fn bitlocker_save_key(folder: String, drive: String, key: String) -> Result<String, String> {
    let letter = one_drive_letter(&drive)?;
    let key = key.trim();
    if key.is_empty() || key.chars().any(|ch| ch.is_control() && ch != '\n' && ch != '\r') || key.len() > 4000 {
        return Err("Choose a recovery key to save".into());
    }
    let groups = recovery_groups(key)?;
    let folder = folder.trim();
    if folder.is_empty() || folder.chars().any(|ch| ch.is_control()) || folder.len() > 1024 {
        return Err("Choose a folder for the key document".into());
    }
    let upper = folder.to_ascii_uppercase();
    let own = format!("{letter}:");
    if upper.starts_with(&own) {
        return Err(format!("Save the key somewhere other than {own}. That drive is the wrong place to keep the only copy."));
    }
    let path = Path::new(folder).join(format!("BitLocker Recovery Key {letter}.txt"));
    let listed = groups.join("\r\n");
    let body = format!(
        "Data Finder BitLocker recovery key\r\nDrive: {letter}:\r\n\r\nKeep this file off {letter}:.\r\nA locked drive does not open without this key, the password, or the key file.\r\n\r\n{listed}\r\n"
    );
    fs::write(&path, body).map_err(|err| err.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn choose_key_file() -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let script = "Add-Type -AssemblyName System.Windows.Forms; $owner = New-Object System.Windows.Forms.Form; $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0; $owner.Show(); $owner.Activate(); $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Title = 'Choose the BitLocker key file'; $dialog.Filter = 'BitLocker key (*.bek)|*.bek|All files (*.*)|*.*'; $result = $dialog.ShowDialog($owner); $owner.Close(); if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }";
        let output = Command::new("powershell")
            .args(["-NoProfile", "-STA", "-Command", script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|err| err.to_string())?;
        if !output.status.success() {
            return Err("Could not open the file window".into());
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("No key file was chosen".into());
        }
        Ok(path)
    }
    #[cfg(not(windows))]
    {
        Err("Choosing a key file works in the Windows program".into())
    }
}

#[tauri::command]
fn choose_folder() -> Result<String, String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let script = "Add-Type -AssemblyName System.Windows.Forms; $owner = New-Object System.Windows.Forms.Form; $owner.TopMost = $true; $owner.ShowInTaskbar = $false; $owner.Opacity = 0; $owner.Show(); $owner.Activate(); $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = 'Choose a folder'; $dialog.ShowNewFolderButton = $true; $result = $dialog.ShowDialog($owner); $owner.Close(); if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }";
        let output = Command::new("powershell")
            .args(["-NoProfile", "-STA", "-Command", script])
            .creation_flags(0x08000000)
            .output()
            .map_err(|err| err.to_string())?;
        if !output.status.success() {
            return Err("Could not open the folder window".into());
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Err("No folder was chosen".into());
        }
        Ok(path)
    }
    #[cfg(not(windows))]
    {
        Err("Choosing a folder works in the Windows program".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            drives,
            drive_mask,
            list_dir,
            create_item,
            rename_path,
            remove_path,
            read_text,
            copy_item,
            move_item,
            measure_children,
            measure_path,
            recovery_start,
            recovery_status,
            recovery_stop,
            recovery_save,
            recovery_clear,
            unmount_drive,
            mount_image,
            format_drive,
            mount_volume,
            map_network,
            open_url,
            known_folders,
            snapshot_save,
            snapshot_list,
            snapshot_restore,
            snapshot_remove,
            open_path,
            choose_folder,
            earlier_list,
            earlier_entries,
            earlier_copy,
            restore_status,
            restore_setup,
            bitlocker_status,
            bitlocker_unlock,
            bitlocker_off,
            bitlocker_on,
            bitlocker_read_key,
            bitlocker_save_key,
            choose_key_file,
            drag_out
        ])
        .run(tauri::generate_context!())
        .expect("Data Finder failed to start");
}