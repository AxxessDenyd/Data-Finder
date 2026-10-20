use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::thread;

#[derive(Clone, Serialize)]
pub struct RecoveryHit {
    pub id: u64,
    pub name: String,
    pub original: String,
    pub bytes: u64,
    pub kind: String,
    pub chance: String,
    pub source: String,
}

#[derive(Clone, Serialize)]
pub struct RecoveryStatus {
    pub running: bool,
    pub done: bool,
    pub phase: String,
    pub scanned_mb: u64,
    pub total_mb: u64,
    pub error: String,
    pub letter: String,
    pub hits: Vec<RecoveryHit>,
}

#[derive(Serialize)]
pub struct RecoverResult {
    pub saved: u32,
    pub failed: u32,
    pub folder: String,
    pub message: String,
}

enum Payload {
    Recycle(PathBuf),
    Resident(Vec<u8>),
    Runs {
        volume: String,
        cluster: u32,
        size: u64,
        runs: Vec<(i64, u64)>,
    },
    Carve {
        volume: String,
        offset: u64,
        size: u64,
        ext: String,
    },
}

struct Stored {
    hit: RecoveryHit,
    payload: Payload,
}

struct Run {
    running: bool,
    done: bool,
    phase: String,
    scanned_mb: u64,
    total_mb: u64,
    error: String,
    letter: String,
    hits: Vec<Stored>,
}

fn state() -> &'static Mutex<Run> {
    static STATE: OnceLock<Mutex<Run>> = OnceLock::new();
    STATE.get_or_init(|| {
        Mutex::new(Run {
            running: false,
            done: false,
            phase: "Ready".into(),
            scanned_mb: 0,
            total_mb: 0,
            error: String::new(),
            letter: String::new(),
            hits: Vec::new(),
        })
    })
}

fn cancel_flag() -> &'static AtomicBool {
    static CANCEL: OnceLock<AtomicBool> = OnceLock::new();
    CANCEL.get_or_init(|| AtomicBool::new(false))
}

fn next_id() -> u64 {
    static NEXT: OnceLock<AtomicU64> = OnceLock::new();
    NEXT.get_or_init(|| AtomicU64::new(1)).fetch_add(1, Ordering::Relaxed)
}

pub fn status() -> RecoveryStatus {
    let run = state().lock().unwrap_or_else(|err| err.into_inner());
    RecoveryStatus {
        running: run.running,
        done: run.done,
        phase: run.phase.clone(),
        scanned_mb: run.scanned_mb,
        total_mb: run.total_mb,
        error: run.error.clone(),
        letter: run.letter.clone(),
        hits: run.hits.iter().map(|item| item.hit.clone()).collect(),
    }
}

pub fn stop() {
    cancel_flag().store(true, Ordering::Relaxed);
    let mut run = state().lock().unwrap_or_else(|err| err.into_inner());
    if run.running {
        run.phase = "Stopping".into();
    }
}

pub fn start(letter: String, kinds: Vec<String>, deep: bool) -> Result<(), String> {
    let letter = normalize_letter(&letter).ok_or_else(|| "Choose a drive letter".to_string())?;
    {
        let run = state().lock().unwrap_or_else(|err| err.into_inner());
        if run.running {
            return Err("A scan is already running".into());
        }
    }
    let allow: HashSet<String> = kinds.into_iter().filter(|kind| !kind.is_empty()).collect();
    cancel_flag().store(false, Ordering::Relaxed);
    {
        let mut run = state().lock().unwrap_or_else(|err| err.into_inner());
        run.running = true;
        run.done = false;
        run.phase = "Starting".into();
        run.scanned_mb = 0;
        run.total_mb = 0;
        run.error.clear();
        run.letter = letter.clone();
        run.hits.clear();
    }
    thread::spawn(move || {
        let finish = Finish;
        let _ = finish;
        if let Err(err) = scan(&letter, &allow, deep) {
            let mut run = state().lock().unwrap_or_else(|poison| poison.into_inner());
            if run.error.is_empty() {
                run.error = err;
            }
        }
    });
    Ok(())
}

struct Finish;
impl Drop for Finish {
    fn drop(&mut self) {
        let mut run = state().lock().unwrap_or_else(|err| err.into_inner());
        let stopped = cancel_flag().load(Ordering::Relaxed);
        run.running = false;
        run.done = true;
        run.phase = if stopped { "Stopped".into() } else { "Finished".into() };
    }
}

fn push_hit(hit: Stored) {
    let mut run = state().lock().unwrap_or_else(|err| err.into_inner());
    run.hits.push(hit);
}

fn set_phase(phase: &str, scanned_mb: u64, total_mb: u64) {
    let mut run = state().lock().unwrap_or_else(|err| err.into_inner());
    run.phase = phase.into();
    run.scanned_mb = scanned_mb;
    run.total_mb = total_mb;
}

