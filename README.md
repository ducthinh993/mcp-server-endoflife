# EOL MCP Server 📅

A Model Context Protocol (MCP) server that enables AI assistants like Claude to check software end-of-life (EOL) dates and support status using the endoflife.date API. This helps AI models provide accurate information about software lifecycle and security status in real-time.

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

### 1. EOL Status Checking
- Get support status for specific versions
- View end-of-life dates
- Check LTS (Long Term Support) information
- Monitor support cycles

### 2. Security Analysis
- CVE vulnerability scanning
- Security status assessment
- CVSS score evaluation
- Vulnerability type identification

## Tools and Prompts 🛠️

### Available Tools

1. **check_version**
   - Purpose: Check EOL status for software versions
   - Example: "Is Python 3.8 still supported?"
   - Arguments:
     - product: Software name
     - version: Version to check

2. **check_cve**
   - Purpose: Scan for security vulnerabilities
   - Example: "Are there any CVEs for Node.js 16?"
   - Arguments:
     - product: Software name
     - version: Version to check
     - vendor: Software vendor (optional)

3. **list_products**
   - Purpose: Browse available software products
   - Example: "Show me all Linux distributions"
   - Arguments:
     - filter: Optional search term

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