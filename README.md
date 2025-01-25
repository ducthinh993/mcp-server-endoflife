# EOL MCP Server 📅

A Model Context Protocol (MCP) server that enables AI assistants like Claude to check software end-of-life (EOL) dates and support status using the endoflife.date API. This helps AI models provide accurate information about software lifecycle and security status in real-time.

<a href="https://glama.ai/mcp/servers/5392xs0e78"><img width="380" height="200" src="https://glama.ai/mcp/servers/5392xs0e78/badge" alt="EOL Server MCP server" /></a>

## What is MCP? 🤔

The Model Context Protocol (MCP) is a system that lets AI apps, like Claude Desktop, connect to external tools and data sources. It provides a standardized way for AI assistants to work with local services and APIs while keeping the user in control.

## What does this server do? 🚀

The EOL MCP server:
- Checks software end-of-life dates and support status
- Scans for CVE vulnerabilities in software versions
- Provides version comparison and upgrade recommendations
- Supports natural language queries about software lifecycle
- Handles multiple software products (Python, Node.js, Ubuntu, etc.)
- Caches recent queries for quick reference

## Features ✨

### Core Functionality
- Real-time EOL date validation
- Version support status checking
- Security vulnerability analysis
- Comprehensive version comparison
- Natural language query processing
- Detailed lifecycle validation

### Tools
1. `check_version`
   - Get EOL dates and support status
   - Check latest patch versions
   - Verify LTS status
   - Validate support timeline

2. `get_all_details` (New!)
   - Get comprehensive lifecycle details
   - View all version cycles
   - Check support timeline
   - Get validation results
   - Calculate remaining support days

3. `compare_versions`
   - Compare current vs latest versions
   - Get upgrade recommendations
   - Check compatibility
   - Assess upgrade urgency
   - Validate upgrade paths

4. `check_cve`
   - Security vulnerability scanning
   - Support status verification
   - Security patch validation
   - Vendor support checking

5. `list_products`
   - Browse available software
   - Search with filters
   - Verify product names
   - Get product details

### Prompts
1. `check_software_status`
   - Validate version support
   - Check EOL dates
   - Get security status

2. `compare_versions`
   - Analyze version differences
   - Get upgrade recommendations
   - Check compatibility

3. `analyze_security`
   - Security vulnerability analysis
   - Support status check
   - Patch verification

4. `natural_language_query`
   - Process natural language questions
   - Get contextual responses
   - Smart version detection

5. `validate_version`
   - Validate version recommendations
   - Check support status
   - Verify security implications

### Response Examples

#### Version Validation
```json
{
  "current_date": "2024-02-20T00:00:00.000Z",
  "validations": {
    "current": {
      "version": "1.20",
      "eol_check": {
        "date": "2024-02-06",
        "valid": false,
        "days_remaining": -14,
        "message": "Version 1.20 EOL date 2024-02-06 is invalid, -14 days from now"
      },
      "support": {
        "status": "not supported",
        "lts": "not LTS"
      }
    }
  },
  "recommendation": {
    "needs_update": true,
    "urgency": "critical",
    "message": "Current version needs urgent upgrade - use a supported version"
  }
}
```

#### All Details Response (New!)
```json
{
  "product": "go",
  "current_date": "2024-02-20T00:00:00.000Z",
  "cycles": [
    {
      "cycle": "1.22",
      "releaseDate": "2024-02-06",
      "eol": "2025-02-06",
      "latest": "1.22.0",
      "validation": {
        "is_valid": true,
        "days_to_eol": 351,
        "is_supported": true,
        "message": "Version 1.22 EOL date 2025-02-06 is valid, +351 days from now"
      }
    }
  ]
}
```

## Example Conversations 💬

1. Basic Version Check:
```
Human: Is Python 3.8 still good to use?
Claude: Let me check the status of Python 3.8.
[Uses check_version tool]
Based on the EOL data, Python 3.8:
- Security support ends: October 2024
- Current status: Security fixes only
Recommendation: Consider upgrading to Python 3.11 for new projects.
```

2. Security Analysis:
```
Human: Any security concerns with Node.js 16?
Claude: I'll analyze the security status of Node.js 16.
[Uses check_version tool]
[Uses check_cve tool]
Found:
- Support Status: LTS until September 2023
- Critical CVEs: 2 in last 6 months
- CVSS Score Range: 7.5-9.8
Recommendation: Update to latest 16.x patch or consider Node.js 18 LTS.
```

3. Version Comparison:
```
Human: Which Ubuntu version should I use?
Claude: I'll help you compare Ubuntu versions.
[Uses version-comparison prompt]
Analysis:
- 22.04 LTS: Supported until 2027, recommended for new deployments
- 20.04 LTS: Supported until 2025, stable and widely used
- 18.04 LTS: Approaching EOL, plan migration
Recommendation: Use 22.04 LTS for best long-term support.
```

## Prerequisites 📋

Before you begin, ensure you have:

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Claude Desktop](https://claude.ai/download) installed
- Git installed

You can verify your Node.js installation by running:
```bash
node --version  # Should show v18.0.0 or higher
```

## Installation 🛠️

1. Clone the repository:
```bash
git clone https://github.com/ducthinh993/mcp-server-endoflife
cd mcp-server-endoflife
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Create a global link:
```bash
npm link
```

## Configuration ⚙️

### 1. Claude Desktop Configuration

Configure Claude Desktop to recognize the EOL MCP server:

#### For macOS:
```bash
code ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

#### For Windows:
```bash
code %APPDATA%\Claude\claude_desktop_config.json
```

Add the EOL server configuration:
```json
{
  "mcpServers": {
    "eol": {
      "command": "npx",
      "args": ["/path/to/eol-mcp-server/build/index.js"]
    }
  }
}
```

### 2. Restart Claude Desktop

For the changes to take effect:
1. Completely quit Claude Desktop (not just close the window)
2. Start Claude Desktop again
3. Look for the 🔌 icon to verify the EOL server is connected

## Troubleshooting 🔧

### Common Issues

1. **Server Not Found**
   - Verify the npm link is correctly set up
   - Check Claude Desktop configuration syntax
   - Ensure Node.js is properly installed

2. **API Issues**
   - Check if endoflife.date API is accessible
   - Verify the API response format hasn't changed
   - Check network connectivity

3. **Connection Issues**
   - Restart Claude Desktop completely
   - Check Claude Desktop logs:
     ```bash
     # macOS
     tail -n 20 -f ~/Library/Logs/Claude/mcp*.log
     ```

### Getting Help

If you encounter issues:
- Review the [MCP Documentation](https://modelcontextprotocol.io)
- Check the [endoflife.date API Documentation](https://endoflife.date/docs/api)
- Open an issue in the GitHub repository

## Acknowledgments 🙏

- [endoflife.date](https://endoflife.date) for their comprehensive software lifecycle API
- [Model Context Protocol](https://modelcontextprotocol.io) for the MCP specification
- [Anthropic](https://anthropic.com) for Claude Desktop 
