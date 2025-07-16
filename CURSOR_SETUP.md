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
     "cwd": "/Users/derekalia/electron-browser/mcp-server",
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
         "cwd": "/Users/derekalia/electron-browser/mcp-server"
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
         "cwd": "/Users/derekalia/electron-browser/mcp-server"
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
cd /Users/derekalia/electron-browser/mcp-server
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
cd /Users/derekalia/electron-browser/mcp-server
node test-fastmcp-compatibility.js
```

This should show "✅ FULLY COMPATIBLE with Cursor Code!" if everything is set up correctly.