# MCP Server Migration Plan for Browser Tab API

## Overview

This document outlines the changes required in the MCP server (playtron) to migrate from the current page evaluation approach to the new HTTP API-based tab management system.

## Current vs New Architecture

### Current Approach
```
MCP Server → Find Control Page → page.evaluate() → window.electronAPI → Browser
```

### New Approach
```
MCP Server → HTTP API (port 9223) → Browser Tab Manager
         └→ CDP (port 9222) → Direct page connection
```

## Migration Tasks

### 1. Add HTTP Client for Tab API

Create a new module `src/tab-api-client.ts`:

```typescript
interface TabInfo {
  id: string;
  url: string;
  title: string;
  cdpTargetId: string;
  isActive: boolean;
  createdAt: string;
  lastAccessedAt?: string;
}

interface TabApiResponse {
  tabs?: TabInfo[];
  activeTabId?: string;
  success?: boolean;
  error?: {
    code: string;
    message: string;
  };
}

export class TabApiClient {
  private baseUrl: string = 'http://localhost:9223/api';
  
  async listTabs(): Promise<TabInfo[]> {
    const response = await fetch(`${this.baseUrl}/tabs`);
    const data: TabApiResponse = await response.json();
    return data.tabs || [];
  }
  
  async createTab(url?: string, activate = true): Promise<TabInfo> {
    const response = await fetch(`${this.baseUrl}/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, activate })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to create tab');
    }
    
    return response.json();
  }
  
  async switchTab(tabId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tabs/${tabId}/activate`, {
      method: 'PUT'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to switch tab');
    }
  }
  
  async closeTab(tabId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/tabs/${tabId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to close tab');
    }
  }
  
  async getCdpTargets(): Promise<Record<string, { cdpTargetId: string; type: string; url: string }>> {
    const response = await fetch(`${this.baseUrl}/tabs/cdp-targets`);
    const data = await response.json();
    return data.targets;
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/tabs`, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(1000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### 2. Update PlaywrightCDPConnector

Modify `src/playwright-cdp-connector.ts` to remove the indirect tab management:

```typescript
import { TabApiClient } from './tab-api-client';

export class PlaywrightCDPConnector {
  private tabApiClient: TabApiClient;
  
  constructor() {
    this.tabApiClient = new TabApiClient();
    // ... existing initialization
  }
  
  /**
   * Create a new tab using the Tab API
   */
  async createTab(url: string = 'https://www.google.com'): Promise<string> {
    console.log(`[PlaywrightCDP] Creating new tab with URL: ${url}`);
    
    try {
      // Use the new API
      const tab = await this.tabApiClient.createTab(url);
      
      // Wait for CDP to recognize the new target
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Connect to the new tab's CDP target
      const page = await this.connectToTarget(tab.cdpTargetId);
      
      if (page) {
        this.tabPageMap.set(tab.id, page);
        this.pageToTabMap.set(page, tab.id);
        this.currentTabId = tab.id;
        console.log(`[PlaywrightCDP] Created and connected to tab ${tab.id}`);
      }
      
      return tab.id;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to create tab:', error);
      throw error;
    }
  }
  
  /**
   * Switch to a specific tab using the Tab API
   */
  async switchTab(tabId: string): Promise<boolean> {
    console.log(`[PlaywrightCDP] Switching to tab: ${tabId}`);
    
    try {
      // Use the new API
      await this.tabApiClient.switchTab(tabId);
      
      // Update our local state
      if (this.tabPageMap.has(tabId)) {
        this.page = this.tabPageMap.get(tabId) || null;
        this.currentTabId = tabId;
      } else {
        // Need to connect to this tab's CDP target
        const tabs = await this.tabApiClient.listTabs();
        const tab = tabs.find(t => t.id === tabId);
        
        if (tab) {
          const page = await this.connectToTarget(tab.cdpTargetId);
          if (page) {
            this.tabPageMap.set(tab.id, page);
            this.pageToTabMap.set(page, tab.id);
            this.page = page;
            this.currentTabId = tab.id;
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to switch tab:', error);
      throw error;
    }
  }
  
  /**
   * List all tabs using the Tab API
   */
  async listTabs(): Promise<any[]> {
    console.log('[PlaywrightCDP] Listing all tabs');
    
    try {
      const tabs = await this.tabApiClient.listTabs();
      
      return tabs.map(tab => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        isActive: tab.isActive || tab.id === this.currentTabId
      }));
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to list tabs:', error);
      throw error;
    }
  }
  
  /**
   * Connect to a specific CDP target
   */
  private async connectToTarget(targetId: string): Promise<Page | null> {
    if (!this.browser) {
      throw new Error('Browser not connected');
    }
    
    try {
      // Get all targets
      const targets = this.browser.targets();
      const target = targets.find(t => t.url() !== '' && t.type() === 'page');
      
      if (target) {
        const page = await target.page();
        if (page) {
          this.setupPageListeners(page);
          return page;
        }
      }
      
      return null;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to connect to target:', error);
      return null;
    }
  }
  
  /**
   * Remove old methods that won't be needed:
   * - ensureCorrectPage() - simplified since we track tabs directly
   * - Finding control pages logic
   * - page.evaluate() calls to window.electronAPI
   */
}
```

### 3. Update Connection Logic

Modify the connection sequence in `src/index.ts`:

```typescript
async function waitForBrowserAndApi(cdpEndpoint: string, apiEndpoint: string): Promise<void> {
  console.log('[MCP-CDP] Waiting for browser and Tab API to be available...');
  
  while (true) {
    try {
      // Check CDP endpoint
      const cdpResponse = await fetch(`${cdpEndpoint}/json/version`);
      if (!cdpResponse.ok) throw new Error('CDP not ready');
      
      // Check Tab API endpoint
      const tabApiClient = new TabApiClient();
      const apiAvailable = await tabApiClient.isAvailable();
      
      if (apiAvailable) {
        console.log('[MCP-CDP] Both CDP and Tab API are available');
        return;
      } else {
        console.log('[MCP-CDP] Tab API not yet available...');
      }
    } catch (error) {
      console.log('[MCP-CDP] Browser or API not ready, retrying in 5 seconds...');
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Update the server initialization
server.init({
  name: 'mcp-cdp',
  description: 'Control Electron browser via Chrome DevTools Protocol',
  tools,
  config: {
    middleware: [
      async (req, next) => {
        if (requestCounter === 0) {
          await waitForBrowserAndApi(
            'http://localhost:9222',
            'http://localhost:9223'
          );
        }
        // ... rest of middleware
      }
    ]
  }
});
```

### 4. Update Tab Management Tools

Update `src/tools/tabs.ts` to handle the new approach:

```typescript
export const browserTabNew = defineTool({
  name: 'browser_tab_new',
  description: 'Create a new browser tab with optional URL',
  input: tabsSchema.tabNew,
  output: tabsSchema.result,
  handler: async ({ url }, connector) => {
    try {
      const tabId = await connector.createTab(url);
      
      return {
        success: true,
        tabId,
        message: `Created new tab: ${tabId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create tab: ${error.message}`
      };
    }
  }
});

export const browserTabSelect = defineTool({
  name: 'browser_tab_select',
  description: 'Switch to a specific tab by ID',
  input: tabsSchema.tabSelect,
  output: tabsSchema.result,
  handler: async ({ tabId }, connector) => {
    try {
      const success = await connector.switchTab(tabId);
      
      if (success) {
        return {
          success: true,
          message: `Switched to tab: ${tabId}`
        };
      } else {
        return {
          success: false,
          error: 'Failed to switch tab'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to switch tab: ${error.message}`
      };
    }
  }
});

