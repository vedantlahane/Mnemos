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

    # LLM
    gemini_model: str = "gemini-2.5-flash"
    groq_model: str = "llama-3.3-70b-versatile"

    # Embeddings
    similarity_threshold: float = 0.65
    embedding_dimensions: int = 768

    # Canvas layout
    sheet_width: int = 850
    sheet_margin: int = 50
    card_width: int = 360
    card_height: int = 240
    min_gap: int = 60
    block_gap: int = 40
    section_gap: int = 80
    height_buffer: float = 1.15  # 15% safety margin on text measurement

    # Page routing
    page_route_confidence_threshold: float = 0.75

    # Curator
    curator_duplicate_threshold: float = 0.92
    curator_missing_edge_threshold: float = 0.80
    curator_stale_days: int = 30
    curator_max_comparison: int = 200

    # Streaming
    stream_chunk_delay: float = 0.02

    # Sync
    sync_max_version_gap: int = 50
    ops_retention_count: int = 200

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()