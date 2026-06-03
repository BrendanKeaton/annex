use serde::{Deserialize, Serialize};
use time::OffsetDateTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Ended,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionHistory {
    pub id: String,
    pub status: SessionStatus,
    #[serde(with = "time::serde::rfc3339")]
    pub started_at: OffsetDateTime,
    #[serde(default, with = "time::serde::rfc3339::option")]
    pub ended_at: Option<OffsetDateTime>,
    pub file_count: u64,
    pub est_encryption_time_ms: u64,
    pub actual_encryption_time_ms: u64,
    pub total_size_enc_kb: Option<u64>,
    pub failure_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtectedPath {
    pub path: String,
    pub file_type: Option<String>,
    pub file_size: u64,
    #[serde(with = "time::serde::rfc3339")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileType {
    // Documents
    Csv,
    Xlsx,
    Xls,
    Pdf,
    Doc,
    Docx,
    Txt,
    Rtf,
    // Images
    Png,
    Jpg,
    Jpeg,
    Gif,
    Svg,
    Bmp,
    Webp,
    Tiff,
    Ico,
    Heic,
    // Video
    Mp4,
    Mov,
    Avi,
    Mkv,
    Wmv,
    // Audio
    Mp3,
    Wav,
    Flac,
    Aac,
    Ogg,
    // Archives
    Zip,
    Tar,
    Gz,
    Rar,
    #[serde(rename = "7z")]
    SevenZ,
    // Code / Config
    Json,
    Xml,
    Html,
    Css,
    Js,
    Ts,
    Py,
    Rs,
    Go,
    Java,
    Cpp,
    C,
    H,
    Md,
    Yaml,
    Toml,
    Sql,
    // Presentations
    Ppt,
    Pptx,
    // Executables / System
    Exe,
    Dll,
    So,
    Dylib,
    Dmg,
    Msi,
    Deb,
    Rpm,
    // Catch-all
    Unknown,
}

impl FileType {
    pub fn from_extension(ext: &str) -> FileType {
        match ext.to_lowercase().as_str() {
            "csv" => FileType::Csv,
            "xlsx" => FileType::Xlsx,
            "xls" => FileType::Xls,
            "pdf" => FileType::Pdf,
            "doc" => FileType::Doc,
            "docx" => FileType::Docx,
            "txt" => FileType::Txt,
            "rtf" => FileType::Rtf,
            "png" => FileType::Png,
            "jpg" => FileType::Jpg,
            "jpeg" => FileType::Jpeg,
            "gif" => FileType::Gif,
            "svg" => FileType::Svg,
            "bmp" => FileType::Bmp,
            "webp" => FileType::Webp,
            "tiff" | "tif" => FileType::Tiff,
            "ico" => FileType::Ico,
            "heic" | "heif" => FileType::Heic,
            "mp4" => FileType::Mp4,
            "mov" => FileType::Mov,
            "avi" => FileType::Avi,
            "mkv" => FileType::Mkv,
            "wmv" => FileType::Wmv,
            "mp3" => FileType::Mp3,
            "wav" => FileType::Wav,
            "flac" => FileType::Flac,
            "aac" => FileType::Aac,
            "ogg" => FileType::Ogg,
            "zip" => FileType::Zip,
            "tar" => FileType::Tar,
            "gz" => FileType::Gz,
            "rar" => FileType::Rar,
            "7z" => FileType::SevenZ,
            "json" => FileType::Json,
            "xml" => FileType::Xml,
            "html" | "htm" => FileType::Html,
            "css" => FileType::Css,
            "js" | "jsx" | "mjs" | "cjs" => FileType::Js,
            "ts" | "tsx" => FileType::Ts,
            "py" => FileType::Py,
            "rs" => FileType::Rs,
            "go" => FileType::Go,
            "java" => FileType::Java,
            "cpp" | "cc" | "cxx" => FileType::Cpp,
            "c" => FileType::C,
            "h" | "hpp" => FileType::H,
            "md" | "markdown" => FileType::Md,
            "yaml" | "yml" => FileType::Yaml,
            "toml" => FileType::Toml,
            "sql" => FileType::Sql,
            "ppt" => FileType::Ppt,
            "pptx" => FileType::Pptx,
            "exe" => FileType::Exe,
            "dll" => FileType::Dll,
            "so" => FileType::So,
            "dylib" => FileType::Dylib,
            "dmg" => FileType::Dmg,
            "msi" => FileType::Msi,
            "deb" => FileType::Deb,
            "rpm" => FileType::Rpm,
            _ => FileType::Unknown,
        }
    }

    pub fn as_str(&self) -> &str {
        match self {
            FileType::Csv => "csv",
            FileType::Xlsx => "xlsx",
            FileType::Xls => "xls",
            FileType::Pdf => "pdf",
            FileType::Doc => "doc",
            FileType::Docx => "docx",
            FileType::Txt => "txt",
            FileType::Rtf => "rtf",
            FileType::Png => "png",
            FileType::Jpg => "jpg",
            FileType::Jpeg => "jpeg",
            FileType::Gif => "gif",
            FileType::Svg => "svg",
            FileType::Bmp => "bmp",
            FileType::Webp => "webp",
            FileType::Tiff => "tiff",
            FileType::Ico => "ico",
            FileType::Heic => "heic",
            FileType::Mp4 => "mp4",
            FileType::Mov => "mov",
            FileType::Avi => "avi",
            FileType::Mkv => "mkv",
            FileType::Wmv => "wmv",
            FileType::Mp3 => "mp3",
            FileType::Wav => "wav",
            FileType::Flac => "flac",
            FileType::Aac => "aac",
            FileType::Ogg => "ogg",
            FileType::Zip => "zip",
            FileType::Tar => "tar",
            FileType::Gz => "gz",
            FileType::Rar => "rar",
            FileType::SevenZ => "7z",
            FileType::Json => "json",
            FileType::Xml => "xml",
            FileType::Html => "html",
            FileType::Css => "css",
            FileType::Js => "js",
            FileType::Ts => "ts",
            FileType::Py => "py",
            FileType::Rs => "rs",
            FileType::Go => "go",
            FileType::Java => "java",
            FileType::Cpp => "cpp",
            FileType::C => "c",
            FileType::H => "h",
            FileType::Md => "md",
            FileType::Yaml => "yaml",
            FileType::Toml => "toml",
            FileType::Sql => "sql",
            FileType::Ppt => "ppt",
            FileType::Pptx => "pptx",
            FileType::Exe => "exe",
            FileType::Dll => "dll",
            FileType::So => "so",
            FileType::Dylib => "dylib",
            FileType::Dmg => "dmg",
            FileType::Msi => "msi",
            FileType::Deb => "deb",
            FileType::Rpm => "rpm",
            FileType::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedFile {
    pub path: String,
    pub file_size: u64,
    pub file_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub files: Vec<ScannedFile>,
    pub total_count: usize,
}
