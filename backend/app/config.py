from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://sih_admin:changeme@postgres:5432/oilspill"
    ollama_host: str = "http://ollama:11434"
    ollama_model: str = "llama3.2:3b"
    app_env: str = "development"
    log_level: str = "info"

    # Where downloaded scenes and datasets land. Mounted from ./data on the host,
    # so the multi-GB rasters never enter the image or the database.
    data_dir: str = "/data"

    # --- Segmentation model (Stage 3) ---
    ml_checkpoint_dir: str = "/data/ml/checkpoints"
    ml_tile_size: int = 256
    # Inference only. Training tiles are cut without overlap; the overlap exists
    # so sliding-window inference can discard each tile's edge band, where
    # predictions are worst for lack of surrounding context.
    ml_tile_overlap: int = 32

    # --- External data sources ---
    # All optional: the schema, seeding and offline loaders work without them, so
    # a missing credential fails only the specific connector that needs it
    # rather than blocking the app from starting.
    # CDSE's OData download API authenticates via the Resource Owner Password
    # grant against the public "cdse-public" client, not client_credentials --
    # a client_credentials token is only valid for Sentinel Hub/openEO and
    # 401s on the bulk-download endpoint despite being issued successfully,
    # which is what a client_credentials OAuth client actually gives you.
    cdse_username: str = ""
    cdse_password: str = ""
    aisstream_api_key: str = ""
    aishub_username: str = ""
    cmems_username: str = ""
    cmems_password: str = ""
    cds_api_key: str = ""
    # NOAA/EOG VIIRS Boat Detection: a real, free account is genuinely
    # required (register at eogdata.mines.edu/products/register/) -- found
    # directly, not assumed: the "final/open access" data's Creative Commons
    # licensing describes usage rights, not an unauthenticated access path.
    # Direct directory browsing redirects to an OAuth login even for that
    # tier. Token exchange is Resource Owner Password grant, same shape as
    # CDSE's above.
    eog_username: str = ""
    eog_password: str = ""

    def missing_credentials(self) -> list[str]:
        """Which external sources are unconfigured, for the readiness report."""
        pairs = {
            "cdse": [self.cdse_username, self.cdse_password],
            "aisstream": [self.aisstream_api_key],
            "aishub": [self.aishub_username],
            "cmems": [self.cmems_username, self.cmems_password],
            "cds_era5": [self.cds_api_key],
            "eog_viirs": [self.eog_username, self.eog_password],
        }
        return sorted(name for name, values in pairs.items() if not all(values))


@lru_cache
def get_settings() -> Settings:
    return Settings()
