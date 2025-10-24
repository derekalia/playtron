# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a TypeScript MCP (Model Context Protocol) server called "playtron" that enables browser automation through the Chrome DevTools Protocol (CDP). The server acts as a bridge between MCP clients (like AI assistants) and an Electron browser, providing 28 browser automation tools organized in a modular architecture.

**Repository**: https://github.com/derekalia/playtron
**Package**: Available on npm as `playtron`

## Development Commands

### Build and Development
- `npm run build` - Compile TypeScript to JavaScript in dist/
- `npm run lint` - Run ESLint on TypeScript source files
- `npm start` - Run the compiled server (requires build first)
- `npm run dev` - Run from source with tsx (no build needed)

### Installation
Install globally:
```bash
npm install -g playtron
playtron
```

Or use with npx (no installation):
```bash
npx playtron
```

### Running the Browser
Before starting the MCP server, the Electron browser must be running:
```bash
cd ../browser-test && npm run dev
```

## Architecture

### Project Structure
```
playtron/
├── src/
│   ├── index.ts              # Main server entry with FastMCP setup
│   ├── playwright-cdp-connector.ts  # CDP connection manager
│   ├── tools.ts              # Tool aggregation/exports
│   └── tools/                # Modular tool implementations
│       ├── common.ts         # Browser management
│       ├── evaluate.ts       # JavaScript execution
│       ├── keyboard.ts       # Keyboard/text input
│       ├── mouse.ts          # Mouse interactions
│       ├── navigate.ts       # Navigation tools
│       ├── screenshot.ts     # Screenshot capture
│       ├── snapshot.ts       # Accessibility snapshots
│       ├── tabs.ts           # Tab management
│       ├── tool.ts           # Tool definition utilities
│       └── wait.ts           # Wait/polling tools
```

### Communication Flow
```
MCP Client <-> MCP Server (stdio/httpStream) <-> CDP (localhost:9222) <-> Electron Browser
                                             └-> Tab API (localhost:9223) <-┘
```

### Tool Organization
Tools are organized by capability:
- **Navigation**: browser_navigate, browser_navigate_back, browser_navigate_forward, browser_reload
- **Mouse**: browser_click, browser_hover, browser_drag, browser_mouse_click_xy, browser_mouse_move_xy, browser_mouse_drag_xy
- **Keyboard**: browser_press_key, browser_type, browser_fill, browser_select_option, browser_set_checked
- **Inspection**: browser_snapshot, browser_take_screenshot, browser_evaluate, browser_get_text, browser_page_info
- **Tabs**: browser_tab_new, browser_tab_select, browser_tab_list, browser_tab_close
- **Control**: browser_close, browser_resize
- **Wait**: browser_wait_for, browser_wait_for_selector

### Element Reference System
- The `browser_snapshot` tool generates element references like `[0]`, `[1]`
- These references map to Playwright selectors and can be used in other tools
- Tools accept both element refs and direct Playwright selectors (CSS, XPath, text=, role=)

## Key Dependencies
- **fastmcp** (3.9.0) - MCP server implementation
- **playwright** (1.54.1) - Browser automation
- **zod** (3.22.0) - Schema validation
- **Node.js** ≥18.0.0 required

## Important Notes

1. **Browser Dependency**: The MCP server requires the Electron browser to be running with:
   - CDP on port 9222 (required)
   - Tab API on port 9223 (optional but recommended)
   The server will wait and retry every 5 seconds until the browser is available.

2. **Tab Management**: The server supports two modes:
   - **Tab API Mode**: Clean HTTP API calls for tab management (preferred)
   - **Legacy Mode**: Falls back to page evaluation if Tab API unavailable

3. **Logging**: Extensive logging is provided with prefixes:
   - `[PlaywrightCDP]` - CDP connection and page management
   - `[MCP-CDP]` - MCP tool execution and results
   - `[FastMCP]` - MCP protocol communication

4. **Current Tab State**: The server maintains the current tab state. Tab operations affect this state and subsequent operations use the current tab.

5. **Error Handling**: All tools return consistent error/success results with proper TypeScript types.

6. **Timeout Management**: Most tools have a default 30-second timeout that can be configured.

## MCP Client Configuration

To use playtron with MCP clients like Claude Desktop, add to your config (e.g., `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "playtron": {
      "command": "npx",
      "args": ["-y", "playtron"]
    }
  }
}
```

Or if installed globally:
```json
{
  "mcpServers": {
    "playtron": {
      "command": "playtron"
    }
  }
}
```

## Recent Refactoring

The project was recently refactored from a monolithic structure (958-line index.ts) to a modular architecture matching the Playwright MCP pattern. This improved maintainability and expanded the tool set from 18 to 28 tools.

Additional cleanup removed development-only scripts (start-playtron.js, stop-playtron.sh, etc.) to streamline the package for npm distribution.

## Common Development Tasks

### Adding a New Tool
1. Create or update the appropriate file in `src/tools/`
2. Use the `defineTool` pattern for consistency
3. Export the tool in the module
4. Add the tool to the aggregation in `src/tools.ts`

### Debugging Connection Issues
1. Check if Electron browser is running: `curl http://localhost:9222/json/version`
2. Verify MCP server logs show "Successfully connected to Electron browser"
3. Use MCP Inspector for interactive debugging: `npx @modelcontextprotocol/inspector playtron`