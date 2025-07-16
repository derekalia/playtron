# MCP Server for Electron Browser

A standalone MCP (Model Context Protocol) server that communicates with the Electron browser via Chrome DevTools Protocol (CDP). This server enables AI assistants to control web browsers programmatically through the MCP protocol.

## Features

- **Tab Management**: Create, switch, and list browser tabs
- **Navigation**: Navigate to URLs, go back/forward, reload pages
- **Interaction**: Click elements, type text, fill forms
- **Inspection**: Take screenshots, get page info, accessibility snapshots
- **Advanced Selectors**: Full Playwright selector support (text=, role=, CSS, etc.)

## Prerequisites

- Node.js 18+
- The Electron browser component must be running with CDP enabled on port 9222

### Starting the Browser

The MCP server requires the Electron browser to be running first:

```bash
# From the project root
cd browser-test && npm run dev
```

This starts the browser with CDP enabled on port 9222.

## Installation

```bash
cd mcp-server
npm install
```

## Usage

### Start the MCP Server

```bash
npm start
```

The server will:
1. Check for Electron browser on `localhost:9222`
2. Wait and retry every 5 seconds until browser is available
3. Start MCP server and begin listening for connections via stdio
4. Log all operations for debugging

### Claude Desktop Configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "electron-browser": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/absolute/path/to/mcp-server"
    }
  }
}
```

## Available MCP Tools

### Navigation
- `navigate` - Navigate to URL with wait options and timeout handling
- `goBack`, `goForward`, `reload` - Browser navigation controls
- `getPageInfo` - Get current page URL and title

### Interaction
- `click` - Click elements with CSS/XPath selectors and auto-scroll
- `type` - Type text with configurable delay
- `fill` - Fill input fields instantly
- `selectOption` - Select dropdown options
- `setChecked` - Check/uncheck checkboxes

### Inspection
- `screenshot` - Capture full page or element screenshots
- `getAccessibilitySnapshot` / `browser_snapshot` - Extract page structure without screenshots
- `getText` - Get text using Playwright selectors (text=, role=, etc.)
- `evaluate` - Execute JavaScript in page context
- `waitForSelector` - Wait for elements to appear

### Tab Management
- `createTab` - Create new browser tabs with optional URL
- `switchTab` - Switch between tabs by ID
- `listTabs` - List all tabs with URLs and titles


## Debugging

The server provides extensive logging:
- `[PlaywrightCDP]` - CDP connection and page management
- `[MCP-CDP]` - MCP tool execution and results
- `[FastMCP]` - MCP protocol communication

### MCP Inspector

Use the official MCP Inspector for interactive testing and debugging:

```bash
# Launch the MCP Inspector
npm run inspect
```

The Inspector provides:
- Real-time server connection testing
- Interactive tool execution
- Schema validation
- Request/response inspection
- Server capability exploration

### Common Issues

1. **Server Won't Start**: Server waits for Electron browser to be available
   - Check if port 9222 is accessible: `curl http://localhost:9222/json/version`
   - Start Electron with: `electron . --remote-debugging-port=9222`
   - Server will check every 5 seconds until browser is found
   
2. **No Pages Found**: Wait for browser to fully load before using tools
   - The server connects successfully but browser has no pages yet
   - Load a webpage in the Electron browser
   
3. **Tool Timeouts**: Increase timeout values in tool options
   - Most tools have a default 30-second timeout

4. **MCP Inspector Connection**: Server must detect browser before MCP Inspector can connect
   - Start Electron browser first
   - Then start MCP Inspector
   - Server will show "MCP server started successfully" when ready

## Development

```bash
npm start          # Start MCP server (connects to browser via CDP)
npm run dev        # Development mode (same as start)
npm run build      # Build TypeScript to dist/
npm run lint       # Run ESLint on TypeScript files
npm run test       # Test MCP connection
```

### Testing

```bash
# Test MCP connection
npm run test

# Test available tools
node test-tools.js
```

## Architecture

### Communication Flow
```
MCP Client <-> MCP Server (stdio) <-> CDP (localhost:9222) <-> Electron Browser
```

### Core Components
- **MCP Server** (`src/index.ts`) - FastMCP server with Playwright CDP connector
- **CDP Connector** (`src/playwright-cdp-connector.ts`) - Bridges Playwright to Electron's CDP endpoint

## Related Documentation

For more information:
- Main project README: `../README.md`
- Browser component documentation: `../browser-test/README.md`
- Development guide: `../CLAUDE.md`