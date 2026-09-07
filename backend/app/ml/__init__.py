"""Segmentation model: SAR scene in, geocoded oil-slick polygons out.

Deliberately imports nothing heavy at package level. The dependencies here
(torch, rasterio, cv2) are installed only in the `ml` image, so `app.cli` -- which
the `fastapi` image also loads -- imports these modules lazily inside the command
bodies that need them.
"""

import logging
import os
import sys


def configure_logging() -> None:
    """Send ML progress to stdout.

    Without this a training run emits nothing for hours: the library configures
    loggers but never a handler, so every logger.info is silently discarded and
    the only sign of life is checkpoint files appearing on disk.
    """
    level = os.environ.get("LOG_LEVEL", "info").upper()
    root = logging.getLogger()
    if any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)-5s %(message)s", "%H:%M:%S")
    )
    root.addHandler(handler)
    root.setLevel(getattr(logging, level, logging.INFO))
