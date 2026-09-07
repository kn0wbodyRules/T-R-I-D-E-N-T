FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# libgomp1: OpenMP runtime that the opencv and torch wheels link against.
# No CUDA base image — the cu128 torch wheels ship their own CUDA runtime as pip
# dependencies, so the container only needs the driver the NVIDIA container
# toolkit exposes.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements-ml.txt

# Deliberately after the pip layer. rasterio's wheel bundles GDAL, but that GDAL
# still dlopens the system libexpat, so `import rasterio` dies without it — easy
# to not expect given the bundled-GDAL story. Kept in its own layer because
# editing the apt line above invalidates the multi-GB torch install below it,
# turning a seconds-long rebuild into a fifteen-minute one.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libexpat1 \
    && rm -rf /var/lib/apt/lists/*

COPY app ./app

# Runs one-off training/inference jobs via `docker compose run`, not a server.
CMD ["python", "-c", "print('Run: docker compose run --rm ml python -m app.cli --help')"]
