# === FILE: backend/app/config.py ===

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    gemini_api_key: str
    groq_api_key: str = ""

    backend_port: int = 8000

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "chrome-extension://*",
    ]

    auth_enabled: bool = False
    google_client_id: str = ""
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expiry_hours: int = 72

    redis_url: str = ""

    page_route_confidence_threshold: float = 0.75

    gemini_model: str = "gemini-2.5-flash"
    groq_model: str = "llama-3.3-70b-versatile"

    similarity_threshold: float = 0.65
    embedding_dimensions: int = 768

    default_card_width: int = 360
    default_card_height: int = 240
    card_spacing_x: int = 420
    card_spacing_y: int = 350
    min_element_gap: int = 80
    cluster_padding: int = 60

    curator_duplicate_threshold: float = 0.92
    curator_missing_edge_threshold: float = 0.80
    curator_stale_days: int = 30
    curator_max_comparison: int = 200

    stream_chunk_delay: float = 0.02

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()