export const browserTabClose = defineTool({
  name: 'browser_tab_close',
  description: 'Close a specific tab',
  input: tabsSchema.tabClose,
  output: tabsSchema.result,
  handler: async ({ tabId }, connector) => {
    try {
      const tabApiClient = new TabApiClient();
      await tabApiClient.closeTab(tabId);
      
      // Clean up our internal state
      connector.removeTab(tabId);
      
      return {
        success: true,
        message: `Closed tab: ${tabId}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to close tab: ${error.message}`
      };
    }
  }
});
```

### 5. Add Fallback Behavior

Implement graceful fallback for when the Tab API is not available:

```typescript
export class PlaywrightCDPConnector {
  private useTabApi: boolean = false;
  
  async checkTabApiAvailability(): Promise<void> {
    this.useTabApi = await this.tabApiClient.isAvailable();
    
    if (!this.useTabApi) {
      console.warn('[PlaywrightCDP] Tab API not available, using legacy approach');
    }
  }
  
  async createTab(url: string = 'https://www.google.com'): Promise<string> {
    if (this.useTabApi) {
      // Use new API
      return this.createTabViaApi(url);
    } else {
      // Fall back to old approach
      return this.createTabLegacy(url);
    }
  }
}
```

### 6. Update Error Handling

Add specific error handling for API failures:

```typescript
class TabApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'TabApiError';
  }
}

