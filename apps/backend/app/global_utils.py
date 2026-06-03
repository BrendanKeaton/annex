# std library
import datetime
from enum import Enum


class Region(str, Enum):
    AMERICAS = "AMERICAS"
    EMEA = "EMEA"
    APAC = "APAC"


def utc_now_iso():
    return datetime.datetime.now(datetime.timezone.utc).isoformat() + "Z"
