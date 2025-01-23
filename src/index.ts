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
  McpError,
  ServerOptions
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import {
  EOLCycle,
  ProductInfo,
  CheckVersionArgs,
  isValidCheckVersionArgs,
  CachedQuery,
  isValidListProductsArgs,
  CVECheckArgs,
  isValidCVECheckArgs,
  CVEDetails
} from "./types.js";

const API_CONFIG = {
  BASE_URL: 'https://endoflife.date/api',
  CVE_BASE_URL: 'https://www.cvedetails.com/json-feed.php',
  MAX_CACHED_QUERIES: 5,
  ENDPOINTS: {
    ALL_PRODUCTS: '/all.json'
  }
} as const;

class EOLServer {
  private server: Server;
  private axiosInstance: AxiosInstance;
  private cveAxiosInstance: AxiosInstance;
  private recentQueries: CachedQuery[] = [];
  private availableProducts: string[] = [];

  private static readonly PROMPTS = {
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
          description: "Specific version to check (optional)",
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
    },
    "analyze-security": {
      name: "analyze-security",
      description: "Analyze security vulnerabilities and EOL status",
      arguments: [
        {
          name: "product",
          description: "Software product name",
          required: true
        },
        {
          name: "version",
          description: "Specific version to check",
          required: true
        },
        {
          name: "vendor",
          description: "Software vendor name",
          required: false
        }
      ]
    },
    "natural-language-query": {
      name: "natural-language-query",
      description: "Process natural language queries about software lifecycle status",
      arguments: [
        {
          name: "query",
          description: "The natural language query about software versions, support, or security",
          required: true
        }
      ]
    },
    "version-comparison": {
      name: "version-comparison",
      description: "Compare multiple versions of software for support status and security",
      arguments: [
        {
          name: "product",
          description: "Software product name",
          required: true
        },
        {
          name: "versions",
          description: "Comma-separated list of versions to compare",
          required: true
        }
      ]
    }
  } as const;

  constructor() {
    const serverOptions: ServerOptions = {
      name: "eol-mcp-server",
      version: "0.1.0",
      capabilities: {
        resources: {},
        tools: {},
        prompts: {}
      }
    };

    this.server = new Server(serverOptions);

    this.axiosInstance = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json'
      }
    });

    this.cveAxiosInstance = axios.create({
      baseURL: API_CONFIG.CVE_BASE_URL,
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json'
      }
    });

    this.setupHandlers();
    this.setupErrorHandling();
    this.loadAvailableProducts().catch(console.error);
  }

  private setupHandlers(): void {
    this.setupResourceHandlers();
    this.setupToolHandlers();
    this.setupPromptHandlers();
  }

  private setupResourceHandlers(): void {
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
            description: "Check EOL status for software versions",
            inputSchema: {
              type: "object",
              properties: {
                product: {
                  type: "string",
                  description: "Software product name (e.g., python, nodejs, ubuntu)"
                },
                version: {
                  type: "string",
                  description: "Specific version to check"
                }
              },
              required: ["product"]
            }
          },
          {
            name: "check_cve",
            description: "Scan for security vulnerabilities",
            inputSchema: {
              type: "object",
              properties: {
                product: {
                  type: "string",
                  description: "Software product name"
                },
                version: {
                  type: "string",
                  description: "Version to check"
                },
                vendor: {
                  type: "string",
                  description: "Software vendor (optional)"
                }
              },
              required: ["product", "version"]
            }
          },
          {
            name: "list_products",
            description: "Browse available software products",
            inputSchema: {
              type: "object",
              properties: {
                filter: {
                  type: "string",
                  description: "Optional search term"
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
        const toolName = request.params.name;
        const args = request.params.arguments || {};

        switch (toolName) {
          case "check_version":
            if (!isValidCheckVersionArgs(args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid version check arguments"
              );
            }
            return this.handleCheckVersion(args);

          case "check_cve":
            if (!isValidCVECheckArgs(args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid CVE check arguments"
              );
            }
            return this.handleCheckCVE(args);

          case "list_products":
            if (!isValidListProductsArgs(args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid list products arguments"
              );
            }
            return this.handleListProducts(args);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${toolName}`
            );
        }
      }
    );
  }

  private setupPromptHandlers(): void {
    this.server.setRequestHandler(
      ListPromptsRequestSchema,
      async () => ({
        prompts: Object.values(EOLServer.PROMPTS)
      })
    );

    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request) => {
        const promptName = request.params.name;
        const args = request.params.arguments || {};

        switch (promptName) {
          case "natural-language-query": {
            const { query } = args;
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `I'll help you understand the software lifecycle status. Here's what I found about: ${query}

First, let me check the available information about this software.
[Using list_products tool to find relevant products]

Now, I'll analyze the specific versions and their status.
[Using check_version tool for relevant versions]

If security is mentioned, I'll also check for vulnerabilities.
[Using check_cve tool if security is relevant]

I'll provide a comprehensive analysis based on all this information.`
                  }
                }
              ]
            };
          }

          case "version-comparison": {
            const { product, versions } = args;
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `I'll help you compare these versions of ${product}: ${versions}

For each version, I'll check:
1. Support status and EOL dates
2. Security vulnerabilities
3. Recommended upgrade paths

Let me analyze each version:
[Using check_version tool for each version]
[Using check_cve tool for each version]

I'll then provide a comparison and recommendations based on:
- Current support status
- Upcoming EOL dates
- Known vulnerabilities
- Best practices for upgrades`
                  }
                }
              ]
            };
          }

          case "analyze-security": {
            const { product, version, vendor } = args;
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `I'll analyze the security status for ${product} version ${version}${vendor ? ` from ${vendor}` : ''}.
Check both EOL status and CVE vulnerabilities to provide:
1. Current support status
2. Known vulnerabilities and their severity
3. Security recommendations
4. Upgrade recommendations if needed`
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

  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("EOL MCP server running on stdio");
  }
}

const server = new EOLServer();
server.start().catch(console.error);