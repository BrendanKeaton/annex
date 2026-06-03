import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import AES_SEED

_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(AES_SEED.encode()).digest()))


def encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet.decrypt(value.encode()).decode()