fn scan(letter: &str, allow: &HashSet<String>, deep: bool) -> Result<(), String> {
    set_phase("Reading the Recycle Bin", 0, 0);
    match recycle_hits(letter, allow) {
        Ok(found) => {
            for hit in found {
                push_hit(hit);
            }
        }
        Err(err) => {
            let mut run = state().lock().unwrap_or_else(|poison| poison.into_inner());
            run.error = err;
        }
    }
    if cancel_flag().load(Ordering::Relaxed) {
        return Ok(());
    }
    #[cfg(windows)]
    {
        if let Err(err) = scan_volume(letter, allow, deep) {
            let mut run = state().lock().unwrap_or_else(|poison| poison.into_inner());
            if run.error.is_empty() {
                run.error = err;
            } else {
                run.error = format!("{} {}", run.error, err);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (letter, allow, deep);
        let mut run = state().lock().unwrap_or_else(|poison| poison.into_inner());
        run.error = "Deleted-file scan runs in the Windows program".into();
    }
    Ok(())
}

fn recycle_hits(letter: &str, allow: &HashSet<String>) -> Result<Vec<Stored>, String> {
    let root = PathBuf::from(format!("{letter}:\\$Recycle.Bin"));
    let mut out = Vec::new();
    let entries = match fs::read_dir(&root) {
        Ok(entries) => entries,
        Err(err) => return Err(format!("Recycle Bin could not be read ({err})")),
    };
    for sid in entries.flatten() {
        if cancel_flag().load(Ordering::Relaxed) {
            break;
        }
        let folder = sid.path();
        if !folder.is_dir() {
            continue;
        }
        let Ok(files) = fs::read_dir(&folder) else { continue };
        for file in files.flatten() {
            let name = file.file_name().to_string_lossy().to_string();
            if !name.starts_with("$I") {
                continue;
            }
            let info_path = file.path();
            let mut bytes = Vec::new();
            let Ok(mut handle) = File::open(&info_path) else { continue };
            if handle.read_to_end(&mut bytes).is_err() {
                continue;
            }
            let Some(info) = parse_recycle_info(&bytes) else { continue };
            let kind = kind_of(&info.path);
            if !allowed(&kind, allow) {
                continue;
            }
            let data_name = format!("$R{}", &name[2..]);
            let data_path = folder.join(data_name);
            let chance = if data_path.is_file() { "Excellent" } else { "Poor" };
            let file_name = info.path.rsplit(['\\', '/']).next().unwrap_or(&info.path).to_string();
            out.push(Stored {
                hit: RecoveryHit {
                    id: next_id(),
                    name: file_name,
                    original: info.path,
                    bytes: info.size,
                    kind,
                    chance: chance.into(),
                    source: "Recycle Bin".into(),
                },
                payload: Payload::Recycle(data_path),
            });
        }
    }
    Ok(out)
}

struct RecycleInfo {
    path: String,
    size: u64,
}

pub fn parse_recycle_info(bytes: &[u8]) -> Option<RecycleInfo> {
    if bytes.len() < 28 {
        return None;
    }
    let version = u64::from_le_bytes(bytes[0..8].try_into().ok()?);
    let size = u64::from_le_bytes(bytes[8..16].try_into().ok()?);
    let path = if version == 2 {
        let chars = u32::from_le_bytes(bytes[24..28].try_into().ok()?) as usize;
        if (1..4096).contains(&chars) && bytes.len() >= 28 {
            let end = 28usize.saturating_add(chars.saturating_mul(2)).min(bytes.len());
            let prefixed = utf16_text(&bytes[28..end]);
            if prefixed.len() >= 3 { prefixed } else { utf16_text(&bytes[24..]) }
        } else {
            utf16_text(&bytes[24..])
        }
    } else {
        utf16_text(&bytes[24..])
    };
    if path.len() < 3 {
        return None;
    }
    Some(RecycleInfo { path, size })
}

fn utf16_text(bytes: &[u8]) -> String {
    let mut units = Vec::new();
    let mut index = 0;
    while index + 1 < bytes.len() {
        let unit = u16::from_le_bytes([bytes[index], bytes[index + 1]]);
        if unit == 0 {
            break;
        }
        units.push(unit);
        index += 2;
    }
    String::from_utf16_lossy(&units).trim().trim_matches('\u{0}').to_string()
}

pub fn kind_of(name: &str) -> String {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let kind = match ext.as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "heic" | "tif" | "tiff" | "raw" | "cr2" | "nef" => "Pictures",
        "doc" | "docx" | "pdf" | "txt" | "rtf" | "xls" | "xlsx" | "ppt" | "pptx" | "csv" | "odt" | "ods" => "Documents",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" => "Music",
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "webm" | "m4v" => "Video",
        "zip" | "rar" | "7z" | "cab" | "tar" | "gz" | "iso" => "Archives",
        "eml" | "msg" | "pst" | "ost" => "Email",
        _ => "Other",
    };
    kind.into()
}

fn allowed(kind: &str, allow: &HashSet<String>) -> bool {
    allow.is_empty() || allow.contains(kind)
}

pub fn save(ids: Vec<u64>, folder: String) -> Result<RecoverResult, String> {
    let folder = folder.trim().to_string();
    if folder.is_empty() {
        return Err("Choose a folder to save into".into());
    }
    let letter = {
        let run = state().lock().unwrap_or_else(|err| err.into_inner());
        run.letter.clone()
    };
    if drive_letter(&folder) == Some(letter.chars().next().unwrap_or('?')) {
        return Err("Save onto a different drive. Writing onto the scanned drive can overwrite the data you are trying to recover.".into());
    }
    fs::create_dir_all(&folder).map_err(|err| format!("Could not create that folder ({err})"))?;
    let wanted: HashSet<u64> = ids.into_iter().collect();
    if wanted.is_empty() {
        return Err("Select at least one file".into());
    }
    let jobs: Vec<Stored> = {
        let run = state().lock().unwrap_or_else(|err| err.into_inner());
        run.hits.iter().filter(|item| wanted.contains(&item.hit.id)).map(|item| Stored {
            hit: item.hit.clone(),
            payload: clone_payload(&item.payload),
        }).collect()
    };
    let mut saved = 0u32;
    let mut failed = 0u32;
    let mut used = HashSet::new();
    for job in jobs {
        let name = unique_name(&folder, &safe_file_name(&job.hit.name), &mut used);
        let dest = Path::new(&folder).join(&name);
        match write_payload(&job.payload, &dest, job.hit.bytes) {
            Ok(()) => saved += 1,
            Err(_) => failed += 1,
        }
    }
    let message = if failed == 0 {
        format!("Saved {saved} file(s) to {folder}")
    } else {
        format!("Saved {saved} file(s). {failed} could not be read.")
    };
    Ok(RecoverResult { saved, failed, folder, message })
}

fn clone_payload(payload: &Payload) -> Payload {
    match payload {
        Payload::Recycle(path) => Payload::Recycle(path.clone()),
        Payload::Resident(bytes) => Payload::Resident(bytes.clone()),
        Payload::Runs { volume, cluster, size, runs } => Payload::Runs {
            volume: volume.clone(),
            cluster: *cluster,
            size: *size,
            runs: runs.clone(),
        },
        Payload::Carve { volume, offset, size, ext } => Payload::Carve {
            volume: volume.clone(),
            offset: *offset,
            size: *size,
            ext: ext.clone(),
        },
    }
}

fn write_payload(payload: &Payload, dest: &Path, bytes: u64) -> Result<(), String> {
    match payload {
        Payload::Recycle(path) => {
            if !path.is_file() {
                return Err("The Recycle Bin copy is gone".into());
            }
            fs::copy(path, dest).map_err(|err| err.to_string())?;
            Ok(())
        }
        Payload::Resident(data) => {
            let mut file = File::create(dest).map_err(|err| err.to_string())?;
            file.write_all(data).map_err(|err| err.to_string())
        }
        Payload::Runs { volume, cluster, size, runs } => write_runs(volume, *cluster, *size, runs, dest),
        Payload::Carve { volume, offset, size, ext } => carve_to(volume, *offset, *size, ext, dest, bytes),
    }
}

pub fn safe_file_name(name: &str) -> String {
    let mut out = String::new();
    for ch in name.chars() {
        if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
            out.push('_');
        } else {
            out.push(ch);
        }
        if out.len() >= 120 {
            break;
        }
    }
    let trimmed = out.trim().trim_matches('.').to_string();
    if trimmed.is_empty() { "recovered".into() } else { trimmed }
}

