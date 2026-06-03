import pytest
from pydantic import ValidationError

from app.auth.models import (
    LoginRequest,
    PinSetRequest,
    PinResetRequest,
    PinCheckRequest,
    AcceptInviteRequest,
)
from app.account.models import UpdateEmailRequest, UpdatePasswordRequest
from app.sessions.models import StartSessionMetadata, ReportEncryptedFile
from app.org.models import InviteRequest


class TestLoginRequest:
    def test_valid(self):
        req = LoginRequest(email="user@example.com", password="Secret01!")
        assert req.email == "user@example.com"

    def test_missing_email(self):
        with pytest.raises(ValidationError):
            LoginRequest(password="Secret01!")

    def test_missing_password(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="user@example.com")

    def test_password_too_long(self):
        with pytest.raises(ValidationError):
            LoginRequest(email="user@example.com", password="x" * 129)


class TestPinModels:
    def test_pin_set_valid(self):
        req = PinSetRequest(pin="123456")
        assert req.pin == "123456"

    def test_pin_set_rejects_non_digits(self):
        with pytest.raises(ValidationError):
            PinSetRequest(pin="abcdef")

    def test_pin_set_rejects_short(self):
        with pytest.raises(ValidationError):
            PinSetRequest(pin="123")

    def test_pin_set_rejects_long(self):
        with pytest.raises(ValidationError):
            PinSetRequest(pin="1234567")

    def test_pin_check_valid(self):
        req = PinCheckRequest(pin="123456")
        assert req.pin == "123456"

    def test_pin_reset_valid(self):
        req = PinResetRequest(current_pin="123456", new_pin="654321")
        assert req.new_pin == "654321"

    def test_pin_reset_rejects_bad_new_pin(self):
        with pytest.raises(ValidationError):
            PinResetRequest(current_pin="123456", new_pin="abc")


class TestAcceptInviteRequest:
    def test_valid(self):
        req = AcceptInviteRequest(
            access_token="tok", refresh_token="ref", new_password="Str0ngPass!"
        )
        assert req.new_password == "Str0ngPass!"

    def test_password_too_short(self):
        with pytest.raises(ValidationError):
            AcceptInviteRequest(
                access_token="tok", refresh_token="ref", new_password="short"
            )


class TestAccountModels:
    def test_update_email_valid(self):
        req = UpdateEmailRequest(new_email="new@example.com", pin="123456")
        assert req.new_email == "new@example.com"

    def test_update_password_too_short(self):
        with pytest.raises(ValidationError):
            UpdatePasswordRequest(new_password="short")

    def test_update_password_valid(self):
        req = UpdatePasswordRequest(new_password="NewStr0ng!", pin="123456")
        assert req.new_password == "NewStr0ng!"


class TestSessionModels:
    def test_start_session_metadata(self):
        req = StartSessionMetadata(
            file_count=10, total_size_bytes=1024000, estimated_time_ms=500
        )
        assert req.file_count == 10

    def test_report_encrypted_file(self):
        req = ReportEncryptedFile(
            session_id="abc123",
            original_path="/home/user/file.txt",
            encrypted_filename="enc_file.dat",
            checksum_sha256="a" * 64,
            status="encrypted",
        )
        assert req.format_version is None


class TestInviteRequest:
    def test_valid(self):
        req = InviteRequest(email="invite@example.com")
        assert req.email == "invite@example.com"

    def test_email_too_long(self):
        with pytest.raises(ValidationError):
            InviteRequest(email="x" * 321)
