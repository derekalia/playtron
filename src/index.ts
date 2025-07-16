import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { PlaywrightCDPConnector } from './playwright-cdp-connector';
import { Page } from 'playwright';

const server = new FastMCP({
  name: 'electron-browser-cdp',
  version: '1.0.0' as `${number}.${number}.${number}`,
});

// Log server capabilities
console.error('[MCP-CDP] 🔍 FastMCP server type:', typeof server);
console.error('[MCP-CDP] 🔍 FastMCP server methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(server)).filter(m => typeof (server as any)[m] === 'function'));

// Global connector instance
const connector = new PlaywrightCDPConnector();
let isConnected = false;
let requestCount = 0;

// Create a wrapper to log all tool executions
function createLoggingWrapper(originalExecute: Function, toolName: string) {
  return async (args: any) => {
    console.error(`[MCP-CDP] 🔧 Tool ${toolName} called with args:`, JSON.stringify(args, null, 2));
    requestCount++;
    
    try {
      const result = await originalExecute(args);
      console.error(`[MCP-CDP] ✅ Tool ${toolName} completed successfully`);
      return result;
    } catch (error) {
      console.error(`[MCP-CDP] ❌ Tool ${toolName} failed:`, error);
      throw error;
    }
  };
}

// Storage for element references from accessibility snapshots
const elementReferences = new Map<string, string>();

// Enhanced error handling for uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[MCP-CDP] Uncaught Exception:', error);
  console.error('[MCP-CDP] Stack:', error.stack);
  // Don't exit - try to recover
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[MCP-CDP] Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - try to recover
});

// Add heartbeat to show server is alive
setInterval(() => {
  console.error(`[MCP-CDP] Heartbeat - Server alive (PID: ${process.pid}, Requests: ${requestCount})`);
}, 30000);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('[MCP-CDP] Received SIGINT, shutting down gracefully...');
  await cleanup();
});

process.on('SIGTERM', async () => {
  console.error('[MCP-CDP] Received SIGTERM, shutting down gracefully...');
  await cleanup();
});

async function cleanup() {
  if (connector) {
    try {
      await connector.disconnect();
    } catch (error) {
      console.error('[MCP-CDP] Error during disconnect:', error);
    }
  }
  process.exit(0);
}

// Helper function to ensure we're connected
async function ensureConnected(): Promise<Page> {
  console.error(`[MCP-CDP] ensureConnected called (request #${++requestCount})`);
  
  try {
    // First check if browser is available
    const browserAvailable = await checkElectronBrowser();
    if (!browserAvailable) {
      console.error('[MCP-CDP] ⚠️ Browser not available yet. Please start the Electron browser.');
      throw new Error('Electron browser not running. Start it with CDP enabled on port 9222');
    }
    
    if (!isConnected || !connector.isConnected()) {
      console.error('[MCP-CDP] Not connected, establishing connection...');
      await connector.connect();
      isConnected = true;
      console.error('[MCP-CDP] Successfully connected to Electron browser');
    } else {
      console.error('[MCP-CDP] Already connected, reusing connection');
    }
    
    // Ensure we're controlling the correct page (WebContentsView, not the UI)
    await connector.ensureCorrectPage();
    
    const page = connector.getPage();
    if (!page) {
      console.error('[MCP-CDP] ERROR: No page available after connection');
      throw new Error('No page available in Playwright connection');
    }
    
    console.error(`[MCP-CDP] Current page URL: ${page.url()}`);
    
    return page;
  } catch (error) {
    console.error('[MCP-CDP] Error in ensureConnected:', error);
    isConnected = false; // Reset connection state
    throw error;
  }
}

