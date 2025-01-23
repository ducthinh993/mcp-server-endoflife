import pytest
from datetime import datetime
from mcp_server_endoflife.types import EOLCycle, CachedQuery
from mcp_server_endoflife.server import EOLServer

def test_eol_cycle():
    cycle = EOLCycle(
        cycle="3.8",
        releaseDate="2019-10-14",
        eol="2024-10",
        latest="3.8.18"
    )
    assert cycle.cycle == "3.8"
    assert cycle.eol == "2024-10"

def test_cached_query():
    cycle = EOLCycle(
        cycle="3.8",
        releaseDate="2019-10-14",
        eol="2024-10",
        latest="3.8.18"
    )
    query = CachedQuery(
        product="python",
        version="3.8",
        response=[cycle],
        timestamp=datetime.now()
    )
    assert query.product == "python"
    assert len(query.response) == 1