// In API calls
async createTab(url?: string, activate = true): Promise<TabInfo> {
  try {
    const response = await fetch(`${this.baseUrl}/tabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, activate })
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new TabApiError(
        data.error?.code || 'UNKNOWN_ERROR',
        data.error?.message || 'Failed to create tab',
        response.status
      );
    }
    
    return response.json();
  } catch (error) {
    if (error instanceof TabApiError) throw error;
    
    // Network or other errors
    throw new TabApiError(
      'API_UNAVAILABLE',
      'Tab API is not available',
      503
    );
  }
}
```

### 7. Update Tests

Create new test files for the Tab API integration:

`test-tab-api.js`:
```javascript
const TabApiClient = require('./dist/tab-api-client').TabApiClient;

async function testTabApi() {
  const client = new TabApiClient();
  
  console.log('Testing Tab API availability...');
  const available = await client.isAvailable();
  console.log('API Available:', available);
  
  if (!available) {
    console.log('Tab API not running. Please start the browser with Tab API enabled.');
    return;
  }
  
  console.log('\nListing tabs...');
  const tabs = await client.listTabs();
  console.log('Current tabs:', tabs);
  
  console.log('\nCreating new tab...');
  const newTab = await client.createTab('https://example.com');
  console.log('Created tab:', newTab);
  
  console.log('\nSwitching tabs...');
  await client.switchTab(newTab.id);
  console.log('Switched to tab:', newTab.id);
}

testTabApi().catch(console.error);
```

### 8. Update Documentation

Update `README.md` to document the new requirements:

```markdown
## Prerequisites

- Node.js 18+
- The Electron browser component must be running with:
  - CDP enabled on port 9222
  - Tab Management API enabled on port 9223

### Starting the Browser

The MCP server requires the Electron browser to be running with both CDP and Tab API:

```bash
# From the project root
cd browser-test && npm run dev
```

The browser should expose:
- Chrome DevTools Protocol on `http://localhost:9222`
- Tab Management API on `http://localhost:9223/api`
```

### 9. Update Package.json

Add new test scripts:

```json
{
  "scripts": {
    "test-tab-api": "node test-tab-api.js",
    "test-migration": "node test-migration.js"
  }
}
```

## Migration Timeline

### Phase 1: Preparation (Current)
1. ✅ Create API specification for browser team
2. ✅ Create migration plan (this document)
3. Add Tab API client module
4. Add fallback support

### Phase 2: Implementation
1. Browser team implements Tab API
2. Test Tab API with mock client
3. Update MCP server to use new API with fallback
4. Test both old and new approaches work

### Phase 3: Migration
1. Enable new API by default
2. Deprecation warnings for old approach
3. Full testing with real browser
4. Update all documentation

### Phase 4: Cleanup
1. Remove legacy code
2. Remove fallback logic
3. Simplify PlaywrightCDPConnector
4. Final testing

## Benefits After Migration

1. **Cleaner Code**: Remove ~200 lines of complex page-finding logic
2. **Better Reliability**: Direct API calls instead of page evaluation
3. **Improved Performance**: No need to search for control pages
4. **Easier Debugging**: Clear API endpoints and error messages
5. **Better Separation**: Browser manages browser state, MCP manages automation

## Testing Checklist

- [ ] Tab API client connects successfully
- [ ] Can create new tabs via API
- [ ] Can switch between tabs
- [ ] Can close tabs
- [ ] CDP target mapping works correctly
- [ ] All MCP tools continue to work
- [ ] Fallback to legacy mode works
- [ ] Error handling for API failures
- [ ] Performance is acceptable
- [ ] No memory leaks with multiple tabs