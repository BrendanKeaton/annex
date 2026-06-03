use std::path::{Path, PathBuf};

pub fn collect_sweep_targets(protected_paths: &[String]) -> Vec<PathBuf> {
    let mut targets = Vec::new();

    for path_str in protected_paths {
        let path = Path::new(path_str);

        targets.extend(collect_editor_sidecars(path));

        targets.extend(collect_vscode_local_history(path));

        targets.extend(collect_vscode_hot_exit_backups(path));

        targets.extend(collect_vscode_copilot_chunks(path));

        targets.extend(collect_vscode_workspace_hot_exit(path));
    }

    targets
}

pub fn detect_history_exposure(protected_paths: &[String]) -> Vec<String> {
    let mut warnings = Vec::new();

    for path_str in protected_paths {
        let path = Path::new(path_str);
        let file_name = match path.file_name().and_then(|f| f.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };

        if let Some(warning) = check_git_history(path) {
            warnings.push(warning);
        }

        warnings.extend(check_shell_history(&file_name));
    }

    warnings
}

fn collect_editor_sidecars(path: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();

    let dir = match path.parent() {
        Some(d) => d,
        None => return found,
    };

    let name = match path.file_name().and_then(|f| f.to_str()) {
        Some(n) => n,
        None => return found,
    };

    let candidates = [
        format!("{}.tmp", name),
        format!("{}~", name),
        format!(".{}.swp", name),
        format!(".{}.swo", name),
        format!("{}.bak", name),
        format!("{}.orig", name),
        format!("~{}", name),
        format!("{}.save", name),
        format!("#{}#", name),
    ];

    for candidate in &candidates {
        let candidate_path = dir.join(candidate);
        if candidate_path.exists() {
            found.push(candidate_path);
        }
    }

    found
}

fn vscode_user_data_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|h| h.join("Library/Application Support/Code/User"))
    }

    #[cfg(target_os = "linux")]
    {
        dirs::config_dir().map(|c| c.join("Code/User"))
    }

    #[cfg(target_os = "windows")]
    {
        dirs::config_dir().map(|c| c.join("Code/User"))
    }
}

fn collect_vscode_local_history(protected_path: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();

    let user_dir = match vscode_user_data_dir() {
        Some(d) => d,
        None => return found,
    };

    let history_dir = user_dir.join("History");
    if !history_dir.is_dir() {
        return found;
    }

    let abs_path = match protected_path.canonicalize() {
        Ok(p) => p,
        Err(_) => protected_path.to_path_buf(),
    };
    let abs_path_str = abs_path.to_string_lossy();

    let entries = match std::fs::read_dir(&history_dir) {
        Ok(e) => e,
        Err(_) => return found,
    };

    for entry in entries.flatten() {
        let entry_dir = entry.path();
        if !entry_dir.is_dir() {
            continue;
        }

        let entries_json = entry_dir.join("entries.json");
        if !entries_json.exists() {
            continue;
        }

        let content = match std::fs::read_to_string(&entries_json) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let json: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let resource = match json.get("resource").and_then(|r| r.as_str()) {
            Some(r) => r,
            None => continue,
        };

        let decoded_resource = resource.strip_prefix("file://").unwrap_or(resource);

        if !paths_match(decoded_resource, &abs_path_str) {
            continue;
        }

        let snapshot_entries = match json.get("entries").and_then(|e| e.as_array()) {
            Some(e) => e,
            None => continue,
        };

        for snapshot in snapshot_entries {
            if let Some(id) = snapshot.get("id").and_then(|i| i.as_str()) {
                let snapshot_path = entry_dir.join(id);
                if snapshot_path.exists() {
                    found.push(snapshot_path);
                }
            }
        }

        found.push(entries_json);
    }

    found
}

fn collect_vscode_hot_exit_backups(protected_path: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();

    let user_dir = match vscode_user_data_dir() {
        Some(d) => d,
        None => return found,
    };

    let backups_dir = user_dir.join("Backups");
    if !backups_dir.is_dir() {
        return found;
    }

    let abs_path = match protected_path.canonicalize() {
        Ok(p) => p,
        Err(_) => protected_path.to_path_buf(),
    };
    let abs_path_str = abs_path.to_string_lossy();

    let _ = walk_dir_for_references(&backups_dir, &abs_path_str, &mut found);

    found
}

