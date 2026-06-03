# std library
import os

# third party imports
from dotenv import load_dotenv

load_dotenv(".env")

# % of 200 (ok) requests are logged in base middleware
LOG_OKAY_REQUESTS_RATE_MIDDLEWARE = 1.0

# True if environment is dev
IS_DEV = os.getenv("ENVIRONMENT") == "DEVELOPMENT"

# True if environment is staging
IS_STAGING = os.getenv("ENVIRONMENT") == "STAGING"

# Default values for a user in development environment (set via env vars)
DEFAULT_TEST_USER_EMAIL = os.getenv("TEST_USER_EMAIL")
DEFAULT_TEST_USER_PASSWORD = os.getenv("TEST_USER_PASSWORD")

AES_SEED = os.getenv("RANDOM_AES_SEED")
if not AES_SEED:
    raise RuntimeError("RANDOM_AES_SEED environment variable must be set")

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:1420, http://localhost:3001").split(",")
    if origin.strip()
]
