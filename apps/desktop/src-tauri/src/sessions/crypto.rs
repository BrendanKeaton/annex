use aead::stream::{DecryptorBE32, EncryptorBE32};
use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use rand::Rng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use zeroize::{Zeroize, Zeroizing};

const CHUNK_SIZE: usize = 4 * 1024 * 1024; // 4 MB
const FORMAT_VERSION_STREAMED: u8 = 2;

pub fn hex_decode(input: &str) -> Result<Zeroizing<Vec<u8>>, String> {
    if input.len() % 2 != 0 {
        return Err("Invalid hex string: odd length".to_string());
    }
    let bytes: Vec<u8> = (0..input.len())
        .step_by(2)
        .map(|i| {
            u8::from_str_radix(&input[i..i + 2], 16)
                .map_err(|_| "Invalid hex character in AES key".to_string())
        })
        .collect::<Result<Vec<u8>, String>>()?;
    Ok(Zeroizing::new(bytes))
}

pub fn generate_random_filename() -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::rngs::OsRng;
    (0..8)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

pub fn encrypt_file(
    source_path: &Path,
    key: &[u8; 32],
) -> Result<(PathBuf, String, Option<u8>), String> {
    let file_len = std::fs::metadata(source_path)
        .map_err(|e| format!("Failed to stat {}: {}", source_path.display(), e))?
        .len();

    if file_len > CHUNK_SIZE as u64 {
        let (path, checksum) = encrypt_file_streamed(source_path, key)?;
        return Ok((path, checksum, Some(FORMAT_VERSION_STREAMED)));
    }

    let plaintext = std::fs::read(source_path)
        .map_err(|e| format!("Failed to read {}: {}", source_path.display(), e))?;

    let checksum = format!("{:x}", Sha256::digest(&plaintext));

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Invalid AES key: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|e| format!("Encryption failed for {}: {}", source_path.display(), e))?;

    let parent = source_path
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", source_path.display()))?;
    let random_name = generate_random_filename();
    let dest_path = parent.join(format!("{}.annex", random_name));

    let mut output = Vec::with_capacity(12 + ciphertext.len());
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);

    std::fs::write(&dest_path, &output)
        .map_err(|e| format!("Failed to write {}: {}", dest_path.display(), e))?;

    Ok((dest_path, checksum, None))
}

fn encrypt_file_streamed(source_path: &Path, key: &[u8; 32]) -> Result<(PathBuf, String), String> {
    let file = std::fs::File::open(source_path)
        .map_err(|e| format!("Failed to open {}: {}", source_path.display(), e))?;
    let mut reader = BufReader::with_capacity(CHUNK_SIZE, file);

    let mut nonce_bytes = [0u8; 7];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Invalid AES key: {}", e))?;
    let mut encryptor = EncryptorBE32::from_aead(cipher, &nonce_bytes.into());

    let parent = source_path
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", source_path.display()))?;
    let random_name = generate_random_filename();
    let dest_path = parent.join(format!("{}.annex", random_name));

    let dest_file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create {}: {}", dest_path.display(), e))?;
    let mut writer = BufWriter::with_capacity(CHUNK_SIZE + 16, dest_file);

    writer
        .write_all(&[FORMAT_VERSION_STREAMED])
        .map_err(|e| format!("Write header failed: {}", e))?;
    writer
        .write_all(&nonce_bytes)
        .map_err(|e| format!("Write nonce failed: {}", e))?;
    writer
        .write_all(&(CHUNK_SIZE as u32).to_be_bytes())
        .map_err(|e| format!("Write chunk size failed: {}", e))?;

    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; CHUNK_SIZE];

    loop {
        let bytes_read = read_fill(&mut reader, &mut buf)
            .map_err(|e| format!("Read failed for {}: {}", source_path.display(), e))?;

        if bytes_read == 0 {
            // Empty file or exact multiple of chunk size — encrypt empty last block
            let encrypted = encryptor
                .encrypt_last(&b""[..])
                .map_err(|_| format!("Final encryption failed for {}", source_path.display()))?;
            writer
                .write_all(&encrypted)
                .map_err(|e| format!("Write failed: {}", e))?;
            break;
        }

        hasher.update(&buf[..bytes_read]);

        if bytes_read == CHUNK_SIZE {
            let next_byte = {
                let inner_buf = reader
                    .fill_buf()
                    .map_err(|e| format!("Peek failed: {}", e))?;
                !inner_buf.is_empty()
            };

            if next_byte {
                let encrypted = encryptor
                    .encrypt_next(&buf[..])
                    .map_err(|_| format!("Encryption failed for {}", source_path.display()))?;
                writer
                    .write_all(&encrypted)
                    .map_err(|e| format!("Write failed: {}", e))?;
            } else {
                let encrypted = encryptor.encrypt_last(&buf[..bytes_read]).map_err(|_| {
                    format!("Final encryption failed for {}", source_path.display())
                })?;
                writer
                    .write_all(&encrypted)
                    .map_err(|e| format!("Write failed: {}", e))?;
                break;
            }
        } else {
            let encrypted = encryptor
                .encrypt_last(&buf[..bytes_read])
                .map_err(|_| format!("Final encryption failed for {}", source_path.display()))?;
            writer
                .write_all(&encrypted)
                .map_err(|e| format!("Write failed: {}", e))?;
            break;
        }
    }

    writer.flush().map_err(|e| format!("Flush failed: {}", e))?;

    buf.zeroize();

    let checksum = format!("{:x}", hasher.finalize());
    Ok((dest_path, checksum))
}

