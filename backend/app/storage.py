"""Opaque object keys keep storage paths independent of user-supplied filenames."""
from pathlib import Path
from typing import Protocol, BinaryIO, Iterator
from .config import settings


class Storage(Protocol):
    def put(self, key: str, source: BinaryIO) -> int: ...
    def read(self, key: str) -> Iterator[bytes]: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self):
        self.root = Path(settings.local_storage_path).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, key):
        if not key.isalnum():
            raise ValueError('Invalid storage key')
        return self.root / key

    def put(self, key, source):
        target = self.path(key)
        size = 0
        try:
            with target.open('xb') as output:
                while chunk := source.read(1024 * 1024):
                    size += len(chunk)
                    if size > settings.max_upload_mb * 1024 * 1024:
                        raise ValueError(f'Files must be under {settings.max_upload_mb} MB')
                    output.write(chunk)
        except Exception:
            target.unlink(missing_ok=True)
            raise
        return size

    def delete(self, key):
        self.path(key).unlink(missing_ok=True)

    def read(self, key):
        with self.path(key).open('rb') as source:
            while chunk := source.read(1024 * 1024):
                yield chunk


if settings.storage_provider != 'local':
    raise RuntimeError('Only local storage is implemented in this phase. Azure Blob adapter is pending.')
storage: Storage = LocalStorage()
