# std library
import logging
import logging.config
from pathlib import Path

import yaml

with open(Path(__file__).parent / "config.yaml", "r") as f:
    config = yaml.safe_load(f.read())
    logging.config.dictConfig(config)

logger = logging.getLogger("annex")
