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
- The Electron browser component must be running with:
  - CDP enabled on port 9222 (required)
  - Tab Management API on port 9223 (optional but recommended)

### Starting the Browser

The MCP server requires the Electron browser to be running with both CDP and Tab API:

```bash
# From the project root
cd browser-test && npm run dev
```

The browser should expose:
- Chrome DevTools Protocol on `http://localhost:9222` (required)
- Tab Management API on `http://localhost:9223/api` (optional)

The server will automatically detect which services are available and use the appropriate mode.

## Installation

```bash
cd playtron
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

Add to your MCP client's configuration file:

```json
{
  "mcpServers": {
    "electron-browser": {
      "command": "npm",
      "args": ["start"],
      "cwd": "/absolute/path/to/playtron"
    }
  }
}
```

## Available MCP Tools (28 Total)

### Navigation (5 tools)
- `browser_navigate` - Navigate to URL with wait options and timeout handling
- `browser_navigate_back` - Go back in browser history
- `browser_navigate_forward` - Go forward in browser history
- `browser_reload` - Reload the current page
- `browser_page_info` - Get current page URL and title

### Mouse Interaction (6 tools)
- `browser_click` - Click elements using Playwright selectors with auto-scroll
- `browser_hover` - Hover over elements
- `browser_drag` - Drag from one element to another
- `browser_mouse_click_xy` - Click at specific coordinates
- `browser_mouse_move_xy` - Move mouse to specific coordinates
- `browser_mouse_drag_xy` - Drag between coordinates

### Keyboard Interaction (5 tools)
- `browser_type` - Type text with configurable delay
- `browser_fill` - Fill input fields instantly
- `browser_press_key` - Press keyboard keys (e.g., Enter, Escape)
- `browser_select_option` - Select dropdown options
- `browser_set_checked` - Check/uncheck checkboxes and radio buttons

### Page Inspection (5 tools)
- `browser_snapshot` - Extract page structure with element references
- `browser_take_screenshot` - Capture full page or element screenshots
- `browser_get_text` - Get text using Playwright selectors
- `browser_evaluate` - Execute JavaScript in page context
- `browser_page_info` - Get current page metadata

### Tab Management (4 tools)
- `browser_tab_new` - Create new browser tabs with optional URL
- `browser_tab_select` - Switch between tabs by ID
- `browser_tab_list` - List all tabs with URLs and titles
- `browser_tab_close` - Close specific tabs

### Browser Control (2 tools)
- `browser_close` - Close the browser
- `browser_resize` - Resize browser viewport

### Wait Operations (2 tools)
- `browser_wait_for` - Wait for navigation, network idle, or timeout
- `browser_wait_for_selector` - Wait for elements to appear

All tools support Playwright's powerful selector engine including CSS, XPath, text=, role=, and more.


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
npm start          # Start MCP server with process name "playtron-mcp-server"
npm run dev        # Development mode (same as start)
npm run stop       # Gracefully stop all Playtron processes
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

## Process Management

### Starting the Server
The server runs with a descriptive process name `playtron-mcp-server` for easy identification:
```bash
npm start   # Starts with wrapper that manages the process lifecycle
```

### Stopping the Server
To gracefully stop all Playtron processes:
```bash
npm run stop   # Sends SIGTERM, waits 5s, then SIGKILL if needed
```

### Emergency Cleanup
If processes become orphaned:
```bash
./cleanup-playtron.sh   # Interactive cleanup of all Playtron processes
```

### Process Information
- Process info stored in `.playtron.process.json`
- Legacy lock file in `.playtron.lock`
- Wrapper process manages child lifecycle
- Graceful shutdown on SIGINT (Ctrl+C), SIGTERM, SIGHUP
- 10-second cleanup timeout before force exit

### Control-C Handling
The server handles Control-C (SIGINT) gracefully:
1. Wrapper catches the signal first
2. Forwards signal to child process
3. Waits up to 5 seconds for graceful shutdown
4. Cleans up resources (browser connection, lock files)
5. Exits cleanly

You can test Control-C handling with:
```bash
./test-sigint.sh   # Automated test of Control-C behavior
```

## Architecture

### Communication Flow

#### New Architecture (with Tab API)
```
MCP Client <-> MCP Server (stdio/httpStream) <-> HTTP API (localhost:9223) <-> Browser Tab Manager
                                             └-> CDP (localhost:9222) <-> Direct page connection
```

#### Legacy Architecture (fallback)
```
MCP Client <-> MCP Server (stdio/httpStream) <-> Find Control Page <-> page.evaluate() <-> window.electronAPI <-> Browser
                                             └-> CDP (localhost:9222) <-┘