// Tool: Browser snapshot (following Playwright MCP pattern)
server.addTool({
  name: 'browser_snapshot',
  description: 'Capture accessibility snapshot of the current page - better than screenshot for navigation',
  parameters: z.object({}),
  execute: async () => {
    console.error(`[MCP-CDP] Tool: browser_snapshot called (request #${requestCount + 1})`);
    try {
      await ensureConnected();
      
      console.error('[MCP-CDP] Getting page structure...');
      // Get structured page snapshot in YAML format
      const structure = await connector.getSimplifiedPageStructure();
      
      console.error('[MCP-CDP] Formatting snapshot...');
      // Format like Playwright MCP
      const formattedSnapshot = [
        '- Page Snapshot',
        '```yaml',
        structure,
        '```'
      ].join('\n');
      
      console.error('[MCP-CDP] Browser snapshot completed successfully');
      return formattedSnapshot;
    } catch (error) {
      console.error('[MCP-CDP] Browser snapshot failed:', error);
      console.error('[MCP-CDP] Error stack:', (error as Error).stack);
      return `Error capturing snapshot: ${(error as Error).message}`;
    }
  },
});

// Tool: Navigate (using real Playwright) - with robust error handling
server.addTool({
  name: 'navigate',
  description: 'Navigate to a URL (use browser_snapshot after to see the page)',
  parameters: z.object({
    url: z.string().describe('The URL to navigate to'),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional()
      .describe('When to consider navigation finished')
  }),
  execute: async (args) => {
    console.error(`[MCP-CDP] Tool: navigate called to ${args.url} (request #${requestCount + 1})`);
    
    try {
      const page = await ensureConnected();
      console.error('[MCP-CDP] Starting navigation...');
      
      const timeout = 30000;
      let response = null;
      let navigationError = null;
      
      try {
        response = await page.goto(args.url, {
          waitUntil: args.waitUntil as any || 'load',
          timeout: timeout
        });
      } catch (navErr) {
        console.error('[MCP-CDP] Navigation error:', (navErr as Error).message);
        navigationError = navErr;
      }
      
      // Get current state
      let currentUrl = 'unknown';
      let title = 'unknown';
      
      try {
        currentUrl = page.url();
        title = await page.title();
      } catch (stateErr) {
        console.error('[MCP-CDP] Could not get page state:', (stateErr as Error).message);
      }
      
      const result = {
        success: !navigationError,
        url: currentUrl,
        title: title,
        status: response?.status() || (navigationError ? 0 : 200),
        error: navigationError ? (navigationError as Error).message : undefined
      };
      
      console.error('[MCP-CDP] Navigation result:', result);
      
      if (navigationError) {
        return {
          content: [{
            type: "text",
            text: `Navigation failed: ${(navigationError as Error).message}\nCurrent URL: ${currentUrl}\nTitle: ${title}`
          }]
        };
      }
      
      return {
        content: [{
          type: "text",
          text: `Successfully navigated to ${currentUrl}\nTitle: ${title}\nStatus: ${result.status}`
        }]
      };
      
    } catch (error) {
      console.error('[MCP-CDP] Navigate failed:', error);
      console.error('[MCP-CDP] Error stack:', (error as Error).stack);
      
      return {
        content: [{
          type: "text",
          text: `Navigation error: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Click with Playwright's smart selectors
server.addTool({
  name: 'click',
  description: 'Click on an element (use browser_snapshot after to see changes)',
  parameters: z.object({
    selector: z.string().optional().describe('Element selector'),
    ref: z.string().optional().describe('Element reference from snapshot'),
    options: z.object({
      button: z.enum(['left', 'right', 'middle']).optional(),
      clickCount: z.number().optional(),
      delay: z.number().optional(),
      timeout: z.number().optional()
    }).optional()
  }).refine(data => data.selector || data.ref, {
    message: 'Either selector or ref must be provided'
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: click called');
    try {
      const page = await ensureConnected();
      
      let selector = args.selector;
      
      // If ref is provided, resolve it to a selector
      if (args.ref && elementReferences.has(args.ref)) {
        selector = elementReferences.get(args.ref);
        console.error(`[MCP-CDP] Resolved ref ${args.ref} to selector: ${selector}`);
      }
      
      if (!selector) {
        return {
          content: [{
            type: "text",
            text: "Error: No valid selector found. Please provide either a selector or a valid ref."
          }]
        };
      }
      
      await page.click(selector, {
        button: args.options?.button,
        clickCount: args.options?.clickCount,
        delay: args.options?.delay,
        timeout: args.options?.timeout || 30000
      });
      
      return {
        content: [{
          type: "text",
          text: `Successfully clicked element using selector: ${selector}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] Click failed:', error);
      return {
        content: [{
          type: "text",
          text: `Click failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Type text
server.addTool({
  name: 'type',
  description: 'Type text into an element',
  parameters: z.object({
    selector: z.string().describe('Element selector'),
    text: z.string().describe('Text to type'),
    options: z.object({
      delay: z.number().optional().describe('Delay between keystrokes')
    }).optional()
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: type called');
    try {
      const page = await ensureConnected();
      
      await page.type(args.selector, args.text, {
        delay: args.options?.delay
      });
      
      return {
        content: [{
          type: "text",
          text: `Successfully typed "${args.text}" into element with selector: ${args.selector}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] Type failed:', error);
      return {
        content: [{
          type: "text",
          text: `Type failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Fill (faster than type)
server.addTool({
  name: 'fill',
  description: 'Fill an input field instantly',
  parameters: z.object({
    selector: z.string().describe('Element selector'),
    value: z.string().describe('Value to fill')
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: fill called');
    try {
      const page = await ensureConnected();
      
      await page.fill(args.selector, args.value);
      
      return {
        content: [{
          type: "text",
          text: `Successfully filled "${args.value}" into element with selector: ${args.selector}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] Fill failed:', error);
      return {
        content: [{
          type: "text",
          text: `Fill failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Screenshot
server.addTool({
  name: 'screenshot',
  description: 'Take a screenshot of the page or element',
  parameters: z.object({
    fullPage: z.boolean().optional().describe('Capture full page'),
    selector: z.string().optional().describe('Element to capture')
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: screenshot called');
    try {
      const page = await ensureConnected();
      
      let buffer: Buffer;
      if (args.selector) {
        // Screenshot specific element
        const element = await page.locator(args.selector).first();
        buffer = await element.screenshot();
      } else {
        // Full page or viewport
        buffer = await page.screenshot({
          fullPage: args.fullPage
        });
      }
      
      return {
        type: 'image' as const,
        data: buffer.toString('base64'),
        mimeType: 'image/png'
      };
    } catch (error) {
      console.error('[MCP-CDP] Screenshot failed:', error);
      return {
        content: [{
          type: "text",
          text: `Screenshot failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Wait for selector
server.addTool({
  name: 'waitForSelector',
  description: 'Wait for an element to appear',
  parameters: z.object({
    selector: z.string().describe('Element to wait for'),
    options: z.object({
      state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional(),
      timeout: z.number().optional()
    }).optional()
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: waitForSelector called');
    try {
      const page = await ensureConnected();
      
      await page.waitForSelector(args.selector, {
        state: args.options?.state as any,
        timeout: args.options?.timeout
      });
      
      return {
        content: [{
          type: "text",
          text: `Successfully waited for element with selector: ${args.selector}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] WaitForSelector failed:', error);
      return {
        content: [{
          type: "text",
          text: `Wait for selector failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Evaluate JavaScript
server.addTool({
  name: 'evaluate',
  description: 'Execute JavaScript in the page context',
  parameters: z.object({
    expression: z.string().describe('JavaScript to execute')
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: evaluate called');
    try {
      const page = await ensureConnected();
      
      const result = await page.evaluate(args.expression);
      
      return {
        content: [{
          type: "text",
          text: `JavaScript evaluation result: ${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] Evaluate failed:', error);
      return {
        content: [{
          type: "text",
          text: `JavaScript evaluation failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Get text content
server.addTool({
  name: 'getText',
  description: 'Get text content of elements',
  parameters: z.object({
    selector: z.string().describe('Element selector'),
    all: z.boolean().optional().describe('Get all matching elements')
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: getText called');
    try {
      const page = await ensureConnected();
      
      let text: string | string[];
      if (args.all) {
        const elements = await page.locator(args.selector).all();
        const textContents = await Promise.all(elements.map(el => el.textContent()));
        text = textContents.map(content => content || '');
      } else {
        text = await page.locator(args.selector).first().textContent() || '';
      }
      
      return {
        content: [{
          type: "text",
          text: `Text content: ${JSON.stringify(text, null, 2)}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] GetText failed:', error);
      return {
        content: [{
          type: "text",
          text: `Get text failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Navigation tools
server.addTool({
  name: 'goBack',
  description: 'Navigate back in browser history',
  parameters: z.object({}),
  execute: async () => {
    console.error('[MCP-CDP] Tool: goBack called');
    try {
      const page = await ensureConnected();
      await page.goBack();
      return {
        content: [{
          type: "text",
          text: "Successfully navigated back in browser history"
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] GoBack failed:', error);
      return {
        content: [{
          type: "text",
          text: `Go back failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

server.addTool({
  name: 'goForward',
  description: 'Navigate forward in browser history',
  parameters: z.object({}),
  execute: async () => {
    console.error('[MCP-CDP] Tool: goForward called');
    try {
      const page = await ensureConnected();
      await page.goForward();
      return {
        content: [{
          type: "text",
          text: "Successfully navigated forward in browser history"
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] GoForward failed:', error);
      return {
        content: [{
          type: "text",
          text: `Go forward failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

server.addTool({
  name: 'reload',
  description: 'Reload the current page',
  parameters: z.object({
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional()
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: reload called');
    try {
      const page = await ensureConnected();
      await page.reload({
        waitUntil: args.waitUntil as any
      });
      return {
        content: [{
          type: "text",
          text: "Successfully reloaded the page"
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] Reload failed:', error);
      return {
        content: [{
          type: "text",
          text: `Reload failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Get page info
server.addTool({
  name: 'getPageInfo',
  description: 'Get information about the current page',
  parameters: z.object({}),
  execute: async () => {
    console.error('[MCP-CDP] Tool: getPageInfo called');
    try {
      const page = await ensureConnected();
      
      const url = page.url();
      const title = await page.title();
      
      return {
        content: [{
          type: "text",
          text: `Page Info:\nURL: ${url}\nTitle: ${title}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] getPageInfo failed:', error);
      return {
        content: [{
          type: "text",
          text: `Get page info failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Create new tab
server.addTool({
  name: 'createTab',
  description: 'Create a new tab',
  parameters: z.object({
    url: z.string().optional().describe('URL to open in new tab')
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: createTab called');
    try {
      // Use the connector to create a new tab
      const tabId = await connector.createTab(args.url);
      
      return {
        content: [{
          type: "text",
          text: `Successfully created new tab with ID: ${tabId}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] createTab failed:', error);
      return {
        content: [{
          type: "text",
          text: `Create tab failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Switch to tab
server.addTool({
  name: 'switchTab',
  description: 'Switch to a specific tab',
  parameters: z.object({
    tabId: z.string().describe('Tab ID')
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: switchTab called');
    try {
      const success = await connector.switchTab(args.tabId);
      
      return {
        content: [{
          type: "text",
          text: success ? `Successfully switched to tab ${args.tabId}` : `Failed to switch to tab ${args.tabId}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] switchTab failed:', error);
      return {
        content: [{
          type: "text",
          text: `Switch tab failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: List tabs
server.addTool({
  name: 'listTabs',
  description: 'List all available tabs',
  parameters: z.object({}),
  execute: async () => {
    console.error('[MCP-CDP] Tool: listTabs called');
    try {
      const tabs = await connector.listTabs();
      
      return {
        content: [{
          type: "text",
          text: `Available tabs:\n${JSON.stringify(tabs, null, 2)}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] listTabs failed:', error);
      return {
        content: [{
          type: "text",
          text: `List tabs failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Select option
server.addTool({
  name: 'selectOption',
  description: 'Select an option in a dropdown',
  parameters: z.object({
    selector: z.string().describe('Select element'),
    value: z.union([
      z.string(),
      z.array(z.string())
    ]).describe('Option value(s)')
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: selectOption called');
    try {
      const page = await ensureConnected();
      
      await page.selectOption(args.selector, args.value);
      
      return {
        content: [{
          type: "text",
          text: `Successfully selected option "${JSON.stringify(args.value)}" for selector: ${args.selector}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] SelectOption failed:', error);
      return {
        content: [{
          type: "text",
          text: `Select option failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Tool: Set checked state
server.addTool({
  name: 'setChecked',
  description: 'Check or uncheck a checkbox',
  parameters: z.object({
    selector: z.string().describe('Checkbox element'),
    checked: z.boolean().describe('Checked state')
  }),
  execute: async (args) => {
    console.error('[MCP-CDP] Tool: setChecked called');
    try {
      const page = await ensureConnected();
      
      await page.setChecked(args.selector, args.checked);
      
      return {
        content: [{
          type: "text",
          text: `Successfully ${args.checked ? 'checked' : 'unchecked'} element with selector: ${args.selector}`
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] SetChecked failed:', error);
      return {
        content: [{
          type: "text",
          text: `Set checked failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

// Check if Electron browser is running on CDP port
async function checkElectronBrowser(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:9222/json/version');
    if (response.ok) {
      const data = await response.json();
      console.error(`[MCP-CDP] ✅ Electron browser detected: ${data.Browser} (${data['Protocol-Version']})`);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Wait for Electron browser to be available
async function waitForElectronBrowser(): Promise<void> {
  console.error('[MCP-CDP] 🔍 Checking for Electron browser on port 9222...');
  
  while (true) {
    const isAvailable = await checkElectronBrowser();
    if (isAvailable) {
      console.error('[MCP-CDP] ✅ Electron browser is ready!');
      return;
    }
    
    console.error('[MCP-CDP] ⏳ Electron browser not found, checking again in 5 seconds...');
    console.error('[MCP-CDP] 💡 Make sure to start Electron with: electron . --remote-debugging-port=9222');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Check for browser in background without blocking server startup
async function checkForElectronBrowserInBackground(): Promise<void> {
  console.error('[MCP-CDP] 🔍 Starting background check for Electron browser...');
  
  // Run the check in the background
  (async () => {
    while (true) {
      const isAvailable = await checkElectronBrowser();
      if (isAvailable) {
        console.error('[MCP-CDP] ✅ Electron browser detected in background!');
        console.error('[MCP-CDP] 🔌 Browser is now available for connections');
        return;
      }
      
      // Check every 10 seconds in the background
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  })().catch(error => {
    console.error('[MCP-CDP] ❌ Background browser check error:', error);
  });
}

// Start the server
async function startServer() {
  console.error('[MCP-CDP] ===========================================');
  console.error('[MCP-CDP] Starting Playwright CDP MCP server...');
  console.error(`[MCP-CDP] Process PID: ${process.pid}`);
  console.error(`[MCP-CDP] Node version: ${process.version}`);
  console.error('[MCP-CDP] This server connects to Electron via CDP for enhanced browser control');
  console.error('[MCP-CDP] Features: Accessibility snapshots, smart selectors, auto-waiting');
  console.error('[MCP-CDP] ===========================================');

  // Start checking for browser in the background (don't block)
  checkForElectronBrowserInBackground();

  // Get port from environment or use default
  const MCP_PORT = process.env.MCP_PORT || 3001;
  const TRANSPORT_TYPE = process.env.TRANSPORT_TYPE || 'httpStream';

  console.error(`[MCP-CDP] 🚀 Starting MCP server on port ${MCP_PORT} (${TRANSPORT_TYPE})...`);
  
  // FastMCP doesn't have listTools method, but we know we have 17 tools
  console.error('[MCP-CDP] 📊 Server has 17 tools registered');
  console.error('[MCP-CDP] 🔧 Registered tools:');
  console.error('[MCP-CDP]    - browser_snapshot: Capture accessibility snapshot of the current page');
  console.error('[MCP-CDP]    - navigate: Navigate browser to a URL using Playwright');
  console.error('[MCP-CDP]    - click: Click an element using Playwright selectors');
  console.error('[MCP-CDP]    - type: Type text into an element');
  console.error('[MCP-CDP]    - fill: Fill an input field instantly');
  console.error('[MCP-CDP]    - screenshot: Take a screenshot');
  console.error('[MCP-CDP]    - waitForSelector: Wait for an element to appear');
  console.error('[MCP-CDP]    - evaluate: Execute JavaScript in the page context');
  console.error('[MCP-CDP]    - getText: Get text content of elements');
  console.error('[MCP-CDP]    - goBack: Navigate back in browser history');
  console.error('[MCP-CDP]    - goForward: Navigate forward in browser history');
  console.error('[MCP-CDP]    - reload: Reload the current page');
  console.error('[MCP-CDP]    - getPageInfo: Get information about the current page');
  console.error('[MCP-CDP]    - createTab: Create a new tab in the browser');
  console.error('[MCP-CDP]    - switchTab: Switch to a specific tab');
  console.error('[MCP-CDP]    - listTabs: List all available tabs');
  console.error('[MCP-CDP]    - selectOption: Select an option in a dropdown');
  console.error('[MCP-CDP]    - setChecked: Check or uncheck a checkbox');
  
  const startOptions: any = {
    transportType: TRANSPORT_TYPE as 'httpStream' | 'stdio'
  };
  
  if (TRANSPORT_TYPE === 'httpStream') {
    startOptions.httpStream = {
      port: Number(MCP_PORT),
      endpoint: '/sse'
    };
  }
  
  console.error('[MCP-CDP] 📋 Start options:', startOptions);
  
  // Check if FastMCP has any hooks or events we can use
  console.error('[MCP-CDP] 🔍 Server instance properties:', Object.keys(server));
  console.error('[MCP-CDP] 🔍 Server prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(server)));
  
  server.start(startOptions).then(() => {
    if (TRANSPORT_TYPE === 'httpStream') {
      console.error(`[MCP-CDP] ✅ MCP server started successfully on http://localhost:${MCP_PORT}`);
      console.error(`[MCP-CDP] 🔗 SSE endpoint: http://localhost:${MCP_PORT}/sse`);
      console.error('[MCP-CDP] 🔍 Waiting for client connections...');
      
      // Test the endpoints
      setTimeout(() => {
        console.error('[MCP-CDP] 🧪 Testing if server is actually listening...');
        
        // Test root
        fetch(`http://localhost:${MCP_PORT}/`).then(res => {
          console.error(`[MCP-CDP] ✅ Root endpoint status: ${res.status}`);
        }).catch(err => {
          console.error(`[MCP-CDP] ❌ Cannot reach root: ${err.message}`);
        });
        
        // Test SSE endpoint
        fetch(`http://localhost:${MCP_PORT}/sse`).then(res => {
          console.error(`[MCP-CDP] ✅ SSE endpoint status: ${res.status}`);
          console.error(`[MCP-CDP] 📋 SSE headers:`, res.headers);
        }).catch(err => {
          console.error(`[MCP-CDP] ❌ Cannot reach SSE: ${err.message}`);
        });
        
        // Test message endpoint with OPTIONS
        fetch(`http://localhost:${MCP_PORT}/message`, { method: 'OPTIONS' }).then(res => {
          console.error(`[MCP-CDP] ✅ Message endpoint OPTIONS status: ${res.status}`);
        }).catch(err => {
          console.error(`[MCP-CDP] ❌ Cannot reach message endpoint: ${err.message}`);
        });
      }, 1000);
      
      // Add SSE connection monitoring
      setInterval(() => {
        console.error(`[MCP-CDP] 📊 Status: ${requestCount} requests processed so far`);
      }, 10000);
    } else {
      console.error('[MCP-CDP] ✅ MCP server started successfully on stdio');
    }
  }).catch(error => {
    console.error('[MCP-CDP] ❌ Failed to start MCP server:', error);
    console.error('[MCP-CDP] Error details:', error.stack);
    process.exit(1);
  });
}

// Start the server
startServer().catch(error => {
  console.error('[MCP-CDP] ❌ Failed to start server:', error);
  process.exit(1);
});