fn walk_dir_for_references(dir: &Path, search_str: &str, found: &mut Vec<PathBuf>) -> Option<()> {
    let entries = std::fs::read_dir(dir).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_dir_for_references(&path, search_str, found);
            continue;
        }

        // skip file >10 MB to avoid perf issues
        let meta = match std::fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > 10 * 1024 * 1024 {
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if content.contains(search_str) {
            found.push(path);
        }
    }

    Some(())
}

fn collect_vscode_copilot_chunks(protected_path: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();

    let user_dir = match vscode_user_data_dir() {
        Some(d) => d,
        None => return found,
    };

    let workspace_storage = user_dir.parent().map(|p| p.join("workspaceStorage"));

    let workspace_storage = match workspace_storage {
        Some(d) if d.is_dir() => d,
        _ => return found,
    };

    let parent_dir = match protected_path.parent() {
        Some(p) => p.canonicalize().unwrap_or_else(|_| p.to_path_buf()),
        None => return found,
    };

    let entries = match std::fs::read_dir(&workspace_storage) {
        Ok(e) => e,
        Err(_) => return found,
    };

    for entry in entries.flatten() {
        let ws_dir = entry.path();
        if !ws_dir.is_dir() {
            continue;
        }

        let workspace_json = ws_dir.join("workspace.json");
        if !workspace_json.exists() {
            continue;
        }

        let content = match std::fs::read_to_string(&workspace_json) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let json: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let folder = match json.get("folder").and_then(|f| f.as_str()) {
            Some(f) => f,
            None => continue,
        };

        let decoded_folder = url_decode(folder.strip_prefix("file://").unwrap_or(folder));
        let folder_path = PathBuf::from(decoded_folder.replace('\\', "/"));
        let folder_canon = folder_path
            .canonicalize()
            .unwrap_or_else(|_| folder_path.clone());

        if !is_path_ancestor_or_descendant(&parent_dir, &folder_canon) {
            continue;
        }
        let copilot_dir = ws_dir.join("GitHub.copilot-chat");
        if !copilot_dir.is_dir() {
            continue;
        }

        let copilot_entries = match std::fs::read_dir(&copilot_dir) {
            Ok(e) => e,
            Err(_) => continue,
        };

        for copilot_entry in copilot_entries.flatten() {
            let copilot_path = copilot_entry.path();
            if copilot_path.is_file() {
                found.push(copilot_path);
            } else if copilot_path.is_dir() {
                if let Ok(sub_entries) = std::fs::read_dir(&copilot_path) {
                    for sub_entry in sub_entries.flatten() {
                        if sub_entry.path().is_file() {
                            found.push(sub_entry.path());
                        }
                    }
                }
            }
        }
    }

    found
}

fn collect_vscode_workspace_hot_exit(protected_path: &Path) -> Vec<PathBuf> {
    let mut found = Vec::new();

    let user_dir = match vscode_user_data_dir() {
        Some(d) => d,
        None => return found,
    };

    let workspace_storage = user_dir.parent().map(|p| p.join("workspaceStorage"));

    let workspace_storage = match workspace_storage {
        Some(d) if d.is_dir() => d,
        _ => return found,
    };

    let parent_dir = match protected_path.parent() {
        Some(p) => p.canonicalize().unwrap_or_else(|_| p.to_path_buf()),
        None => return found,
    };

    let entries = match std::fs::read_dir(&workspace_storage) {
        Ok(e) => e,
        Err(_) => return found,
    };

    for entry in entries.flatten() {
        let ws_dir = entry.path();
        if !ws_dir.is_dir() {
            continue;
        }

        let workspace_json = ws_dir.join("workspace.json");
        if !workspace_json.exists() {
            continue;
        }

        let content = match std::fs::read_to_string(&workspace_json) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let json: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let folder = match json.get("folder").and_then(|f| f.as_str()) {
            Some(f) => f,
            None => continue,
        };

        let decoded_folder = url_decode(folder.strip_prefix("file://").unwrap_or(folder));
        let folder_path = PathBuf::from(decoded_folder.replace('\\', "/"));
        let folder_canon = folder_path
            .canonicalize()
            .unwrap_or_else(|_| folder_path.clone());

        if !is_path_ancestor_or_descendant(&parent_dir, &folder_canon) {
            continue;
        }

        let backup_dir = ws_dir.join("backup");
        if backup_dir.is_dir() {
            walk_all_files(&backup_dir, &mut found);
        }

        let backups_dir = ws_dir.join("Backups");
        if backups_dir.is_dir() {
            walk_all_files(&backups_dir, &mut found);
        }
    }

    found
}

