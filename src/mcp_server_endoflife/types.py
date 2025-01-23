from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

@dataclass
class EOLCycle:
    """End-of-life cycle information."""
    cycle: str
    releaseDate: str
    eol: str
    latest: str
    lts: Optional[str] = None
    support: Optional[str] = None
    discontinued: Optional[str] = None

@dataclass
class CachedQuery:
    """Cached query information."""
    product: str
    version: Optional[str]
    response: List[EOLCycle]
    timestamp: datetime