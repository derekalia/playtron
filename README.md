# Electron Browser MCP Server

A standalone MCP (Model Context Protocol) server that provides AI assistants with the ability to control the Electron browser via Chrome DevTools Protocol (CDP). Compatible with any MCP client.

## Features

- **Tab Management**: Create, switch, and list browser tabs
- **Navigation**: Navigate to URLs, go back/forward, reload pages
- **Interaction**: Click elements, type text, fill forms
- **Inspection**: Take screenshots, get page info, accessibility snapshots
- **Advanced Selectors**: Full Playwright selector support (text=, role=, CSS, etc.)

## Prerequisites

- Node.js 18+
- The Electron browser must be running with CDP enabled on port 9222

### Starting Electron Browser with CDP

For the MCP server to work, you need an Electron browser running with Chrome DevTools Protocol enabled:

```bash
# Example: Start Electron app with CDP enabled
electron . --remote-debugging-port=9222
```

Or if you have a custom Electron app, ensure it starts with CDP enabled on port 9222.

## Installation

```bash
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

### MCP Client Configuration

Add to your MCP client configuration:

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

### Navigation Tools
- `navigate(url, waitUntil?)` - Navigate to URL
- `goBack()` - Go back in history
- `goForward()` - Go forward in history
- `reload(waitUntil?)` - Reload current page
- `getPageInfo()` - Get current page URL and title

### Tab Management Tools
- `createTab(url?)` - Create new tab with optional URL
- `switchTab(tabId)` - Switch to specific tab
- `listTabs()` - List all available tabs

### Interaction Tools
- `click(selector, options?)` - Click elements
- `type(selector, text, options?)` - Type text
- `fill(selector, value)` - Fill input fields
- `selectOption(selector, value)` - Select dropdown options
- `setChecked(selector, checked)` - Check/uncheck boxes

### Inspection Tools
- `screenshot(fullPage?, selector?)` - Take screenshots
- `browser_snapshot()` - Get accessibility tree
- `getText(selector, all?)` - Get element text
- `evaluate(expression)` - Execute JavaScript
- `waitForSelector(selector, options?)` - Wait for elements

## Navigation Best Practices

Based on real-world usage patterns, here are recommended practices for effective browser automation:

### 1. Always Take Snapshots After Page Changes

The most important pattern is to use `browser_snapshot()` after any action that changes the page:

```javascript
// Navigate to a page
await navigate({ url: "https://example.com" });
// IMPORTANT: Take a snapshot to understand the page structure
await browser_snapshot();

// Click an element
await click({ selector: "button.submit" });
// IMPORTANT: Take another snapshot to see what changed
await browser_snapshot();
```

### 2. Use Snapshots to Find Elements

Before attempting to interact with elements, take a snapshot to understand the page structure:

```javascript
// First, understand what's on the page
const snapshot = await browser_snapshot();
// The snapshot shows element references like [0], [1], [2] with their roles and text
// Use these references or create selectors based on the structure

// Click using a reference from the snapshot
await click({ ref: "[5]" }); // Click the element labeled [5] in the snapshot
```

### 3. Prefer Semantic Selectors

Use Playwright's powerful selector engine for more reliable automation:

- `text=` for text content: `click({ selector: "text=Sign In" })`
- `role=` for ARIA roles: `click({ selector: "role=button[name='Submit']" })`
- Combine selectors: `fill({ selector: "role=textbox[name='Email']", value: "test@example.com" })`

### 4. Handle Dynamic Content

For pages with dynamic content:

```javascript
// Wait for content to load
await waitForSelector({ selector: "div.results", state: "visible" });
// Then take a snapshot to see what loaded
await browser_snapshot();
```

### 5. Verify Actions Succeeded

Always verify that your actions had the intended effect:

```javascript
// Fill a form field
await fill({ selector: "input#username", value: "testuser" });
// Take a snapshot to confirm the value was entered
await browser_snapshot();

// For navigation, check the page info
await navigate({ url: "https://example.com/login" });
const info = await getPageInfo();
// Verify we're on the right page
```

### Common Pitfalls to Avoid

1. **Not taking snapshots**: Without snapshots, you're navigating blind
2. **Using generic selectors**: Prefer specific text or role selectors over generic CSS
3. **Not waiting for dynamic content**: Use `waitForSelector` before interacting
4. **Assuming page structure**: Always verify with a snapshot first

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

### Running in Development Mode

```bash
npm run dev
```

### Building

```bash
npm run build
```

### Testing

```bash
# Test basic MCP connection
npm test

# Test tool registration
npm run test-tools

# Test MCP Inspector compatibility
npm run test-inspector

# Test direct Inspector-style requests
npm run test-direct

# Test browser waiting behavior
npm run test-waiting

# Launch MCP Inspector for interactive testing
npm run inspect
```

### Linting

```bash
npm run lint
```

## Architecture

```
MCP Client <-> MCP Server <-> CDP (localhost:9222) <-> Electron Browser
```

The server connects to the Electron browser's CDP endpoint and translates MCP tool calls into Playwright automation commands, providing a seamless interface for AI assistants to control the browser.