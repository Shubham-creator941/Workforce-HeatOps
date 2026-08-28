"""Validated service configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings sourced from environment variables."""

    model_config = SettingsConfigDict(env_prefix="DECISION_ENGINE_", extra="ignore")
    service_version: str = "0.4.0"


settings = Settings()
