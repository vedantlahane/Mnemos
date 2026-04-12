from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    gemini_api_key: str
    backend_port: int = 8000

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "chrome-extension://*",
    ]

    # Canvas defaults
    canvas_width: int = 2000
    canvas_height: int = 1500

    # Routing
    page_route_confidence_threshold: float = 0.75

    class Config:
        env_file = ".env"


settings = Settings()