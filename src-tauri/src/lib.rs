use serde::Serialize;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;

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
                            let mut budget = 25_000u32;
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
            let mut budget = 25_000u32;
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
async fn snapshot_save(sources: Vec<String>) -> Result<SnapInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if sources.is_empty() {
            return Err("Choose a folder to snapshot".into());
        }
        let id = format!("{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
        let root = snap_root().join(&id);
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
        Ok(info)
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
fn snapshot_list() -> Vec<SnapInfo> {
    let root = snap_root();
    let Ok(entries) = fs::read_dir(&root) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in entries.flatten() {
        let manifest = entry.path().join("manifest.json");
        let Ok(text) = fs::read_to_string(manifest) else {
            continue;
        };
        if let Ok(info) = serde_json::from_str::<SnapInfo>(&text) {
            out.push(info);
        }
    }
    out.sort_by(|a, b| b.taken.cmp(&a.taken));
    out
}

#[tauri::command]
async fn snapshot_restore(id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let root = snap_root().join(&id);
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
    let root = snap_root().join(&id);
    if !root.starts_with(snap_root()) {
        return Err("That snapshot cannot be removed".into());
    }
    fs::remove_dir_all(root).map_err(|err| err.to_string())
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
            snapshot_remove
        ])
        .run(tauri::generate_context!())
        .expect("Data Finder failed to start");
}