fn unique_name(folder: &str, name: &str, used: &mut HashSet<String>) -> String {
    let dot = name.rfind('.').unwrap_or(name.len());
    let (stem, ext) = if dot == 0 { (name, "") } else { (&name[..dot], &name[dot..]) };
    let mut candidate = name.to_string();
    let mut n = 2;
    while used.contains(&candidate.to_lowercase()) || Path::new(folder).join(&candidate).exists() {
        candidate = format!("{stem} ({n}){ext}");
        n += 1;
    }
    used.insert(candidate.to_lowercase());
    candidate
}

fn drive_letter(path: &str) -> Option<char> {
    let bytes = path.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' {
        Some((bytes[0] as char).to_ascii_uppercase())
    } else {
        None
    }
}

fn normalize_letter(text: &str) -> Option<String> {
    let ch = text.chars().next()?;
    if ch.is_ascii_alphabetic() {
        Some(ch.to_ascii_uppercase().to_string())
    } else {
        None
    }
}

pub fn decode_runs(data: &[u8]) -> Vec<(i64, u64)> {
    let mut runs = Vec::new();
    let mut index = 0;
    let mut lcn: i64 = 0;
    while index < data.len() {
        let header = data[index];
        if header == 0 {
            break;
        }
        index += 1;
        let len_len = (header & 0x0F) as usize;
        let off_len = (header >> 4) as usize;
        if len_len == 0 || len_len > 8 || off_len > 8 || index + len_len + off_len > data.len() {
            break;
        }
        let mut length = 0u64;
        for byte in 0..len_len {
            length |= (data[index + byte] as u64) << (8 * byte);
        }
        index += len_len;
        if off_len == 0 {
            runs.push((-1, length));
            continue;
        }
        let mut offset = 0i64;
        for byte in 0..off_len {
            offset |= (data[index + byte] as i64) << (8 * byte);
        }
        let shift = 64 - off_len * 8;
        offset = (offset << shift) >> shift;
        index += off_len;
        if offset == 0 {
            runs.push((-1, length));
            continue;
        }
        lcn = lcn.saturating_add(offset);
        runs.push((lcn, length));
    }
    runs
}

