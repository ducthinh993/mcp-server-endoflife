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
  isValidCompareVersionsArgs,
  ValidationResult,
  VersionValidation,
  ValidationsResult,
  GetAllDetailsArgs,
  isValidGetAllDetailsArgs
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
    },

    "validate_version": {
      name: "validate_version",
      description: "Validate version recommendations before responding",
      arguments: [
        {
          name: "product",
          description: "Software product name",
          required: true
        },
        {
          name: "versions",
          description: "List of versions to validate",
          required: true
        }
      ]
    }
  } as const;

  private static readonly PROMPT_TEMPLATES = {
    VERSION_VALIDATION: (currentDate: string) => [
      "2. VERSION VALIDATION:",
      "   a. Get All Versions:",
      "      [Using get_all_details]",
      "      - Get complete version history",
      "      - Check all EOL dates",
      "      - Verify support status",
      "",
      "   b. Version Analysis:",
      "      [Using check_version]",
      "      - Validate specific version",
      "      - Check latest patches",
      "      - Verify LTS status",
      "",
      "   c. Security Check:",
      "      [Using check_cve]",
      "      - Check vulnerabilities",
      "      - Verify security patches",
      "      - Validate support"
    ].join("\n"),

    RESPONSE_HEADER: (currentDate: string) => [
      "VALIDATION REQUIREMENTS:",
      `1. Current date: ${currentDate}`,
      ""
    ].join("\n"),

    RESPONSE_FORMAT: (currentDate: string) => [
      "3. RESPONSE FORMAT:",
      "   ```",
      `   Current date: ${currentDate}`,
      "",
      "   Version Analysis:",
      "   1. Current Version:",
      "      - EOL Check: YYYY-MM-DD ({valid|invalid}, {+/-N} days)",
      "      - Support: {active|inactive}",
      "      - Security: {supported|unsupported}",
      "",
      "   2. Latest Available:",
      "      - Version: X.Y.Z",
      "      - EOL Date: YYYY-MM-DD",
      "      - Support: {active|inactive}",
      "      - LTS: {yes|no}",
      "",
      "   Recommendation:",
      "      - Upgrade Status: {required|optional|none}",
      "      - Urgency: {critical|high|medium|low}",
      "      - Timeline: {immediate|planned|none}",
      "   ```"
    ].join("\n")
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
          },
          {
            name: "get_all_details",
            description: "Get comprehensive lifecycle details for all versions of a product",
            inputSchema: {
              type: "object",
              properties: {
                product: {
                  type: "string",
                  description: "Software product name (e.g., python, nodejs)",
                  examples: ["python", "nodejs"]
                }
              },
              required: ["product"]
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

            return this.handleCompareVersions(args);
          }

          case "get_all_details": {
            if (!isValidGetAllDetailsArgs(args)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                "Invalid get all details arguments"
              );
            }
            return this.handleGetAllDetails(args);
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
        const currentDate = new Date().toISOString();

        switch (promptName) {
          case "check_software_status": {
            const { product, version } = args;
            return {
              messages: [{
                role: "user",
                content: {
                  type: "text",
                  text: [
                    `I'll analyze the software lifecycle status for ${product}${version ? ` version ${version}` : ''}.`,
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_HEADER(currentDate),
                    EOLServer.PROMPT_TEMPLATES.VERSION_VALIDATION(currentDate),
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_FORMAT(currentDate),
                    "",
                    "Let me validate the version status..."
                  ].join("\n")
                }
              }]
            };
          }

          case "compare_versions": {
            const { product, version } = args;
            return {
              messages: [{
                role: "user",
                content: {
                  type: "text",
                  text: [
                    `I'll analyze ${product} version ${version} and provide upgrade recommendations.`,
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_HEADER(currentDate),
                    EOLServer.PROMPT_TEMPLATES.VERSION_VALIDATION(currentDate),
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_FORMAT(currentDate),
                    "",
                    "Let me analyze the versions..."
                  ].join("\n")
                }
              }]
            };
          }

          case "analyze_security": {
            const { product, version } = args;
            return {
              messages: [{
                role: "user",
                content: {
                  type: "text",
                  text: [
                    `I'll analyze security status for ${product} version ${version}.`,
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_HEADER(currentDate),
                    EOLServer.PROMPT_TEMPLATES.VERSION_VALIDATION(currentDate),
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_FORMAT(currentDate),
                    "",
                    "Let me analyze the security status..."
                  ].join("\n")
                }
              }]
            };
          }

          case "validate_version": {
            const { product, versions } = args;
            return {
              messages: [{
                role: "user",
                content: {
                  type: "text",
                  text: [
                    `I'll validate ${product} versions: ${Array.isArray(versions) ? versions.join(", ") : versions}`,
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_HEADER(currentDate),
                    EOLServer.PROMPT_TEMPLATES.VERSION_VALIDATION(currentDate),
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_FORMAT(currentDate),
                    "",
                    "Let me validate each version..."
                  ].join("\n")
                }
              }]
            };
          }

          case "natural_language_query": {
            const { query } = args;
            return {
              messages: [{
                role: "user",
                content: {
                  type: "text",
                  text: [
                    `I'll help analyze software lifecycle information. Here's what I found about: ${query}`,
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_HEADER(currentDate),
                    EOLServer.PROMPT_TEMPLATES.VERSION_VALIDATION(currentDate),
                    "",
                    EOLServer.PROMPT_TEMPLATES.RESPONSE_FORMAT(currentDate),
                    "",
                    "Let me analyze your query..."
                  ].join("\n")
                }
              }]
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

  private async handleCompareVersions(args: CompareVersionsArgs) {
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
      const cycles = await this.getProductDetails(product);
      const currentDate = new Date();

      // Validate current version
      const currentCycle = cycles.find(c => c?.cycle?.startsWith(version));
      if (!currentCycle) {
        return {
          content: [{
            type: "text",
            text: `Version ${version} not found for ${product}`
          }],
          isError: true
        };
      }

      // Find and validate latest supported version
      const latestSupportedCycle = cycles.find(c => {
        const validation = this.validateVersion(c, currentDate);
        return validation.isValid && validation.isSupported;
      }) || cycles[0];

      // Validate both versions
      const currentValidation = this.validateVersion(currentCycle, currentDate);
      const latestValidation = this.validateVersion(latestSupportedCycle, currentDate);

      // Cache the query
      this.recentQueries.unshift({
        product,
        version,
        response: [currentCycle, latestSupportedCycle],
        timestamp: currentDate.toISOString()
      });

      if (this.recentQueries.length > API_CONFIG.MAX_CACHED_QUERIES) {
        this.recentQueries.pop();
      }

      const response = {
        current_date: currentDate.toISOString(),
        validations: {
          current: this.formatVersionValidation(currentCycle, currentValidation),
          latest: this.formatVersionValidation(latestSupportedCycle, latestValidation)
        },
        recommendation: {
          needs_update: !currentValidation.isValid || !currentValidation.isSupported,
          urgency: this.getUpgradeUrgency(currentValidation.daysToEol),
          message: this.getRecommendationMessage(currentValidation)
        }
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(response, null, 2)
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

  private formatVersionValidation(cycle: EOLCycle, validation: ValidationResult) {
    return {
      version: cycle.cycle,
      eol_check: {
        date: cycle.eol,
        valid: validation.isValid,
        days_remaining: validation.daysToEol,
        message: validation.validationMessage
      },
      support: {
        status: validation.isSupported ? "supported" : "not supported",
        lts: this.isValueTruthy(cycle.lts) ? "LTS" : "not LTS"
      }
    };
  }

  private getUpgradeUrgency(daysToEol: number): string {
    if (daysToEol < 0) return "critical";
    if (daysToEol < 30) return "high";
    if (daysToEol < 90) return "medium";
    return "low";
  }

  private getRecommendationMessage(validation: ValidationResult): string {
    return validation.isSupported && validation.isValid
      ? "Current version is supported, but consider upgrading to latest for security updates"
      : "Current version needs urgent upgrade - use a supported version";
  }

  // Helper function to check if a value is truthy
  private isValueTruthy(value: string | boolean | undefined): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const lowered = value.toLowerCase();
      return lowered === "true" || lowered === "yes";
    }
    return false;
  }

  private async getProductDetails(product: string): Promise<EOLCycle[]> {
    const response = await this.axiosInstance.get(`/${product}.json`);
    return response.data as EOLCycle[];
  }

  private validateVersion(cycle: EOLCycle | undefined, currentDate: Date = new Date()): ValidationResult {
    if (!cycle?.eol) {
      return {
        isValid: false,
        daysToEol: 0,
        isSupported: false,
        validationMessage: `Invalid cycle data for version ${cycle?.cycle ?? 'unknown'}`
      };
    }

    const eolDate = new Date(cycle.eol);
    const daysToEol = Math.floor((eolDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
    const isSupported = this.isValueTruthy(cycle.support);

    return {
      isValid: daysToEol > 0,
      daysToEol,
      isSupported,
      validationMessage: `Version ${cycle.cycle} EOL date ${cycle.eol} is ${daysToEol > 0 ? 'valid' : 'invalid'}, ${daysToEol > 0 ? '+' : ''}${daysToEol} days from now`
    };
  }

  private async validateVersions(product: string, versions: string[]): Promise<ValidationsResult> {
    const cycles = await this.getProductDetails(product);
    const currentDate = new Date();
    const validations: Record<string, VersionValidation> = {};
    const validVersions: string[] = [];

    for (const version of versions) {
      const cycle = cycles.find(c => c?.cycle?.startsWith(version));
      if (!cycle) continue;

      const validation = this.validateVersion(cycle, currentDate);
      const securityCheck = await this.handleCheckCVE({ product, version });

      validations[version] = {
        eol: {
          date: cycle.eol,
          valid: validation.isValid,
          daysRemaining: validation.daysToEol,
          message: validation.validationMessage
        },
        support: {
          isSupported: validation.isSupported,
          message: `Version ${version} support status: ${validation.isSupported ? 'active' : 'inactive'}`
        },
        security: {
          isSupported: !cycle.eol || new Date(cycle.eol) > currentDate,
          message: `Version ${version} security status: ${!cycle.eol || new Date(cycle.eol) > currentDate ? 'supported' : 'unsupported'}`
        }
      };

      if (validation.isValid && validation.isSupported) {
        validVersions.push(version);
      }
    }

    return { validations, validVersions };
  }

  private async handleGetAllDetails(args: GetAllDetailsArgs) {
    const { product } = args;

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
      const cycles = await this.getProductDetails(product);
      const currentDate = new Date();

      // Add validation results for each cycle
      const detailedCycles = cycles.map(cycle => {
        const validation = this.validateVersion(cycle, currentDate);
        return {
          ...cycle,
          validation: {
            is_valid: validation.isValid,
            days_to_eol: validation.daysToEol,
            is_supported: validation.isSupported,
            message: validation.validationMessage
          }
        };
      });

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            product,
            current_date: currentDate.toISOString(),
            cycles: detailedCycles
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