# EOL MCP Server 📅

A Model Context Protocol (MCP) server that enables AI assistants like Claude to check software end-of-life (EOL) dates and support status using the endoflife.date API. This helps AI models provide accurate information about software lifecycle and support status in real-time.

## What is MCP? 🤔

The Model Context Protocol (MCP) is a system that lets AI apps, like Claude Desktop, connect to external tools and data sources. It provides a standardized way for AI assistants to work with local services and APIs while keeping the user in control.

## What does this server do? 🚀

The EOL MCP server:
- Enables AI assistants to check software end-of-life dates and support status
- Provides information about software versions, release dates, and support cycles
- Supports queries for multiple software products (Python, Node.js, Ubuntu, etc.)
- Caches recent queries for quick reference
- Handles API rate limiting and error cases gracefully

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
git clone https://github.com/yourusername/eol-mcp-server.git
cd eol-mcp-server
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

## Using with Claude 🤖

### Available Tools

1. **check_version**
   - Checks EOL status for a specific software version
   - Example: "Check if Python 3.8 is still supported"

2. **list_products**
   - Lists all available products that can be checked
   - Example: "Show me all available products related to Linux"

### Available Prompts

1. **check-software-status**
   - Purpose: Check if a software version is still supported
   - Example: "Use check-software-status to check Node.js 16"
   - Arguments:
     - product (required): Software name
     - version (optional): Specific version

2. **analyze-eol-data**
   - Purpose: Get comprehensive EOL analysis
   - Example: "Use analyze-eol-data for Ubuntu with focus on LTS versions"
   - Arguments:
     - product (required): Software name
     - context (optional): Additional analysis context

### Example Conversations

1. Basic Version Check:
```
Human: Check if Python 3.8 is still supported
Claude: Let me check that for you using the EOL MCP server.
[Claude uses check_version tool]
```

2. Product Search:
```
Human: What versions of Ubuntu can I check?
Claude: I'll list the available Ubuntu versions.
[Claude uses list_products tool with filter]
```

3. Detailed Analysis:
```
Human: Analyze Node.js versions and recommend an upgrade path
Claude: I'll analyze the Node.js lifecycle data.
[Claude uses analyze-eol-data prompt]
```

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