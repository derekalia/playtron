"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fastmcp_1 = require("fastmcp");
const zod_1 = require("zod");
const playwright_cdp_connector_1 = require("./playwright-cdp-connector");
const server = new fastmcp_1.FastMCP({
    name: 'electron-browser-cdp',
    version: '1.0.0',
});
// Global connector instance
const connector = new playwright_cdp_connector_1.PlaywrightCDPConnector();
let isConnected = false;
let requestCount = 0;
// Storage for element references from accessibility snapshots
const elementReferences = new Map();
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
        }
        catch (error) {
            console.error('[MCP-CDP] Error during disconnect:', error);
        }
    }
    process.exit(0);
}
// Helper function to ensure we're connected
async function ensureConnected() {
    console.error(`[MCP-CDP] ensureConnected called (request #${++requestCount})`);
    try {
        if (!isConnected || !connector.isConnected()) {
            console.error('[MCP-CDP] Not connected, establishing connection...');
            await connector.connect();
            isConnected = true;
            console.error('[MCP-CDP] Successfully connected to Electron browser');
        }
        else {
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
    }
    catch (error) {
        console.error('[MCP-CDP] Error in ensureConnected:', error);
        isConnected = false; // Reset connection state
        throw error;
    }
}
// Tool: Browser snapshot (following Playwright MCP pattern)
server.addTool({
    name: 'browser_snapshot',
    description: 'Capture accessibility snapshot of the current page',
    parameters: zod_1.z.object({}),
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
        }
        catch (error) {
            console.error('[MCP-CDP] Browser snapshot failed:', error);
            console.error('[MCP-CDP] Error stack:', error.stack);
            return `Error capturing snapshot: ${error.message}`;
        }
    },
});
// Tool: Navigate (using real Playwright) - with robust error handling
server.addTool({
    name: 'navigate',
    description: 'Navigate browser to a URL using Playwright',
    parameters: zod_1.z.object({
        url: zod_1.z.string().describe('The URL to navigate to'),
        waitUntil: zod_1.z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional()
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
                    waitUntil: args.waitUntil || 'load',
                    timeout: timeout
                });
            }
            catch (navErr) {
                console.error('[MCP-CDP] Navigation error:', navErr.message);
                navigationError = navErr;
            }
            // Get current state
            let currentUrl = 'unknown';
            let title = 'unknown';
            try {
                currentUrl = page.url();
                title = await page.title();
            }
            catch (stateErr) {
                console.error('[MCP-CDP] Could not get page state:', stateErr.message);
            }
            const result = {
                success: !navigationError,
                url: currentUrl,
                title: title,
                status: response?.status() || (navigationError ? 0 : 200),
                error: navigationError ? navigationError.message : undefined
            };
            console.error('[MCP-CDP] Navigation result:', result);
            if (navigationError) {
                return {
                    content: [{
                            type: "text",
                            text: `Navigation failed: ${navigationError.message}\nCurrent URL: ${currentUrl}\nTitle: ${title}`
                        }]
                };
            }
            return {
                content: [{
                        type: "text",
                        text: `Successfully navigated to ${currentUrl}\nTitle: ${title}\nStatus: ${result.status}`
                    }]
            };
        }
        catch (error) {
            console.error('[MCP-CDP] Navigate failed:', error);
            console.error('[MCP-CDP] Error stack:', error.stack);
            return {
                content: [{
                        type: "text",
                        text: `Navigation error: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Click with Playwright's smart selectors
server.addTool({
    name: 'click',
    description: 'Click an element using Playwright selectors or element reference from snapshot',
    parameters: zod_1.z.object({
        selector: zod_1.z.string().optional().describe('Playwright selector (CSS, text=, role=, etc)'),
        ref: zod_1.z.string().optional().describe('Element reference from page snapshot (e.g., "[0]")'),
        options: zod_1.z.object({
            button: zod_1.z.enum(['left', 'right', 'middle']).optional(),
            clickCount: zod_1.z.number().optional(),
            delay: zod_1.z.number().optional(),
            timeout: zod_1.z.number().optional()
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
        }
        catch (error) {
            console.error('[MCP-CDP] Click failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Click failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Type text
server.addTool({
    name: 'type',
    description: 'Type text into an element using Playwright',
    parameters: zod_1.z.object({
        selector: zod_1.z.string().describe('Playwright selector'),
        text: zod_1.z.string().describe('Text to type'),
        options: zod_1.z.object({
            delay: zod_1.z.number().optional().describe('Delay between keystrokes in ms')
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
        }
        catch (error) {
            console.error('[MCP-CDP] Type failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Type failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Fill (faster than type)
server.addTool({
    name: 'fill',
    description: 'Fill an input field instantly using Playwright',
    parameters: zod_1.z.object({
        selector: zod_1.z.string().describe('Playwright selector'),
        value: zod_1.z.string().describe('Value to fill')
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
        }
        catch (error) {
            console.error('[MCP-CDP] Fill failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Fill failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Screenshot
server.addTool({
    name: 'screenshot',
    description: 'Take a screenshot using Playwright',
    parameters: zod_1.z.object({
        fullPage: zod_1.z.boolean().optional().describe('Capture full page'),
        selector: zod_1.z.string().optional().describe('Capture specific element')
    }),
    execute: async (args) => {
        console.error('[MCP-CDP] Tool: screenshot called');
        try {
            const page = await ensureConnected();
            let buffer;
            if (args.selector) {
                // Screenshot specific element
                const element = await page.locator(args.selector).first();
                buffer = await element.screenshot();
            }
            else {
                // Full page or viewport
                buffer = await page.screenshot({
                    fullPage: args.fullPage
                });
            }
            return {
                type: 'image',
                data: buffer.toString('base64'),
                mimeType: 'image/png'
            };
        }
        catch (error) {
            console.error('[MCP-CDP] Screenshot failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Screenshot failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Wait for selector
server.addTool({
    name: 'waitForSelector',
    description: 'Wait for an element to appear using Playwright',
    parameters: zod_1.z.object({
        selector: zod_1.z.string().describe('Playwright selector to wait for'),
        options: zod_1.z.object({
            state: zod_1.z.enum(['attached', 'detached', 'visible', 'hidden']).optional(),
            timeout: zod_1.z.number().optional()
        }).optional()
    }),
    execute: async (args) => {
        console.error('[MCP-CDP] Tool: waitForSelector called');
        try {
            const page = await ensureConnected();
            await page.waitForSelector(args.selector, {
                state: args.options?.state,
                timeout: args.options?.timeout
            });
            return {
                content: [{
                        type: "text",
                        text: `Successfully waited for element with selector: ${args.selector}`
                    }]
            };
        }
        catch (error) {
            console.error('[MCP-CDP] WaitForSelector failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Wait for selector failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Evaluate JavaScript
server.addTool({
    name: 'evaluate',
    description: 'Execute JavaScript in the page context using Playwright',
    parameters: zod_1.z.object({
        expression: zod_1.z.string().describe('JavaScript expression to evaluate')
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
        }
        catch (error) {
            console.error('[MCP-CDP] Evaluate failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `JavaScript evaluation failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Get text content
server.addTool({
    name: 'getText',
    description: 'Get text content of elements using Playwright',
    parameters: zod_1.z.object({
        selector: zod_1.z.string().describe('Playwright selector'),
        all: zod_1.z.boolean().optional().describe('Get all matching elements instead of first')
    }),
    execute: async (args) => {
        console.error('[MCP-CDP] Tool: getText called');
        try {
            const page = await ensureConnected();
            let text;
            if (args.all) {
                const elements = await page.locator(args.selector).all();
                const textContents = await Promise.all(elements.map(el => el.textContent()));
                text = textContents.map(content => content || '');
            }
            else {
                text = await page.locator(args.selector).first().textContent() || '';
            }
            return {
                content: [{
                        type: "text",
                        text: `Text content: ${JSON.stringify(text, null, 2)}`
                    }]
            };
        }
        catch (error) {
            console.error('[MCP-CDP] GetText failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Get text failed: ${error.message}`
                    }]
            };
        }
    },
});
// Navigation tools
server.addTool({
    name: 'goBack',
    description: 'Navigate back in browser history',
    parameters: zod_1.z.object({}),
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
        }
        catch (error) {
            console.error('[MCP-CDP] GoBack failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Go back failed: ${error.message}`
                    }]
            };
        }
    },
});
server.addTool({
    name: 'goForward',
    description: 'Navigate forward in browser history',
    parameters: zod_1.z.object({}),
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
        }
        catch (error) {
            console.error('[MCP-CDP] GoForward failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Go forward failed: ${error.message}`
                    }]
            };
        }
    },
});
server.addTool({
    name: 'reload',
    description: 'Reload the current page',
    parameters: zod_1.z.object({
        waitUntil: zod_1.z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional()
    }),
    execute: async (args) => {
        console.error('[MCP-CDP] Tool: reload called');
        try {
            const page = await ensureConnected();
            await page.reload({
                waitUntil: args.waitUntil
            });
            return {
                content: [{
                        type: "text",
                        text: "Successfully reloaded the page"
                    }]
            };
        }
        catch (error) {
            console.error('[MCP-CDP] Reload failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Reload failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Get page info
server.addTool({
    name: 'getPageInfo',
    description: 'Get information about the current page',
    parameters: zod_1.z.object({}),
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
        }
        catch (error) {
            console.error('[MCP-CDP] getPageInfo failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Get page info failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Create new tab
server.addTool({
    name: 'createTab',
    description: 'Create a new tab in the browser',
    parameters: zod_1.z.object({
        url: zod_1.z.string().optional().describe('URL to load in the new tab (defaults to Google)')
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
        }
        catch (error) {
            console.error('[MCP-CDP] createTab failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Create tab failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Switch to tab
server.addTool({
    name: 'switchTab',
    description: 'Switch to a specific tab',
    parameters: zod_1.z.object({
        tabId: zod_1.z.string().describe('ID of the tab to switch to')
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
        }
        catch (error) {
            console.error('[MCP-CDP] switchTab failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Switch tab failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: List tabs
server.addTool({
    name: 'listTabs',
    description: 'List all available tabs',
    parameters: zod_1.z.object({}),
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
        }
        catch (error) {
            console.error('[MCP-CDP] listTabs failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `List tabs failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Select option
server.addTool({
    name: 'selectOption',
    description: 'Select an option in a dropdown using Playwright',
    parameters: zod_1.z.object({
        selector: zod_1.z.string().describe('Selector for the select element'),
        value: zod_1.z.union([
            zod_1.z.string(),
            zod_1.z.array(zod_1.z.string())
        ]).describe('Value(s) to select')
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
        }
        catch (error) {
            console.error('[MCP-CDP] SelectOption failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Select option failed: ${error.message}`
                    }]
            };
        }
    },
});
// Tool: Set checked state
server.addTool({
    name: 'setChecked',
    description: 'Check or uncheck a checkbox using Playwright',
    parameters: zod_1.z.object({
        selector: zod_1.z.string().describe('Selector for the checkbox'),
        checked: zod_1.z.boolean().describe('Whether to check or uncheck')
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
        }
        catch (error) {
            console.error('[MCP-CDP] SetChecked failed:', error);
            return {
                content: [{
                        type: "text",
                        text: `Set checked failed: ${error.message}`
                    }]
            };
        }
    },
});
// Check if Electron browser is running on CDP port
async function checkElectronBrowser() {
    try {
        const response = await fetch('http://localhost:9222/json/version');
        if (response.ok) {
            const data = await response.json();
            console.error(`[MCP-CDP] ✅ Electron browser detected: ${data.Browser} (${data['Protocol-Version']})`);
            return true;
        }
        return false;
    }
    catch (error) {
        return false;
    }
}
// Wait for Electron browser to be available
async function waitForElectronBrowser() {
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
// Start the server
async function startServer() {
    console.error('[MCP-CDP] ===========================================');
    console.error('[MCP-CDP] Starting Playwright CDP MCP server...');
    console.error(`[MCP-CDP] Process PID: ${process.pid}`);
    console.error(`[MCP-CDP] Node version: ${process.version}`);
    console.error('[MCP-CDP] This server connects to Electron via CDP for enhanced browser control');
    console.error('[MCP-CDP] Features: Accessibility snapshots, smart selectors, auto-waiting');
    console.error('[MCP-CDP] ===========================================');
    // Wait for Electron browser before starting MCP server
    await waitForElectronBrowser();
    console.error('[MCP-CDP] 🚀 Starting MCP server...');
    server.start({
        transportType: 'stdio'
    }).then(() => {
        console.error('[MCP-CDP] ✅ MCP server started successfully');
    }).catch(error => {
        console.error('[MCP-CDP] ❌ Failed to start MCP server:', error);
        process.exit(1);
    });
}
// Start the server
startServer().catch(error => {
    console.error('[MCP-CDP] ❌ Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map