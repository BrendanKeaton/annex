import secrets
import string
import re


def generate_recovery_codes(count: int = 6) -> list[str]:
    chars = string.ascii_lowercase + string.digits
    return [
        f"{''.join(secrets.choice(chars) for _ in range(4))}-{''.join(secrets.choice(chars) for _ in range(4))}"
        for _ in range(count)
    ]


class TestRecoveryCodes:
    def test_generates_six_codes(self):
        codes = generate_recovery_codes()
        assert len(codes) == 6

    def test_format_xxxx_xxxx(self):
        codes = generate_recovery_codes()
        pattern = re.compile(r"^[a-z0-9]{4}-[a-z0-9]{4}$")
        for code in codes:
            assert pattern.match(code), f"Code {code} doesn't match expected format"

    def test_codes_are_unique(self):
        codes = generate_recovery_codes()
        assert len(set(codes)) == len(codes)

    def test_custom_count(self):
        codes = generate_recovery_codes(count=10)
        assert len(codes) == 10
