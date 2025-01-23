#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import {
  EOLCycle,
  ProductInfo,
  CheckVersionArgs,
  isValidCheckVersionArgs,
  CachedQuery,
  isValidListProductsArgs
} from "./types.js";

const API_CONFIG = {
  BASE_URL: 'https://endoflife.date/api',
  MAX_CACHED_QUERIES: 5,
  ENDPOINTS: {
    ALL_PRODUCTS: '/all.json'
  }
} as const;

const PROMPTS = {
  "check-software-status": {
    name: "check-software-status",
    description: "Check if a software version is still supported or has reached end-of-life",
    arguments: [
      {
        name: "product",
        description: "Software product name (e.g., python, nodejs, ubuntu)",
        required: true
      },
      {
        name: "version",
        description: "Specific version to check",
        required: false
      }
    ]
  },
  "analyze-eol-data": {
    name: "analyze-eol-data",
    description: "Analyze EOL data and provide recommendations",
    arguments: [
      {
        name: "product",
        description: "Software product name",
        required: true
      },
      {
        name: "context",
        description: "Additional context for analysis",
        required: false
      }
    ]
  }
} as const;

class EOLServer {
  private server: Server;
  private axiosInstance: AxiosInstance;
  private recentQueries: CachedQuery[] = [];
  private availableProducts: string[] = [];

  constructor() {
    this.server = new Server({
      name: "eol-mcp-server",
      version: "0.1.0"
    }, {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {}
      }
    });

    this.axiosInstance = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json'
      }
    });

    this.setupHandlers();
    this.setupErrorHandling();
    this.loadAvailableProducts().catch(console.error);
  }

  private async loadAvailableProducts(): Promise<void> {
    try {
      const response = await this.axiosInstance.get(API_CONFIG.ENDPOINTS.ALL_PRODUCTS);
      this.availableProducts = response.data as string[];
    } catch (error) {
      console.error('Failed to load available products:', error);
      this.availableProducts = [];
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.setupResourceHandlers();
    this.setupToolHandlers();
    this.setupPromptHandlers();
  }

  private setupResourceHandlers(): void {
    // List available resources (recent queries)
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async () => ({
        resources: this.recentQueries.map((query, index) => ({
          uri: `eol://queries/${index}`,
          name: `Recent query: ${query.product}${query.version ? ` v${query.version}` : ''}`,
          mimeType: "application/json",
          description: `EOL status for ${query.product} (${query.timestamp})`
        }))
      })
    );

    // Read specific resource
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const match = request.params.uri.match(/^eol:\/\/queries\/(\d+)$/);
        if (!match) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Unknown resource: ${request.params.uri}`
          );
        }

        const index = parseInt(match[1]);
        const query = this.recentQueries[index];

        if (!query) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Query result not found: ${index}`
          );
        }

        return {
          contents: [{
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify(query.response, null, 2)
          }]
        };
      }
    );
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      async () => ({
        tools: [
          {
            name: "check_version",
            description: "Check EOL status for a software version",
            inputSchema: {
              type: "object",
              properties: {
                product: {
                  type: "string",
                  description: "Software product name (e.g., python, nodejs, ubuntu)"
                },
                version: {
                  type: "string",
                  description: "Specific version to check (optional)"
                }
              },
              required: ["product"]
            }
          },
          {
            name: "list_products",
            description: "List all available products that can be checked",
            inputSchema: {
              type: "object",
              properties: {
                filter: {
                  type: "string",
                  description: "Optional filter to search for specific products"
                }
              }
            }
          }
        ]
      })
    );

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        switch (request.params.name) {
          case "check_version":
            return this.handleCheckVersion(request.params.arguments);
          case "list_products":
            return this.handleListProducts(request.params.arguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      }
    );
  }

  private setupPromptHandlers(): void {
    // List available prompts
    this.server.setRequestHandler(
      ListPromptsRequestSchema,
      async () => ({
        prompts: Object.values(PROMPTS)
      })
    );

    // Get specific prompt
    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request) => {
        const promptName = request.params.name;
        const args = request.params.arguments || {};

        switch (promptName) {
          case "check-software-status": {
            const { product, version } = args;
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `Please check the support status for ${product}${version ? ` version ${version}` : ''}.
                    Analyze whether it's still supported, when it will reach end-of-life, and provide recommendations
                    about upgrading if needed.`
                  }
                }
              ]
            };
          }

          case "analyze-eol-data": {
            const { product, context } = args;
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `Please analyze the EOL data for ${product} and provide insights about:
                    1. Current supported versions
                    2. Upcoming EOL dates
                    3. Recommended upgrade paths
                    4. Security implications
                    ${context ? `\nAdditional context: ${context}` : ''}`
                  }
                }
              ]
            };
          }

          default:
            throw new McpError(
              ErrorCode.InvalidRequest,
              `Unknown prompt: ${promptName}`
            );
        }
      }
    );
  }

  private async handleCheckVersion(args: unknown) {
    if (!isValidCheckVersionArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid version check arguments"
      );
    }

    const { product, version } = args;

    // Validate product exists
    if (!this.availableProducts.includes(product)) {
      return {
        content: [{
          type: "text",
          text: `Invalid product: ${product}. Use list_products tool to see available products.`
        }],
        isError: true
      };
    }

    try {
      const response = await this.axiosInstance.get(`/${product}.json`);
      const cycles = response.data as EOLCycle[];

      const filteredCycles = version
        ? cycles.filter(cycle => cycle.cycle.startsWith(version))
        : cycles;

      this.recentQueries.unshift({
        product,
        version,
        response: filteredCycles,
        timestamp: new Date().toISOString()
      });

      if (this.recentQueries.length > API_CONFIG.MAX_CACHED_QUERIES) {
        this.recentQueries.pop();
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(filteredCycles, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: "text",
            text: `EOL API error: ${error.response?.data?.message ?? error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }

  private async handleListProducts(args: unknown) {
    if (!isValidListProductsArgs(args)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "Invalid list products arguments"
      );
    }

    const { filter } = args;
    let products = this.availableProducts;

    if (filter) {
      products = products.filter(p =>
        p.toLowerCase().includes(filter.toLowerCase())
      );
    }

    return {
      content: [{
        type: "text",
        text: JSON.stringify(products, null, 2)
      }]
    };
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("EOL MCP server running on stdio");
  }
}

const server = new EOLServer();
server.run().catch(console.error);