#[cfg(windows)]
#[link(name = "kernel32")]
extern "system" {
    fn CreateFileW(name: *const u16, access: u32, share: u32, security: *mut core::ffi::c_void, disposition: u32, flags: u32, template: isize) -> isize;
    fn ReadFile(handle: isize, buffer: *mut u8, bytes: u32, read: *mut u32, overlapped: *mut core::ffi::c_void) -> i32;
    fn SetFilePointerEx(handle: isize, distance: i64, new_position: *mut i64, method: u32) -> i32;
    fn CloseHandle(handle: isize) -> i32;
}

#[cfg(windows)]
struct Volume {
    handle: isize,
}

#[cfg(windows)]
impl Drop for Volume {
    fn drop(&mut self) {
        if self.handle != -1 {
            unsafe { CloseHandle(self.handle) };
        }
    }
}

#[cfg(windows)]
impl Volume {
    fn open(letter: &str) -> Result<Self, String> {
        let name = wide(&format!("\\\\.\\{letter}:"));
        let handle = unsafe {
            CreateFileW(
                name.as_ptr(),
                0x8000_0000,
                1 | 2 | 4,
                std::ptr::null_mut(),
                3,
                0x80,
                0,
            )
        };
        if handle == -1 {
            return Err("Could not read that drive. Right-click Data Finder and choose Run as administrator, then scan again.".into());
        }
        Ok(Self { handle })
    }

    fn read_at(&self, offset: u64, buf: &mut [u8]) -> bool {
        if buf.is_empty() {
            return true;
        }
        let mut moved = 0i64;
        let seek = unsafe { SetFilePointerEx(self.handle, offset as i64, &mut moved, 0) };
        if seek == 0 {
            return false;
        }
        let mut read = 0u32;
        unsafe { read_file(self.handle, buf.as_mut_ptr(), buf.len() as u32, &mut read, std::ptr::null_mut()) != 0 && read as usize == buf.len() }
    }
}

#[cfg(windows)]
fn wide(text: &str) -> Vec<u16> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    OsStr::new(text).encode_wide().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn scan_volume(letter: &str, allow: &HashSet<String>, deep: bool) -> Result<(), String> {
    set_phase("Reading deleted file records", 0, 0);
    let volume = Volume::open(letter)?;
    let mut boot = vec![0u8; 512];
    if !volume.read_at(0, &mut boot) || &boot[3..11] != b"NTFS    " {
        return Err("Deleted records can only be read on an NTFS drive.".into());
    }
    let sector = u16::from_le_bytes([boot[0x0B], boot[0x0C]]) as u32;
    let sectors_per_cluster = boot[0x0D] as u32;
    if sector == 0 || sectors_per_cluster == 0 {
        return Err("That drive's layout could not be read.".into());
    }
    let cluster = sector.saturating_mul(sectors_per_cluster);
    let mft_cluster = i64::from_le_bytes(boot[0x30..0x38].try_into().unwrap_or([0; 8]));
    let record_size = record_size(boot[0x40] as i8, cluster);
    let total_sectors = u64::from_le_bytes(boot[0x28..0x30].try_into().unwrap_or([0; 8]));
    let total_bytes = total_sectors.saturating_mul(sector as u64);
    set_phase("Reading deleted file records", 0, total_bytes / (1024 * 1024));
    let mft_offset = (mft_cluster as u64).saturating_mul(cluster as u64);
    let mut record0 = vec![0u8; record_size as usize];
    if !volume.read_at(mft_offset, &mut record0) || !apply_fixup(&mut record0, sector as usize) {
        return Err("The file index could not be read.".into());
    }
    let mft_runs = data_runs(&record0);
    let names = collect_names(&volume, &mft_runs, cluster, record_size, sector);
    collect_deleted(&volume, &mft_runs, cluster, record_size, sector, letter, allow, &names);
    if deep && !cancel_flag().load(Ordering::Relaxed) {
        let bitmap = read_bitmap(&volume, &names, cluster, record_size, sector, &mft_runs);
        if bitmap.is_empty() {
            let mut run = state().lock().unwrap_or_else(|err| err.into_inner());
            run.error = "Deep scan needs the free-space map. Deleted files and the Recycle Bin were still scanned.".into();
        } else {
            deep_scan(&volume, letter, allow, cluster, total_bytes, &bitmap);
        }
    }
    Ok(())
}

#[cfg(windows)]
fn record_size(raw: i8, cluster: u32) -> u32 {
    if raw > 0 {
        (raw as u32).saturating_mul(cluster).max(512)
    } else {
        1u32 << ((-raw) as u32).min(16)
    }
}

