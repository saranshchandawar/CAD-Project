from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    app_name: str = 'CloudVault'
    database_url: str = 'sqlite:///./data/cloudvault.db'
    storage_provider: str = 'local'
    local_storage_path: str = './data/blobs'
    frontend_origin: str = 'http://127.0.0.1:5173'
    public_api_url: str = 'http://127.0.0.1:8000'
    max_upload_mb: int = Field(default=25, ge=1, le=1024)
    session_hours: int = Field(default=24, ge=1, le=168)
    cookie_secure: bool = False


settings = Settings()
