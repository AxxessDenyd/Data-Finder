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
    });
}

#[tauri::command]
fn drives() -> Vec<DiskEntry> {
    let mut out = Vec::new();
    #[cfg(windows)]
    {
        for letter in b'A'..=b'Z' {
            let path = format!("{}:\\", letter as char);
            if Path::new(&path).exists() {
                out.push(DiskEntry {
                    name: format!("{}:", letter as char),
                    path,
                    kind: "drive".into(),
                    bytes: None,
                    modified: 0,
                    hidden: false,
                    readonly: false,
                    system: false,
                });
            }
        }
    }
    #[cfg(not(windows))]
    {
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
            });
        }
    }
    out
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
            measure_children
        ])
        .run(tauri::generate_context!())
        .expect("Data Finder failed to start");
}