#[cfg(windows)]
fn apply_fixup(record: &mut [u8], sector: usize) -> bool {
    if record.len() < 8 || &record[0..4] != b"FILE" || sector < 2 {
        return false;
    }
    let usa_off = u16::from_le_bytes([record[4], record[5]]) as usize;
    let usa_count = u16::from_le_bytes([record[6], record[7]]) as usize;
    if usa_count < 2 || usa_off + usa_count * 2 > record.len() {
        return false;
    }
    let usn = [record[usa_off], record[usa_off + 1]];
    for sector_index in 1..usa_count {
        let end = sector_index * sector;
        if end < 2 || end > record.len() {
            return false;
        }
        let pos = end - 2;
        if record[pos] != usn[0] || record[pos + 1] != usn[1] {
            return false;
        }
        let src = usa_off + sector_index * 2;
        record[pos] = record[src];
        record[pos + 1] = record[src + 1];
    }
    true
}

#[cfg(windows)]
struct FileName {
    parent: u64,
    name: String,
    real_size: u64,
}

#[cfg(windows)]
fn data_runs(record: &[u8]) -> Vec<(i64, u64)> {
    for attr in attributes(record) {
        if attr.kind == 0x80 && attr.name.is_empty() {
            return decode_runs(attr.runlist);
        }
    }
    Vec::new()
}

#[cfg(windows)]
struct Attr<'a> {
    kind: u32,
    name: String,
    resident: &'a [u8],
    runlist: &'a [u8],
    data_size: u64,
}

#[cfg(windows)]
fn attributes(record: &[u8]) -> Vec<Attr<'_>> {
    let mut out = Vec::new();
    if record.len() < 22 {
        return out;
    }
    let mut offset = u16::from_le_bytes([record[0x14], record[0x15]]) as usize;
    while offset + 16 <= record.len() {
        let kind = u32::from_le_bytes(record[offset..offset + 4].try_into().unwrap_or([0; 4]));
        if kind == 0xFFFF_FFFF || kind == 0 {
            break;
        }
        let length = u32::from_le_bytes(record[offset + 4..offset + 8].try_into().unwrap_or([0; 4])) as usize;
        if length < 16 || offset + length > record.len() {
            break;
        }
        let non_resident = record[offset + 8] != 0;
        let name_len = record[offset + 9] as usize;
        let name_off = u16::from_le_bytes([record[offset + 10], record[offset + 11]]) as usize;
        let name = if name_len > 0 && offset + name_off + name_len * 2 <= record.len() {
            utf16_text(&record[offset + name_off..offset + name_off + name_len * 2])
        } else {
            String::new()
        };
        if non_resident {
            if offset + 0x40 <= record.len() {
                let run_off = u16::from_le_bytes([record[offset + 0x20], record[offset + 0x21]]) as usize;
                let data_size = u64::from_le_bytes(record[offset + 0x30..offset + 0x38].try_into().unwrap_or([0; 8]));
                let runlist = if offset + run_off < offset + length {
                    &record[offset + run_off..offset + length]
                } else {
                    &[]
                };
                out.push(Attr { kind, name, resident: &[], runlist, data_size });
            }
        } else if offset + 0x18 <= record.len() {
            let value_len = u32::from_le_bytes(record[offset + 0x10..offset + 0x14].try_into().unwrap_or([0; 4])) as usize;
            let value_off = u16::from_le_bytes([record[offset + 0x14], record[offset + 0x15]]) as usize;
            let resident = if offset + value_off + value_len <= offset + length {
                &record[offset + value_off..offset + value_off + value_len]
            } else {
                &[]
            };
            out.push(Attr { kind, name, resident, runlist: &[], data_size: resident.len() as u64 });
        }
        offset += length;
    }
    out
}

#[cfg(windows)]
fn parse_filename(value: &[u8]) -> Option<FileName> {
    if value.len() < 0x42 {
        return None;
    }
    let parent = u64::from_le_bytes(value[0..8].try_into().ok()?) & 0x0000_FFFF_FFFF_FFFF;
    let real_size = u64::from_le_bytes(value[0x30..0x38].try_into().ok()?);
    let name_len = value[0x40] as usize;
    let namespace = value[0x41];
    if namespace == 2 || name_len == 0 || 0x42 + name_len * 2 > value.len() {
        return None;
    }
    let name = utf16_text(&value[0x42..0x42 + name_len * 2]);
    if name.is_empty() {
        return None;
    }
    Some(FileName { parent, name, real_size })
}

#[cfg(windows)]
fn for_each_record(volume: &Volume, runs: &[(i64, u64)], cluster: u32, record_size: u32, sector: u32, mut visit: impl FnMut(u64, &mut [u8]) -> bool) {
    let record_size = record_size.max(512) as u64;
    let cluster = cluster as u64;
    let mut index = 0u64;
    for (lcn, count) in runs {
        if *lcn < 0 {
            index += record_span(cluster, record_size, *count);
            continue;
        }
        let bytes = count.saturating_mul(cluster);
        let mut done = 0u64;
        while done < bytes {
            if cancel_flag().load(Ordering::Relaxed) {
                return;
            }
            let chunk = (bytes - done).min(1024 * 1024);
            let aligned = chunk - (chunk % record_size.max(1));
            if aligned == 0 {
                break;
            }
            let mut buf = vec![0u8; aligned as usize];
            if !volume.read_at((*lcn as u64) * cluster + done, &mut buf) {
                done += aligned;
                index += aligned / record_size;
                continue;
            }
            let mut cursor = 0;
            while cursor + record_size as usize <= buf.len() {
                let slice = &mut buf[cursor..cursor + record_size as usize];
                if !visit(index, slice) {
                    return;
                }
                cursor += record_size as usize;
                index += 1;
            }
            done += aligned;
        }
    }
    let _ = sector;
}

