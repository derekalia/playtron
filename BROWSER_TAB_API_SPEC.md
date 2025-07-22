# Browser Tab Management API Specification

## Overview

This document specifies a tab management API that should be implemented in the Electron browser project. This API will allow the MCP server to manage browser tabs through a clean, well-defined interface instead of the current indirect approach using page evaluation.

## Architecture

The browser should expose tab management functionality through an HTTP REST API on a separate port from the CDP endpoint. This provides a clean separation between browser automation (CDP) and browser management (tabs).

```
MCP Server → HTTP API (port 9223) → Electron Browser Tab Manager
         └→ CDP (port 9222) → Chrome DevTools Protocol
```

## API Endpoints

### Base URL
```
http://localhost:9223/api
```

### 1. List All Tabs
**GET** `/tabs`

Returns a list of all browser tabs with their current state.

**Response:**
```json
{
  "tabs": [
    {
      "id": "tab-1234567890",
      "url": "https://example.com",
      "title": "Example Domain",
      "cdpTargetId": "6B7C6B4A5D9E8F7A6B5C4D3E2F1A",
      "isActive": true,
      "createdAt": "2025-01-21T10:30:00Z",
      "lastAccessedAt": "2025-01-21T10:35:00Z"
    },
    {
      "id": "tab-0987654321",
      "url": "https://google.com",
      "title": "Google",
      "cdpTargetId": "7C8D7C5B6E0F9G8B7C6D5E4F3G2B",
      "isActive": false,
      "createdAt": "2025-01-21T10:25:00Z",
      "lastAccessedAt": "2025-01-21T10:28:00Z"
    }
  ],
  "activeTabId": "tab-1234567890"
}
```

### 2. Create New Tab
**POST** `/tabs`

Creates a new browser tab and optionally navigates to a URL.

**Request Body:**
```json
{
  "url": "https://example.com",  // Optional, defaults to about:blank or new tab page
  "activate": true                // Optional, whether to switch to the new tab
}
```

**Response:**
```json
{
  "id": "tab-1234567890",
  "url": "https://example.com",
  "title": "New Tab",
  "cdpTargetId": "6B7C6B4A5D9E8F7A6B5C4D3E2F1A",
  "isActive": true,
  "createdAt": "2025-01-21T10:30:00Z"
}
```

### 3. Get Tab Details
**GET** `/tabs/{tabId}`

Returns detailed information about a specific tab.

**Response:**
```json
{
  "id": "tab-1234567890",
  "url": "https://example.com",
  "title": "Example Domain",
  "cdpTargetId": "6B7C6B4A5D9E8F7A6B5C4D3E2F1A",
  "isActive": true,
  "createdAt": "2025-01-21T10:30:00Z",
  "lastAccessedAt": "2025-01-21T10:35:00Z",
  "viewport": {
    "width": 1920,
    "height": 1080
  }
}
```

### 4. Switch to Tab
**PUT** `/tabs/{tabId}/activate`

Makes the specified tab the active tab.

**Response:**
```json
{
  "success": true,
  "previousActiveTabId": "tab-0987654321",
  "newActiveTabId": "tab-1234567890"
}
```

### 5. Close Tab
**DELETE** `/tabs/{tabId}`

Closes the specified tab.

**Query Parameters:**
- `force` (boolean): Force close even if it's the last tab

**Response:**
```json
{
  "success": true,
  "closedTabId": "tab-1234567890",
  "remainingTabs": 2
}
```

### 6. Update Tab URL
**PUT** `/tabs/{tabId}/navigate`

Navigates the tab to a new URL.

**Request Body:**
```json
{
  "url": "https://newsite.com",
  "waitUntil": "load"  // Optional: "load", "domcontentloaded", "networkidle"
}
```

**Response:**
```json
{
  "success": true,
  "id": "tab-1234567890",
  "url": "https://newsite.com",
  "title": "New Site"
}
```

### 7. Get CDP Target Mapping
**GET** `/tabs/cdp-targets`

Returns the mapping between tab IDs and CDP target IDs for direct CDP connection.

**Response:**
```json
{
  "targets": {
    "tab-1234567890": {
      "cdpTargetId": "6B7C6B4A5D9E8F7A6B5C4D3E2F1A",
      "type": "page",
      "url": "https://example.com"
    },
    "tab-0987654321": {
      "cdpTargetId": "7C8D7C5B6E0F9G8B7C6D5E4F3G2B",
      "type": "page",
      "url": "https://google.com"
    }
  }
}
```

## Implementation Details

### 1. Tab ID Generation
- Use a consistent format: `tab-{timestamp}{random}`
- Example: `tab-1737456789012-a3b2c1`
- IDs must be unique and persistent for the tab's lifetime

### 2. CDP Target ID Mapping
The browser must maintain a mapping between:
- Tab IDs (your internal identifiers)
- CDP Target IDs (Chrome DevTools Protocol identifiers)
- Electron WebContents IDs

This allows the MCP server to:
1. Get a tab ID from your API
2. Find the corresponding CDP target
3. Connect directly to that target via Playwright

### 3. Error Handling
All endpoints should return appropriate HTTP status codes:
- `200 OK` - Success
- `201 Created` - Tab created successfully
- `404 Not Found` - Tab ID not found
- `400 Bad Request` - Invalid request parameters
- `500 Internal Server Error` - Server error

Error Response Format:
```json
{
  "error": {
    "code": "TAB_NOT_FOUND",
    "message": "Tab with ID tab-1234567890 not found",
    "details": {}
  }
}
```