fn walk_all_files(dir: &Path, found: &mut Vec<PathBuf>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_all_files(&path, found);
        } else if path.is_file() {
            found.push(path);
        }
    }
}

fn check_git_history(path: &Path) -> Option<String> {
    let mut current = path.parent()?;
    let git_root = loop {
        if current.join(".git").exists() {
            break current;
        }
        current = current.parent()?;
    };

    let output = std::process::Command::new("git")
        .arg("-C")
        .arg(git_root)
        .args(["log", "--all", "--oneline", "--"])
        .arg(path)
        .output()
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        return None;
    }

    let commit_count = stdout.trim().lines().count();
    Some(format!(
        "\"{}\" appears in {} git commit(s) in repository at {}.",
        path.file_name()?.to_string_lossy(),
        commit_count,
        git_root.display()
    ))
}

fn check_shell_history(file_name: &str) -> Vec<String> {
    let mut warnings = Vec::new();

    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return warnings,
    };

    let history_files = [
        (home.join(".bash_history"), "bash history (~/.bash_history)"),
        (home.join(".zsh_history"), "zsh history (~/.zsh_history)"),
        (
            home.join(".local/share/fish/fish_history"),
            "fish history (~/.local/share/fish/fish_history)",
        ),
    ];

    for (history_path, label) in &history_files {
        if !history_path.exists() {
            continue;
        }

        let content = match std::fs::read_to_string(history_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if content.contains(file_name) {
            warnings.push(format!(
                "\"{}\" found in {}. Consider editing the history file to remove references.",
                file_name, label
            ));
        }
    }

    warnings
}

/// avoid false positives from substring matching (/foo/bar vs /foo/barbaz)
fn is_path_ancestor_or_descendant(a: &Path, b: &Path) -> bool {
    #[cfg(target_os = "macos")]
    {
        let a_lower = PathBuf::from(a.to_string_lossy().to_ascii_lowercase());
        let b_lower = PathBuf::from(b.to_string_lossy().to_ascii_lowercase());
        a_lower.starts_with(&b_lower) || b_lower.starts_with(&a_lower)
    }

    #[cfg(not(target_os = "macos"))]
    {
        a.starts_with(b) || b.starts_with(a)
    }
}

fn paths_match(a: &str, b: &str) -> bool {
    let to_path = |s: &str| -> PathBuf {
        let decoded = url_decode(s);
        PathBuf::from(decoded.replace('\\', "/"))
    };

    let path_a = to_path(a);
    let path_b = to_path(b);

    let canon_a = path_a.canonicalize().unwrap_or_else(|_| path_a.clone());
    let canon_b = path_b.canonicalize().unwrap_or_else(|_| path_b.clone());

    if canon_a == canon_b {
        return true;
    }

    #[cfg(target_os = "macos")]
    {
        return canon_a
            .to_string_lossy()
            .eq_ignore_ascii_case(&canon_b.to_string_lossy());
    }

    #[cfg(not(target_os = "macos"))]
    false
}

fn url_decode(s: &str) -> String {
    let mut bytes = Vec::with_capacity(s.len());
    let mut iter = s.as_bytes().iter();
    while let Some(&b) = iter.next() {
        if b == b'%' {
            let hi = iter.next().copied();
            let lo = iter.next().copied();
            if let (Some(hi), Some(lo)) = (hi, lo) {
                if let (Some(h), Some(l)) = (hex_val(hi), hex_val(lo)) {
                    bytes.push(h * 16 + l);
                    continue;
                }
                bytes.push(b'%');
                bytes.push(hi);
                bytes.push(lo);
            } else {
                bytes.push(b'%');
            }
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8(bytes).unwrap_or_else(|_| s.to_string())
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}