#[cfg(windows)]
fn record_span(cluster: u64, record_size: u64, count: u64) -> u64 {
    count.saturating_mul(cluster) / record_size.max(1)
}

#[cfg(windows)]
fn collect_names(volume: &Volume, runs: &[(i64, u64)], cluster: u32, record_size: u32, sector: u32) -> HashMap<u64, (u64, String)> {
    let mut names = HashMap::new();
    for_each_record(volume, runs, cluster, record_size, sector, |index, record| {
        if !apply_fixup(record, sector as usize) {
            return true;
        }
        let in_use = record.len() > 0x17 && (record[0x16] & 0x01) != 0;
        if !in_use {
            return true;
        }
        for attr in attributes(record) {
            if attr.kind == 0x30 {
                if let Some(parsed) = parse_filename(attr.resident) {
                    names.insert(index, (parsed.parent, parsed.name));
                    break;
                }
            }
        }
        true
    });
    names
}

#[cfg(windows)]
fn build_path(names: &HashMap<u64, (u64, String)>, parent: u64, name: &str) -> String {
    let mut parts = vec![name.to_string()];
    let mut cur = parent;
    let mut guard = 0;
    while guard < 48 {
        guard += 1;
        let Some((next, label)) = names.get(&cur) else { break };
        if label == "." || label.is_empty() {
            break;
        }
        parts.push(label.clone());
        if *next == cur {
            break;
        }
        cur = *next;
    }
    parts.reverse();
    parts.join("\\")
}

#[cfg(windows)]
fn collect_deleted(
    volume: &Volume,
    runs: &[(i64, u64)],
    cluster: u32,
    record_size: u32,
    sector: u32,
    letter: &str,
    allow: &HashSet<String>,
    names: &HashMap<u64, (u64, String)>,
) {
    let volume_path = format!("\\\\.\\{letter}:");
    for_each_record(volume, runs, cluster, record_size, sector, |index, record| {
        if index > 0 && index % 8192 == 0 {
            set_phase("Reading deleted file records", index / 1024, 0);
            let count = state().lock().unwrap_or_else(|err| err.into_inner()).hits.len();
            if count >= 4000 {
                return false;
            }
        }
        if !apply_fixup(record, sector as usize) {
            return true;
        }
        if record.len() <= 0x17 || (record[0x16] & 0x01) != 0 || (record[0x16] & 0x02) != 0 {
            return true;
        }
        let mut filename: Option<FileName> = None;
        let mut resident: Option<Vec<u8>> = None;
        let mut runs_found: Vec<(i64, u64)> = Vec::new();
        let mut data_size = 0u64;
        for attr in attributes(record) {
            if attr.kind == 0x30 && filename.is_none() {
                filename = parse_filename(attr.resident);
            }
            if attr.kind == 0x80 && attr.name.is_empty() {
                if !attr.resident.is_empty() {
                    resident = Some(attr.resident.to_vec());
                    data_size = attr.resident.len() as u64;
                } else {
                    runs_found = decode_runs(attr.runlist);
                    data_size = attr.data_size;
                }
            }
        }
        let Some(file) = filename else { return true };
        if file.name.starts_with('$') {
            return true;
        }
        let kind = kind_of(&file.name);
        if !allowed(&kind, allow) {
            return true;
        }
        let size = if data_size == 0 { file.real_size } else { data_size };
        let original = format!("{letter}:\\{}", build_path(names, file.parent, &file.name));
        let (chance, payload) = if let Some(data) = resident {
            ("Excellent".into(), Payload::Resident(data))
        } else if runs_cover(&runs_found, cluster, size) {
            ("Good".into(), Payload::Runs { volume: volume_path.clone(), cluster, size, runs: runs_found })
        } else if !runs_found.is_empty() {
            ("Poor".into(), Payload::Runs { volume: volume_path.clone(), cluster, size, runs: runs_found })
        } else {
            return true;
        };
        push_hit(Stored {
            hit: RecoveryHit {
                id: next_id(),
                name: file.name,
                original,
                bytes: size,
                kind,
                chance,
                source: "Deleted".into(),
            },
            payload,
        });
        true
    });
}

#[cfg(windows)]
fn runs_cover(runs: &[(i64, u64)], cluster: u32, size: u64) -> bool {
    if size == 0 {
        return false;
    }
    let bytes: u64 = runs.iter().filter(|(lcn, _)| *lcn >= 0).map(|(_, count)| count.saturating_mul(cluster as u64)).sum();
    bytes >= size
}

