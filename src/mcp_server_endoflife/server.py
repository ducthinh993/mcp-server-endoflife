#!/usr/bin/env python3
import json
import logging
from datetime import datetime
from typing import Sequence

import requests
from mcp.server import Server
from mcp.types import Resource, Tool, TextContent, Implementation, ServerOptions

from .types import EOLCycle, CachedQuery

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("endoflife-server")

# API configuration
API_CONFIG = {
    'BASE_URL': 'https://endoflife.date/api',
    'MAX_CACHED_QUERIES': 5,
    'ENDPOINTS': {
        'ALL_PRODUCTS': '/all.json'
    }
}

class EOLServer:
    def __init__(self):
        # Create server instance with proper initialization
        server_info = Implementation(
            name="mcp-server-endoflife",
            version="0.1.0"
        )

        options = ServerOptions(
            capabilities={
                "resources": True,
                "tools": True,
                "prompts": False
            }
        )

        self.app = Server(server_info, options)

        # Configure HTTP client
        self.http = requests.Session()
        self.http.headers.update({
            'accept': 'application/json',
            'content-type': 'application/json'
        })

        # Initialize state
        self.available_products = []
        self.recent_queries = []

        # Register handlers
        self.setup_handlers()
        self.load_available_products()

    def setup_handlers(self):
        @self.app.list_resources()
        async def list_resources() -> list[Resource]:
            """List available resources."""
            return [
                Resource(
                    uri=f"eol://queries/{i}",
                    name=f"Recent query: {q.product}{' v' + q.version if q.version else ''}",
                    mimeType="application/json",
                    description=f"EOL status for {q.product} ({q.timestamp})"
                )
                for i, q in enumerate(self.recent_queries)
            ]

        @self.app.list_tools()
        async def list_tools() -> list[Tool]:
            """List available tools."""
            return [
                Tool(
                    name="check_version",
                    description="Check EOL status for software versions",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "product": {
                                "type": "string",
                                "description": "Software product name (e.g., python, nodejs, ubuntu)"
                            },
                            "version": {
                                "type": "string",
                                "description": "Specific version to check"
                            }
                        },
                        "required": ["product"]
                    }
                )
            ]

        @self.app.call_tool()
        async def call_tool(name: str, arguments: dict) -> Sequence[TextContent]:
            """Handle tool execution."""
            if name == "check_version":
                return await self.handle_check_version(arguments)

            raise ValueError(f"Unknown tool: {name}")

    async def handle_check_version(self, args: dict) -> Sequence[TextContent]:
        """Handle version check requests."""
        product = args.get("product")
        version = args.get("version")

        if not product:
            return [TextContent(
                type="text",
                text="Product name is required"
            )]

        if product not in self.available_products:
            return [TextContent(
                type="text",
                text=f"Invalid product: {product}. Use list_products tool to see available products."
            )]

        try:
            response = self.http.get(f"{API_CONFIG['BASE_URL']}/{product}.json")
            response.raise_for_status()
            cycles = [EOLCycle(**c) for c in response.json()]

            filtered_cycles = [
                c for c in cycles
                if not version or c.cycle.startswith(version)
            ]

            self.recent_queries.insert(0, CachedQuery(
                product=product,
                version=version,
                response=filtered_cycles,
                timestamp=datetime.now()
            ))

            if len(self.recent_queries) > API_CONFIG['MAX_CACHED_QUERIES']:
                self.recent_queries.pop()

            return [TextContent(
                type="text",
                text=json.dumps([vars(c) for c in filtered_cycles], indent=2)
            )]

        except requests.RequestException as e:
            logger.error(f"API error for {product}: {e}")
            return [TextContent(
                type="text",
                text=f"API error: {str(e)}"
            )]

    def load_available_products(self):
        """Load list of available products."""
        try:
            response = self.http.get(f"{API_CONFIG['BASE_URL']}/all.json")
            response.raise_for_status()
            self.available_products = response.json()
        except requests.RequestException as e:
            logger.error(f"Failed to load products: {e}")
            self.available_products = []

async def main():
    """Main entry point."""
    from mcp.server.stdio import stdio_server

    server = EOLServer()

    async with stdio_server() as streams:
        await server.app.run(
            streams[0],
            streams[1],
            server.app.create_initialization_options()
        )

if __name__ == "__main__":
    import asyncio
    asyncio.run(main())