fn read_fill(reader: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut total = 0;
    while total < buf.len() {
        match reader.read(&mut buf[total..])? {
            0 => break,
            n => total += n,
        }
    }
    Ok(total)
}

pub fn decrypt_file(
    original_path: &Path,
    encrypted_filename: &str,
    expected_checksum: &str,
    key: &[u8; 32],
) -> Result<(), String> {
    let encrypted_path = original_path
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", original_path.display()))?
        .join(encrypted_filename);

    let data = std::fs::read(&encrypted_path)
        .map_err(|e| format!("Failed to read {}: {}", encrypted_path.display(), e))?;

    if data.len() < 12 {
        return Err(format!(
            "Encrypted file too short: {}",
            encrypted_path.display()
        ));
    }

    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Invalid AES key: {}", e))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption failed for {}: {}", encrypted_path.display(), e))?;

    let checksum = format!("{:x}", Sha256::digest(&plaintext));
    if checksum != expected_checksum {
        return Err(format!(
            "Checksum mismatch for {}: expected {}, got {}",
            original_path.display(),
            expected_checksum,
            checksum
        ));
    }

    std::fs::write(original_path, &plaintext)
        .map_err(|e| format!("Failed to write {}: {}", original_path.display(), e))?;

    std::fs::remove_file(&encrypted_path)
        .map_err(|e| format!("Failed to remove {}: {}", encrypted_path.display(), e))?;

    Ok(())
}

