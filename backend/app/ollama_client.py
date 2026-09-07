import httpx

from app.config import get_settings


async def list_models() -> list[str]:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.get(f"{settings.ollama_host}/api/tags")
        response.raise_for_status()
        return [model["name"] for model in response.json().get("models", [])]