#[cfg(windows)]
fn read_bitmap(volume: &Volume, _names: &HashMap<u64, (u64, String)>, cluster: u32, record_size: u32, sector: u32, runs: &[(i64, u64)]) -> Vec<u8> {
    let mut data_runs = Vec::new();
    let mut size = 0u64;
    for_each_record(volume, runs, cluster, record_size, sector, |index, record| {
        if index != 6 {
            return true;
        }
        if apply_fixup(record, sector as usize) {
            for attr in attributes(record) {
                if attr.kind == 0x80 && attr.name.is_empty() {
                    data_runs = decode_runs(attr.runlist);
                    size = attr.data_size;
                }
            }
        }
        false
    });
    if data_runs.is_empty() || size == 0 || size > 64 * 1024 * 1024 {
        return Vec::new();
    }
    let mut out = vec![0u8; size as usize];
    let mut filled = 0usize;
    for (lcn, count) in &data_runs {
        if *lcn < 0 {
            let skip = (*count as usize).saturating_mul(cluster as usize).min(out.len().saturating_sub(filled));
            filled += skip;
            continue;
        }
        let bytes = (*count as usize).saturating_mul(cluster as usize);
        let take = bytes.min(out.len().saturating_sub(filled));
        if take == 0 {
            break;
        }
        if !volume.read_at((*lcn as u64).saturating_mul(cluster as u64), &mut out[filled..filled + take]) {
            return Vec::new();
        }
        filled += take;
    }
    out.truncate(filled);
    out
}

#[cfg(windows)]
fn deep_scan(volume: &Volume, letter: &str, allow: &HashSet<String>, cluster: u32, total_bytes: u64, bitmap: &[u8]) {
    let volume_path = format!("\\\\.\\{letter}:");
    set_phase("Mapping free space", 0, total_bytes / (1024 * 1024));
    let ranges = free_ranges(bitmap);
    let free_bytes: u64 = ranges.iter().map(|(_, count)| count.saturating_mul(cluster as u64)).sum();
    let total_mb = free_bytes / (1024 * 1024);
    let mut scanned = 0u64;
    let mut found = 0u32;
    let _ = total_bytes;
    for (start, count) in ranges {
        if found >= 400 || cancel_flag().load(Ordering::Relaxed) {
            break;
        }
        let mut done = 0u64;
        let bytes = count.saturating_mul(cluster as u64);
        while done < bytes && found < 400 {
            if cancel_flag().load(Ordering::Relaxed) {
                return;
            }
            let chunk = (bytes - done).min(1024 * 1024) as usize;
            let mut buf = vec![0u8; chunk];
            let offset = start.saturating_mul(cluster as u64) + done;
            if volume.read_at(offset, &mut buf) {
                let mut cursor = 0usize;
                while cursor + 16 < buf.len() && found < 400 {
                    if let Some((ext, kind, size)) = signature_at(&buf[cursor..]) {
                        if allowed(&kind, allow) {
                            let file_offset = offset + cursor as u64;
                            push_hit(Stored {
                                hit: RecoveryHit {
                                    id: next_id(),
                                    name: format!("recovered-{file_offset}.{ext}"),
                                    original: format!("{letter}:\\ (free space at {file_offset})"),
                                    bytes: size,
                                    kind,
                                    chance: "Fair".into(),
                                    source: "Deep scan".into(),
                                },
                                payload: Payload::Carve { volume: volume_path.clone(), offset: file_offset, size, ext },
                            });
                            found += 1;
                            cursor += (size as usize).min(8 * 1024 * 1024).max(512);
                            continue;
                        }
                    }
                    cursor += 512;
                }
            }
            done += chunk as u64;
            scanned += chunk as u64;
            if scanned / (32 * 1024 * 1024) != (scanned - chunk as u64) / (32 * 1024 * 1024) {
                set_phase("Deep scan of free space", scanned / (1024 * 1024), total_mb);
            }
        }
    }
}

#[cfg(windows)]
fn free_ranges(bitmap: &[u8]) -> Vec<(u64, u64)> {
    let mut ranges = Vec::new();
    let clusters = (bitmap.len() as u64).saturating_mul(8);
    let mut start: Option<u64> = None;
    for lcn in 0..clusters {
        let free = (bitmap[(lcn / 8) as usize] & (1u8 << (lcn % 8))) == 0;
        if free && start.is_none() {
            start = Some(lcn);
        }
        if !free {
            if let Some(from) = start.take() {
                ranges.push((from, lcn - from));
            }
        }
    }
    if let Some(from) = start {
        ranges.push((from, clusters - from));
    }
    ranges
}

#[cfg(windows)]
fn signature_at(buf: &[u8]) -> Option<(String, String, u64)> {
    if buf.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(("jpg".into(), "Pictures".into(), 8 * 1024 * 1024));
    }
    if buf.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(("png".into(), "Pictures".into(), 16 * 1024 * 1024));
    }
    if buf.starts_with(b"GIF87a") || buf.starts_with(b"GIF89a") {
        return Some(("gif".into(), "Pictures".into(), 8 * 1024 * 1024));
    }
    if buf.starts_with(b"%PDF") {
        return Some(("pdf".into(), "Documents".into(), 16 * 1024 * 1024));
    }
    if buf.starts_with(b"PK\x03\x04") {
        return Some(("zip".into(), "Archives".into(), 32 * 1024 * 1024));
    }
    if buf.starts_with(b"ID3") {
        return Some(("mp3".into(), "Music".into(), 8 * 1024 * 1024));
    }
    if buf.starts_with(b"RIFF") && buf.len() > 12 && &buf[8..12] == b"WAVE" {
        return Some(("wav".into(), "Music".into(), 16 * 1024 * 1024));
    }
    if buf.len() > 12 && &buf[4..8] == b"ftyp" {
        return Some(("mp4".into(), "Video".into(), 32 * 1024 * 1024));
    }
    if buf.starts_with(&[0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]) {
        return Some(("7z".into(), "Archives".into(), 32 * 1024 * 1024));
    }
    None
}