pub fn decrypt_file_auto(
    original_path: &Path,
    encrypted_filename: &str,
    expected_checksum: &str,
    key: &[u8; 32],
    format_version: Option<u8>,
) -> Result<(), String> {
    match format_version {
        Some(2) => decrypt_file_streamed(original_path, encrypted_filename, expected_checksum, key),
        _ => decrypt_file(original_path, encrypted_filename, expected_checksum, key),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp_file(dir: &std::path::Path, name: &str, content: &[u8]) -> PathBuf {
        let path = dir.join(name);
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(content).unwrap();
        path
    }

    fn roundtrip(content: Vec<u8>) {
        let dir = tempfile::tempdir().unwrap();
        let original = write_temp_file(dir.path(), "secret.bin", &content);
        let key = [42u8; 32];

        let (encrypted_path, checksum, version) = encrypt_file(&original, &key).unwrap();
        let encrypted_name = encrypted_path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();

        // Source should still exist after encryption (encryption only writes the ciphertext file).
        // We delete it manually here so decrypt has a clean slate.
        std::fs::remove_file(&original).unwrap();

        decrypt_file_auto(&original, &encrypted_name, &checksum, &key, version).unwrap();

        let restored = std::fs::read(&original).unwrap();
        assert_eq!(restored, content, "roundtrip content mismatch");
        // decrypt_file_auto must clean up the .annex file.
        assert!(
            !encrypted_path.exists(),
            "encrypted file was not removed after decrypt"
        );
    }

    #[test]
    fn roundtrip_small_file_uses_single_shot() {
        roundtrip(b"hello world, this is secret".to_vec());
    }

    #[test]
    fn roundtrip_large_file_uses_streamed() {
        // > CHUNK_SIZE (4 MB) forces the streamed path.
        let big = vec![0xAB; CHUNK_SIZE + 1024];
        roundtrip(big);
    }

    #[test]
    fn roundtrip_exact_chunk_boundary() {
        // Edge case: file size exactly equals chunk size — exercises the
        // "peek next byte to decide if this is the last chunk" branch.
        let edge = vec![0x7Fu8; CHUNK_SIZE];
        roundtrip(edge);
    }

    #[test]
    fn decrypt_with_wrong_key_fails() {
        let dir = tempfile::tempdir().unwrap();
        let original = write_temp_file(dir.path(), "secret.bin", b"sensitive data");
        let real_key = [1u8; 32];
        let wrong_key = [2u8; 32];

        let (encrypted_path, checksum, version) = encrypt_file(&original, &real_key).unwrap();
        let encrypted_name = encrypted_path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();
        std::fs::remove_file(&original).unwrap();

        let result = decrypt_file_auto(&original, &encrypted_name, &checksum, &wrong_key, version);
        assert!(result.is_err(), "decryption with wrong key must fail");
    }

    #[test]
    fn decrypt_detects_tampered_ciphertext() {
        let dir = tempfile::tempdir().unwrap();
        let original = write_temp_file(dir.path(), "secret.bin", b"trustworthy bytes");
        let key = [9u8; 32];

        let (encrypted_path, checksum, version) = encrypt_file(&original, &key).unwrap();
        let encrypted_name = encrypted_path
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();
        std::fs::remove_file(&original).unwrap();

        // Flip a byte in the ciphertext (after the nonce header).
        let mut bytes = std::fs::read(&encrypted_path).unwrap();
        let target = bytes.len() - 1;
        bytes[target] ^= 0xFF;
        std::fs::write(&encrypted_path, &bytes).unwrap();

        let result = decrypt_file_auto(&original, &encrypted_name, &checksum, &key, version);
        assert!(result.is_err(), "AES-GCM must reject tampered ciphertext");
    }

    #[test]
    fn hex_decode_accepts_valid() {
        let decoded = hex_decode("00ff10ab").unwrap();
        assert_eq!(decoded.as_slice(), &[0x00, 0xff, 0x10, 0xab]);
    }

    #[test]
    fn hex_decode_rejects_odd_length() {
        assert!(hex_decode("abc").is_err());
    }

    #[test]
    fn hex_decode_rejects_non_hex_chars() {
        assert!(hex_decode("zzzz").is_err());
    }
}
//
fn decrypt_file_streamed(
    original_path: &Path,
    encrypted_filename: &str,
    expected_checksum: &str,
    key: &[u8; 32],
) -> Result<(), String> {
    let encrypted_path = original_path
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", original_path.display()))?
        .join(encrypted_filename);

    let file = std::fs::File::open(&encrypted_path)
        .map_err(|e| format!("Failed to open {}: {}", encrypted_path.display(), e))?;
    let file_len = file
        .metadata()
        .map_err(|e| format!("Failed to stat {}: {}", encrypted_path.display(), e))?
        .len();
    let mut reader = BufReader::with_capacity(CHUNK_SIZE + 16, file);

    let mut header = [0u8; 12];
    reader.read_exact(&mut header).map_err(|e| {
        format!(
            "Failed to read header from {}: {}",
            encrypted_path.display(),
            e
        )
    })?;

    if header[0] != FORMAT_VERSION_STREAMED {
        return Err(format!(
            "Unknown format version {} in {}",
            header[0],
            encrypted_path.display()
        ));
    }

    let mut nonce_bytes = [0u8; 7];
    nonce_bytes.copy_from_slice(&header[1..8]);
    let chunk_size = u32::from_be_bytes([header[8], header[9], header[10], header[11]]) as usize;

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| format!("Invalid AES key: {}", e))?;
    let mut decryptor = DecryptorBE32::from_aead(cipher, &nonce_bytes.into());

    let dest_file = std::fs::File::create(original_path)
        .map_err(|e| format!("Failed to create {}: {}", original_path.display(), e))?;
    let mut writer = BufWriter::with_capacity(chunk_size, dest_file);

    let mut hasher = Sha256::new();

    let enc_chunk_size = chunk_size + 16;
    let mut buf = vec![0u8; enc_chunk_size];

    let data_len = file_len - 12;

    let full_chunks = if data_len > enc_chunk_size as u64 {
        (data_len - 1) / enc_chunk_size as u64
    } else {
        0
    };

    let mut chunks_read = 0u64;

    loop {
        let bytes_read = read_fill(&mut reader, &mut buf)
            .map_err(|e| format!("Read failed for {}: {}", encrypted_path.display(), e))?;

        if bytes_read == 0 {
            break;
        }

        if chunks_read < full_chunks {
            let plaintext = decryptor
                .decrypt_next(&buf[..bytes_read])
                .map_err(|_| format!("Decryption failed for {}", encrypted_path.display()))?;
            hasher.update(&plaintext);
            writer
                .write_all(&plaintext)
                .map_err(|e| format!("Write failed: {}", e))?;
            chunks_read += 1;
        } else {
            let plaintext = decryptor.decrypt_last(&buf[..bytes_read]).map_err(|_| {
                format!(
                    "Decryption failed (last chunk) for {}",
                    encrypted_path.display()
                )
            })?;
            hasher.update(&plaintext);
            writer
                .write_all(&plaintext)
                .map_err(|e| format!("Write failed: {}", e))?;
            break;
        }
    }

    writer.flush().map_err(|e| format!("Flush failed: {}", e))?;
    drop(writer);

    let checksum = format!("{:x}", hasher.finalize());
    if checksum != expected_checksum {
        let _ = std::fs::remove_file(original_path);
        return Err(format!(
            "Checksum mismatch for {}: expected {}, got {}",
            original_path.display(),
            expected_checksum,
            checksum
        ));
    }

    std::fs::remove_file(&encrypted_path)
        .map_err(|e| format!("Failed to remove {}: {}", encrypted_path.display(), e))?;

    Ok(())
}