### 4. Events (Optional but Recommended)
Consider adding WebSocket support for real-time tab events:

**WebSocket Endpoint:** `ws://localhost:9223/api/tabs/events`

**Event Types:**
```json
{
  "event": "tab.created",
  "data": {
    "id": "tab-1234567890",
    "url": "https://example.com",
    "cdpTargetId": "6B7C6B4A5D9E8F7A6B5C4D3E2F1A"
  }
}

{
  "event": "tab.closed",
  "data": {
    "id": "tab-1234567890"
  }
}

{
  "event": "tab.activated",
  "data": {
    "id": "tab-1234567890",
    "previousActiveId": "tab-0987654321"
  }
}

{
  "event": "tab.navigated",
  "data": {
    "id": "tab-1234567890",
    "url": "https://newsite.com",
    "title": "New Site"
  }
}
```

## Electron Implementation Guide

### 1. Server Setup
```typescript
import express from 'express';
import { BrowserWindow, WebContents } from 'electron';

const app = express();
app.use(express.json());

// Start API server
app.listen(9223, 'localhost', () => {
  console.log('Tab Management API running on http://localhost:9223');
});
```

### 2. Tab Manager Class
```typescript
interface Tab {
  id: string;
  webContentsId: number;
  cdpTargetId: string;
  url: string;
  title: string;
  isActive: boolean;
  createdAt: Date;
  lastAccessedAt: Date;
}

class TabManager {
  private tabs: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private window: BrowserWindow;

  constructor(window: BrowserWindow) {
    this.window = window;
    this.setupCDPMapping();
  }

  private setupCDPMapping() {
    // Listen for CDP target creation to map WebContents to CDP targets
    this.window.webContents.debugger.on('target-created', (event, targetInfo) => {
      // Map the CDP target ID to our tab
      this.updateCDPMapping(targetInfo);
    });
  }

  createTab(url?: string, activate = true): Tab {
    const id = this.generateTabId();
    const webContents = this.createWebContents(url);
    
    // Get CDP target ID for this WebContents
    const cdpTargetId = this.getCDPTargetId(webContents);
    
    const tab: Tab = {
      id,
      webContentsId: webContents.id,
      cdpTargetId,
      url: webContents.getURL(),
      title: webContents.getTitle(),
      isActive: activate,
      createdAt: new Date(),
      lastAccessedAt: new Date()
    };
    
    this.tabs.set(id, tab);
    
    if (activate) {
      this.activateTab(id);
    }
    
    return tab;
  }

  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  }

  private getCDPTargetId(webContents: WebContents): string {
    // Implementation to get CDP target ID from WebContents
    // This might require using webContents.debugger API
    return webContents.debugger.getTarget().id;
  }
}
```

### 3. API Route Implementation
```typescript
// GET /api/tabs
app.get('/api/tabs', (req, res) => {
  const tabs = Array.from(tabManager.getAllTabs());
  res.json({
    tabs,
    activeTabId: tabManager.getActiveTabId()
  });
});

// POST /api/tabs
app.post('/api/tabs', async (req, res) => {
  try {
    const { url, activate } = req.body;
    const tab = await tabManager.createTab(url, activate);
    res.status(201).json(tab);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'TAB_CREATION_FAILED',
        message: error.message
      }
    });
  }
});

// PUT /api/tabs/:tabId/activate
app.put('/api/tabs/:tabId/activate', (req, res) => {
  const { tabId } = req.params;
  try {
    const result = tabManager.activateTab(tabId);
    res.json(result);
  } catch (error) {
    res.status(404).json({
      error: {
        code: 'TAB_NOT_FOUND',
        message: `Tab ${tabId} not found`
      }
    });
  }
});
```

### 4. CORS Configuration
Since the MCP server will be calling from a different port, enable CORS:

```typescript
import cors from 'cors';

app.use(cors({
  origin: ['http://localhost:*', 'http://127.0.0.1:*'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
```

### 5. Integration with Existing Browser
The browser should:
1. Start the API server when the browser starts
2. Maintain the tab state throughout the browser lifetime
3. Handle tab events (creation, closing, navigation) and update the state
4. Expose the CDP target IDs for each tab

## Benefits for MCP Server

With this API, the MCP server can:

1. **Simplify Tab Management:**
```typescript
// Before (complex, indirect)
const tabId = await mainPage.evaluate(async (url) => {
  return await window.electronAPI.createTab(url);
}, url);

// After (simple, direct)
const response = await fetch('http://localhost:9223/api/tabs', {
  method: 'POST',
  body: JSON.stringify({ url })
});
const tab = await response.json();
```

2. **Direct CDP Connection:**
```typescript
// Get CDP target ID from API
const { cdpTargetId } = tab;

// Connect directly to the target
const page = await browser.pageFromTarget(cdpTargetId);
```

3. **Better State Management:**
- No need to track tab-to-page mappings in MCP
- Browser is the single source of truth
- Cleaner error handling

## Testing

Include tests for:
1. Creating multiple tabs
2. Switching between tabs
3. Closing tabs (including edge cases like last tab)
4. Tab state persistence
5. Error cases (invalid tab IDs, network errors)
6. Concurrent operations

## Security Considerations

1. **Local Only**: Bind the API server to localhost only
2. **Authentication**: Consider adding a simple token-based auth if needed
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **Input Validation**: Validate all inputs, especially URLs

## Migration Path

1. Implement the API in the browser project
2. Test thoroughly with mock clients
3. Update MCP server to use the new API
4. Deprecate the old `window.electronAPI` approach
5. Remove old code after successful migration