```

### Core Components
- **MCP Server** (`src/index.ts`) - FastMCP server with modular tool architecture
- **CDP Connector** (`src/playwright-cdp-connector.ts`) - Manages CDP connections and page state
- **Tab API Client** (`src/tab-api-client.ts`) - HTTP client for Tab Management API
- **Tool Modules** (`src/tools/`) - 28 browser automation tools organized by capability

### Tool Organization
Tools are organized by capability:
- **Navigation**: browser_navigate, browser_navigate_back, browser_navigate_forward, browser_reload
- **Mouse**: browser_click, browser_hover, browser_drag, browser_mouse_click_xy, browser_mouse_move_xy, browser_mouse_drag_xy
- **Keyboard**: browser_press_key, browser_type, browser_fill, browser_select_option, browser_set_checked
- **Inspection**: browser_snapshot, browser_take_screenshot, browser_evaluate, browser_get_text, browser_page_info
- **Tabs**: browser_tab_new, browser_tab_select, browser_tab_list, browser_tab_close
- **Control**: browser_close, browser_resize
- **Wait**: browser_wait_for, browser_wait_for_selector

### Tab Management Modes
The server supports two modes for tab management:

1. **Tab API Mode** (Recommended)
   - Direct HTTP API calls to `localhost:9223`
   - Clean separation between browser state and automation
   - Reliable tab creation, switching, and listing
   - No need to search for control pages
   - Better error handling and performance

2. **Legacy Mode** (Fallback)
   - Falls back when Tab API is not available
   - Uses page evaluation through control pages
   - Requires finding and communicating with special control pages
   - More complex but ensures backward compatibility

## Related Documentation

For more information:
- Main project README: `../README.md`
- Browser component documentation: `../browser-test/README.md`
- Development guide: `../CLAUDE.md`


# Cursor Code MCP Server Setup

## Current Status
✅ **MCP Server is fully compatible with Cursor Code!**
- FastMCP version: 3.9.0
- JSON-RPC 2.0 compliant
- 18 browser automation tools available
- All required protocols implemented

## Configuration Options for Cursor Code

### Option 1: Cursor Settings (Recommended)

1. **Open Cursor Code Settings**
   - Press `Cmd+,` (Mac) or `Ctrl+,` (Windows/Linux)
   - Or go to `Cursor > Settings`

2. **Search for "MCP" or "Model Context Protocol"**

3. **Add MCP Server Configuration**
   ```json
   {
     "name": "electron-browser",
     "description": "Electron Browser Automation",
     "command": "npm",
     "args": ["start"],
     "cwd": "/Users/derekalia/electron-browser/playtron",
     "enabled": true
   }
   ```

### Option 2: Cursor Workspace Settings

1. **Create `.cursor/settings.json` in your workspace**
   ```json
   {
     "mcp.servers": {
       "electron-browser": {
         "command": "npm",
         "args": ["start"],
         "cwd": "/Users/derekalia/electron-browser/playtron"
       }
     }
   }
   ```

### Option 3: Global Cursor Configuration

1. **Edit Cursor's global config** (usually in `~/.cursor/config.json`)
   ```json
   {
     "mcpServers": {
       "electron-browser": {
         "command": "npm",
         "args": ["start"],
         "cwd": "/Users/derekalia/electron-browser/playtron"
       }
     }
   }
   ```

## Testing the Setup

### 1. Start the Services
```bash
# Terminal 1: Start browser
cd /Users/derekalia/electron-browser/browser-test
npm run dev

# Terminal 2: Start MCP server
cd /Users/derekalia/electron-browser/playtron
npm start
```

### 2. Test in Cursor Code
Try these commands in Cursor Code:

**Basic Test:**
```
@electron-browser List available tools
```

**Navigation Test:**
```
@electron-browser Navigate to https://example.com
```

**Screenshot Test:**
```
@electron-browser Take a screenshot of the current page
```

**Tab Management Test:**
```
@electron-browser Create a new tab and navigate to https://google.com
```

## Available Tools

Once configured, you'll have access to these 18 browser automation tools:

### Navigation Tools
- `navigate` - Navigate to URL
- `goBack` - Go back in history
- `goForward` - Go forward in history
- `reload` - Reload current page
- `getPageInfo` - Get page URL and title

### Tab Management
- `createTab` - Create new tab
- `switchTab` - Switch to specific tab
- `listTabs` - List all tabs

### Page Interaction
- `click` - Click elements
- `type` - Type text
- `fill` - Fill forms
- `selectOption` - Select dropdown options
- `setChecked` - Check/uncheck boxes

### Page Inspection
- `screenshot` - Take screenshots
- `browser_snapshot` - Get accessibility tree
- `getText` - Get element text
- `evaluate` - Execute JavaScript
- `waitForSelector` - Wait for elements

## Troubleshooting

### "0 tools enabled" (Red indicator)
- This means Cursor Code can't connect to the MCP server
- Check that the MCP server is running: `npm start`
- Verify the configuration paths are correct
- Restart Cursor Code after configuration changes

### "CDP endpoint not available"
- This means the browser isn't running
- Start the browser first: `cd ../browser-test && npm run dev`
- Wait for the browser to fully load before using tools

### Tools not appearing
- Check Cursor Code's MCP configuration
- Verify the MCP server is running and showing "Server started successfully"
- Try restarting Cursor Code

## Expected Logs

### MCP Server (Working)
```
[MCP-CDP] Server started successfully
[MCP-CDP] ensureConnected called (request #1)
[PlaywrightCDP] Successfully connected to Electron browser
```

### Browser (Working)
```
[Electron-CDP] Remote debugging enabled on port 9222
[Electron] Created tab 1752692639229 with URL: https://www.google.com
```

## Need Help?

Run the compatibility test to verify everything is working:
```bash
cd /Users/derekalia/electron-browser/playtron
node test-fastmcp-compatibility.js
```

This should show "✅ FULLY COMPATIBLE with Cursor Code!" if everything is set up correctly.