from pydantic_settings import BaseSettings


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

    # Auth
    auth_enabled: bool = False
    google_client_id: str = ""
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_expiry_hours: int = 72

    # Canvas defaults
    canvas_width: int = 2000
    canvas_height: int = 1500

    # Redis (optional — leave empty to disable caching)
    redis_url: str = ""

    # Routing
    page_route_confidence_threshold: float = 0.75

    # LLM models
    gemini_model: str = "gemini-2.5-flash"
    groq_model: str = "llama-3.3-70b-versatile"

    # Processing
    similarity_threshold: float = 0.65
    embedding_dimensions: int = 768

    class Config:
        env_file = ".env"


settings = Settings()