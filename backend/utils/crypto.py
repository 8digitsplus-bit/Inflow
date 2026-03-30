import os
from cryptography.fernet import Fernet

_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is None:
        key = os.environ.get("ENCRYPTION_KEY")
        if key:
            _fernet = Fernet(key.encode())
    return _fernet


def encrypt(value: str) -> str:
    f = _get_fernet()
    if not f or not value:
        return value
    return f.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    f = _get_fernet()
    if not f or not value:
        return value
    try:
        return f.decrypt(value.encode()).decode()
    except Exception:
        return value