#[cfg(windows)]
fn write_runs(volume: &str, cluster: u32, size: u64, runs: &[(i64, u64)], dest: &Path) -> Result<(), String> {
    let vol = Volume::open(&normalize_letter(volume).unwrap_or_else(|| volume_letter(volume)))?;
    let mut file = File::create(dest).map_err(|err| err.to_string())?;
    let mut left = size;
    let cluster = cluster as u64;
    for (lcn, count) in runs {
        let bytes = count.saturating_mul(cluster);
        if *lcn < 0 {
            let mut fill = bytes.min(left);
            while fill > 0 {
                let chunk = fill.min(1024 * 1024) as usize;
                file.write_all(&vec![0u8; chunk]).map_err(|err| err.to_string())?;
                fill -= chunk as u64;
                left = left.saturating_sub(chunk as u64);
            }
        } else {
            let mut done = 0u64;
            while done < bytes && left > 0 {
                let chunk = (bytes - done).min(1024 * 1024).min(left) as usize;
                let mut buf = vec![0u8; chunk];
                if !vol.read_at((*lcn as u64) * cluster + done, &mut buf) {
                    return Err("Part of that file could not be read".into());
                }
                file.write_all(&buf).map_err(|err| err.to_string())?;
                done += chunk as u64;
                left = left.saturating_sub(chunk as u64);
            }
        }
        if left == 0 {
            break;
        }
    }
    Ok(())
}

#[cfg(windows)]
fn volume_letter(volume: &str) -> String {
    volume.chars().find(|ch| ch.is_ascii_alphabetic()).map(|ch| ch.to_ascii_uppercase().to_string()).unwrap_or_else(|| "C".into())
}

#[cfg(windows)]
fn carve_to(volume: &str, offset: u64, size: u64, ext: &str, dest: &Path, _hint: u64) -> Result<(), String> {
    let vol = Volume::open(&volume_letter(volume))?;
    let mut buf = vec![0u8; size.min(32 * 1024 * 1024) as usize];
    if !vol.read_at(offset, &mut buf) {
        return Err("That free-space file could not be read".into());
    }
    let end = trim_carved(&buf, ext);
    let mut file = File::create(dest).map_err(|err| err.to_string())?;
    file.write_all(&buf[..end]).map_err(|err| err.to_string())
}

fn trim_carved(buf: &[u8], ext: &str) -> usize {
    if ext == "jpg" {
        if let Some(pos) = find_pair(buf, &[0xFF, 0xD9]) {
            return (pos + 2).min(buf.len());
        }
    }
    if ext == "png" {
        let marker = b"IEND";
        if let Some(pos) = buf.windows(marker.len()).position(|window| window == marker) {
            return (pos + 8).min(buf.len());
        }
    }
    if ext == "pdf" {
        let marker = b"%%EOF";
        if let Some(pos) = buf.windows(marker.len()).rposition(|window| window == marker) {
            return (pos + marker.len()).min(buf.len());
        }
    }
    buf.len()
}

fn find_pair(buf: &[u8], marker: &[u8]) -> Option<usize> {
    buf.windows(marker.len()).rposition(|window| window == marker)
}

#[cfg(not(windows))]
fn write_runs(_volume: &str, _cluster: u32, _size: u64, _runs: &[(i64, u64)], _dest: &Path) -> Result<(), String> {
    Err("Saving deleted files runs in the Windows program".into())
}

#[cfg(not(windows))]
fn carve_to(_volume: &str, _offset: u64, _size: u64, _ext: &str, _dest: &Path, _hint: u64) -> Result<(), String> {
    Err("Saving a deep-scan file runs in the Windows program".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_windows_10_recycle_record() {
        let mut bytes = vec![0u8; 28];
        bytes[0] = 2;
        bytes[8] = 10;
        let path: Vec<u16> = "C:\\Users\\A\\photo.jpg".encode_utf16().collect();
        bytes[24..28].copy_from_slice(&(path.len() as u32).to_le_bytes());
        for unit in path {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let info = parse_recycle_info(&bytes).unwrap();
        assert_eq!(info.path, "C:\\Users\\A\\photo.jpg");
        assert_eq!(info.size, 10);
        assert_eq!(kind_of(&info.path), "Pictures");
    }

    #[test]
    fn decodes_a_run_list() {
        let runs = decode_runs(&[0x21, 0x04, 0x10, 0x00, 0x00]);
        assert_eq!(runs, vec![(16, 4)]);
    }

    #[test]
    fn strips_bad_file_name_characters() {
        assert_eq!(safe_file_name("a:b*c?.txt"), "a_b_c_.txt");
    }
}
