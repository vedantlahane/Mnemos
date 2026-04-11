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

    class Config:
        env_file = ".env"


settings = Settings()