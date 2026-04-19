# === FILE: backend/app/core/config.py ===

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    supabase_service_role_key: str = ""
    gemini_api_key: str
    groq_api_key: str = ""

    backend_port: int = 8000
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "chrome-extension://*",
    ]

    # Auth
    auth_enabled: bool = False
    google_client_id: str = ""
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expiry_hours: int = 72

    redis_url: str = ""

    # LLM
    gemini_model: str = "gemini-2.5-flash"
    groq_model: str = "llama-3.3-70b-versatile"

    # Embeddings
    similarity_threshold: float = 0.65
    embedding_dim: int = 768

    # Canvas layout
    card_w: int = 360
    card_h: int = 240
    card_gap: int = 60

    # Confidence thresholds
    route_confidence: float = 0.75
    duplicate_threshold: float = 0.92
    missing_edge_threshold: float = 0.80

    # Sync
    max_version_gap: int = 50
    ops_retention: int = 200

    # Streaming
    stream_delay: float = 0.02

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()