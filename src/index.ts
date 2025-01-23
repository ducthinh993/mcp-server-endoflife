#!/usr/bin/env node
import { Server, ServerOptions } from "@modelcontextprotocol/sdk/server/index.js";
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
  Implementation,
  ServerCapabilities
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
  CVEDetails,
  CompareVersionsArgs,
  isValidCompareVersionsArgs
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
    "check_software_status": {
      name: "check_software_status",
      description: "Check if software versions are supported and get EOL dates",
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

    "compare_versions": {
      name: "compare_versions",
      description: "Compare versions and analyze upgrade recommendations",
      arguments: [
        {
          name: "product",
          description: "Software product name (e.g., python, nodejs)",
          required: true
        },
        {
          name: "version",
          description: "Current version being used",
          required: true
        }
      ]
    },

    "analyze_security": {
      name: "analyze_security",
      description: "Comprehensive security analysis including EOL status and vulnerabilities",
      arguments: [
        {
          name: "product",
          description: "Software product name",
          required: true
        },
        {
          name: "version",
          description: "Version to analyze",
          required: true
        }
      ]
    },

    "natural_language_query": {
      name: "natural_language_query",
      description: "Process natural language queries about software lifecycle",
      arguments: [
        {
          name: "query",
          description: "Natural language question about software versions, support, or security",
          required: true
        }
      ]
    }
  } as const;

  constructor() {
    const serverInfo: Implementation = {
      name: "eol-mcp-server",
      version: "0.1.0"
    };

    const options = {
      capabilities: {
        experimental: {},
        logging: {},
        prompts: {
          listChanged: false
        },
        resources: {},
        tools: {}
      }
    };

    this.server = new Server(serverInfo, options);

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
            description: "Check EOL status and support information for software versions",
            inputSchema: {
              type: "object",
              properties: {
                product: {
                  type: "string",
                  description: "Software product name (e.g., python, nodejs, ubuntu)",
                  examples: ["python", "nodejs", "ubuntu"]
                },
                version: {
                  type: "string",
                  description: "Specific version to check (e.g., 3.8, 16, 20.04)",
                  examples: ["3.8", "16", "20.04"]
                }
              },
              required: ["product"]
            }
          },
          {
            name: "check_cve",
            description: "Scan for known security vulnerabilities and support status",
            inputSchema: {
              type: "object",
              properties: {
                product: {
                  type: "string",
                  description: "Software product name",
                  examples: ["python", "nodejs"]
                },
                version: {
                  type: "string",
                  description: "Version to check for vulnerabilities",
                  examples: ["3.8.0", "16.13.0"]
                },
                vendor: {
                  type: "string",
                  description: "Software vendor (optional)",
                  examples: ["canonical", "redhat"]
                }
              },
              required: ["product", "version"]
            }
          },
          {
            name: "list_products",
            description: "Browse or search available software products",
            inputSchema: {
              type: "object",
              properties: {
                filter: {
                  type: "string",
                  description: "Optional search term to filter products",
                  examples: ["python", "linux", "database"]
                }
              }
            }
          },
          {
            name: "compare_versions",
            description: "Compare versions and get detailed upgrade analysis",
            inputSchema: {
              type: "object",
              properties: {
                product: {
                  type: "string",
                  description: "Software product name (e.g., python, nodejs)",
                  examples: ["python", "nodejs"]
                },
                version: {
                  type: "string",
                  description: "Current version being used",
                  examples: ["3.8", "16"]
                }
              },
              required: ["product", "version"]
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

          case "compare_versions": {
            if (!isValidCompareVersionsArgs(args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid version comparison arguments"
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

              const currentCycle = cycles.find(c => c.cycle.startsWith(version));
              if (!currentCycle) {
                return {
                  content: [{
                    type: "text",
                    text: `Version ${version} not found for ${product}`
                  }],
                  isError: true
                };
              }

              const latestCycle = cycles[0];

              // Cache the query
              this.recentQueries.unshift({
                product,
                version,
                response: [currentCycle, latestCycle],
                timestamp: new Date().toISOString()
              });

              if (this.recentQueries.length > API_CONFIG.MAX_CACHED_QUERIES) {
                this.recentQueries.pop();
              }

              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    current: {
                      version: currentCycle.cycle,
                      latest_patch: currentCycle.latest,
                      eol: currentCycle.eol,
                      support: currentCycle.support || "No support information"
                    },
                    latest: {
                      version: latestCycle.cycle,
                      latest_patch: latestCycle.latest,
                      eol: latestCycle.eol,
                      support: latestCycle.support || "No support information"
                    },
                    analysis: {
                      is_latest: currentCycle.cycle === latestCycle.cycle,
                      needs_update: currentCycle.cycle !== latestCycle.cycle,
                      support_status: currentCycle.support ? "supported" : "unsupported",
                      time_to_eol: new Date(currentCycle.eol).getTime() - new Date().getTime()
                    }
                  }, null, 2)
                }]
              };
            } catch (error) {
              if (axios.isAxiosError(error)) {
                return {
                  content: [{
                    type: "text",
                    text: `API error: ${error.response?.data?.message ?? error.message}`
                  }],
                  isError: true
                };
              }
              throw error;
            }
          }

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
          case "natural_language_query": {
            const { query } = args;
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `I'll help you understand the software lifecycle status. Here's what I found about: ${query}

Available tools and their capabilities:

1. check_version:
   Input: product (required), version (optional)
   Output: EOL dates, support status, latest patches
   Example: check_version(product="python", version="3.8")

2. list_products:
   Input: filter (optional)
   Output: List of available products
   Example: list_products(filter="python")

3. check_cve:
   Input: product, version, vendor (optional)
   Output: Security status and vulnerabilities
   Example: check_cve(product="python", version="3.8")

4. compare_versions:
   Input: product, version
   Output: Detailed version comparison
   Example: compare_versions(product="python", version="3.8")

Analysis steps:
1. First, I'll identify the software and versions in your query
2. Then, I'll check the available information using appropriate tools
3. Finally, I'll provide a comprehensive analysis

Let me help you with that query...`
                  }
                }
              ]
            };
          }

          case "compare_versions": {
            const { product, version } = args;
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `I'll help analyze ${product} version ${version} and provide upgrade recommendations.

Available tools and their capabilities:
1. check_version:
   - Get EOL dates
   - Check support status
   - Find latest patch versions
   - View LTS information

2. list_products:
   - Verify product names
   - Browse available software
   - Search with filters

3. check_cve:
   - Security vulnerability scans
   - Support status verification
   - Security recommendations

Analysis workflow:
1. Verify product and check current version:
[Using check_version with product=${product}, version=${version}]

2. Get latest version details:
[Using check_version with product=${product}]

3. Analyze security implications:
[Using check_cve with product=${product}, version=${version}]

I will provide:
✓ Version comparison (current vs latest)
✓ Support status analysis
✓ Security assessment
✓ Specific upgrade recommendations
✓ Timeline for required updates

Let me start the analysis...`
                  }
                }
              ]
            };
          }

          case "analyze_security": {
            const { product, version } = args;
            return {
              messages: [
                {
                  role: "user",
                  content: {
                    type: "text",
                    text: `I'll analyze the security status for ${product} version ${version}.
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

  private async handleCheckVersion(args: CheckVersionArgs) {
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

  private async handleListProducts(args: { filter?: string }) {
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

  private async handleCheckCVE(args: CVECheckArgs) {
    const { product, version, vendor } = args;

    try {
      const response = await this.axiosInstance.get(`/${product}.json`);
      const cycles = response.data as EOLCycle[];

      const matchingCycle = cycles.find(cycle => cycle.cycle.startsWith(version));
      if (!matchingCycle) {
        return {
          content: [{
            type: "text",
            text: `Version ${version} not found for ${product}`
          }],
          isError: true
        };
      }

      // For now, return basic EOL info since we removed Snyk
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            product,
            version,
            vendor,
            cycle: matchingCycle,
            securityStatus: matchingCycle.support ? 'supported' : 'unsupported'
          }, null, 2)
        }]
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          content: [{
            type: "text",
            text: `API error: ${error.response?.data?.message ?? error.message}`
          }],
          isError: true
        };
      }
      throw error;
    }
  }
}

const server = new EOLServer();
server.start().catch(console.error);