import hashlib


def derive_aes_key(seed: str, random_seed: str, utc_date: str, daily_session_count: int) -> str:
    return hashlib.sha256(
        f"{seed}:{random_seed}:{utc_date}:{daily_session_count}".encode()
    ).hexdigest()


class TestAESKeyDerivation:
    def test_deterministic(self):
        key1 = derive_aes_key("seed", "rand", "2026-01-01", 1)
        key2 = derive_aes_key("seed", "rand", "2026-01-01", 1)
        assert key1 == key2

    def test_different_seed_different_key(self):
        key1 = derive_aes_key("seed_a", "rand", "2026-01-01", 1)
        key2 = derive_aes_key("seed_b", "rand", "2026-01-01", 1)
        assert key1 != key2

    def test_different_random_seed_different_key(self):
        key1 = derive_aes_key("seed", "rand_a", "2026-01-01", 1)
        key2 = derive_aes_key("seed", "rand_b", "2026-01-01", 1)
        assert key1 != key2

    def test_different_date_different_key(self):
        key1 = derive_aes_key("seed", "rand", "2026-01-01", 1)
        key2 = derive_aes_key("seed", "rand", "2026-01-02", 1)
        assert key1 != key2

    def test_different_session_count_different_key(self):
        key1 = derive_aes_key("seed", "rand", "2026-01-01", 1)
        key2 = derive_aes_key("seed", "rand", "2026-01-01", 2)
        assert key1 != key2

    def test_output_is_64_hex_chars(self):
        key = derive_aes_key("seed", "rand", "2026-01-01", 1)
        assert len(key) == 64
        assert all(c in "0123456789abcdef" for c in key)
