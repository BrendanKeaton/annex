use rand::RngCore;
use std::io::{Seek, SeekFrom, Write};
use std::path::Path;
use zeroize::Zeroize;

use super::crypto::generate_random_filename;

fn overwrite_random(file: &std::fs::File, len: u64) -> Result<(), String> {
    let mut writer = std::io::BufWriter::new(file);
    writer
        .seek(SeekFrom::Start(0))
        .map_err(|e| format!("Seek failed: {}", e))?;
    let mut buf = [0u8; 65536];
    let mut written = 0u64;
    while written < len {
        let chunk = std::cmp::min(65536, (len - written) as usize);
        rand::rngs::OsRng.fill_bytes(&mut buf[..chunk]);
        writer
            .write_all(&buf[..chunk])
            .map_err(|e| format!("Random overwrite failed: {}", e))?;
        written += chunk as u64;
    }
    writer
        .flush()
        .map_err(|e| format!("Flush failed: {}", e))?;
    buf.zeroize();
    Ok(())
}

#[cfg(target_os = "linux")]
fn platform_deallocate(file: &std::fs::File, len: u64) {
    use std::os::unix::io::AsRawFd;
    unsafe {
        libc::fallocate(
            file.as_raw_fd(),
            libc::FALLOC_FL_PUNCH_HOLE | libc::FALLOC_FL_KEEP_SIZE,
            0,
            len as libc::off_t,
        );
    }
}

#[cfg(target_os = "macos")]
fn platform_deallocate(file: &std::fs::File, len: u64) {
    use std::os::unix::io::AsRawFd;

    const F_PUNCHHOLE: libc::c_int = 99;

    #[repr(C)]
    struct FPunchhole {
        fp_flags: u32,
        reserved: u32,
        fp_offset: i64,
        fp_length: i64,
    }

    let hole = FPunchhole {
        fp_flags: 0,
        reserved: 0,
        fp_offset: 0,
        fp_length: len as i64,
    };

    unsafe {
        libc::fcntl(file.as_raw_fd(), F_PUNCHHOLE, &hole);
    }
}

#[cfg(target_os = "windows")]
fn platform_deallocate(file: &std::fs::File, len: u64) {
    use std::os::windows::io::AsRawHandle;

    #[repr(C)]
    struct FileZeroDataInformation {
        file_offset: i64,
        beyond_final_zero: i64,
    }

    const FSCTL_SET_ZERO_DATA: u32 = 0x000980C8;

    let zero_data = FileZeroDataInformation {
        file_offset: 0,
        beyond_final_zero: len as i64,
    };

    unsafe {
        windows_sys::Win32::System::IO::DeviceIoControl(
            file.as_raw_handle() as *mut std::ffi::c_void,
            FSCTL_SET_ZERO_DATA,
            &zero_data as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<FileZeroDataInformation>() as u32,
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
    }
}

pub fn secure_delete_file(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let file_len = std::fs::metadata(path)
        .map_err(|e| format!("Cannot access {}: {}", path.display(), e))?
        .len();

    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|e| format!("Cannot open {} for secure wipe: {}", path.display(), e))?;

    overwrite_random(&file, file_len)?;
    file.sync_all()
        .map_err(|e| format!("Sync failed after random pass: {}", e))?;

    platform_deallocate(&file, file_len);

    file.set_len(0)
        .map_err(|e| format!("Truncate failed for {}: {}", path.display(), e))?;
    file.sync_all()
        .map_err(|e| format!("Sync failed after truncate: {}", e))?;

    drop(file);

    let parent = path
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", path.display()))?;
    let random_name = generate_random_filename();
    let renamed_path = parent.join(format!(".{}.tmp", random_name));
    std::fs::rename(path, &renamed_path)
        .map_err(|e| format!("Failed to rename {}: {}", path.display(), e))?;

    std::fs::remove_file(&renamed_path)
        .map_err(|e| format!("Failed to delete {}: {}", path.display(), e))?;

    Ok(())
}
