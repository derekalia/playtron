import { z } from 'zod';
import { defineTool, successResult, errorResult } from './tool';

const navigate = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_navigate',
    title: 'Navigate to a URL',
    description: 'Navigate to a URL',
    inputSchema: z.object({
      url: z.string().describe('The URL to navigate to'),
      tabId: z.string().optional().describe('Optional. Specific tab ID to navigate. Defaults to active tab. Use browser_tabs_list to discover available tab IDs.'),
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional()
        .describe('When to consider navigation finished')
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_navigate called to ${params.url}${params.tabId ? ` (tab: ${params.tabId})` : ''}`);

    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }
      
      const timeout = 5000;
      let response = null;
      let navigationError = null;
      
      try {
        response = await page.goto(params.url, {
          waitUntil: params.waitUntil as any || 'load',
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
      
      if (navigationError) {
        return errorResult(`Navigation failed: ${(navigationError as Error).message}\nCurrent URL: ${currentUrl}\nTitle: ${title}`);
      }
      
      const status = response?.status() || 200;
      return successResult(`Successfully navigated to ${currentUrl}\nTitle: ${title}\nStatus: ${status}`);

    } catch (error) {
      console.error('[MCP-CDP] Navigate failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tabs_list to see available tabs.`);
      }
      return errorResult(`Navigation error: ${errorMessage}`);
    }
  },
});

const goBack = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_navigate_back',
    title: 'Go back',
    description: 'Go back to the previous page',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID to go back. Defaults to active tab.')
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_navigate_back called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }

      await page.goBack();
      return successResult('Successfully navigated back in browser history');
    } catch (error) {
      console.error('[MCP-CDP] GoBack failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tabs_list to see available tabs.`);
      }
      return errorResult(`Go back failed: ${errorMessage}`);
    }
  },
});

const goForward = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_navigate_forward',
    title: 'Go forward',
    description: 'Go forward to the next page',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID to go forward. Defaults to active tab.')
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_navigate_forward called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }

      await page.goForward();
      return successResult('Successfully navigated forward in browser history');
    } catch (error) {
      console.error('[MCP-CDP] GoForward failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tabs_list to see available tabs.`);
      }
      return errorResult(`Go forward failed: ${errorMessage}`);
    }
  },
});

const reload = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_reload',
    title: 'Reload page',
    description: 'Reload the current page',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID to reload. Defaults to active tab.'),
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional()
        .describe('When to consider reload finished')
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_reload called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }

      await page.reload({
        waitUntil: params.waitUntil as any
      });
      return successResult('Successfully reloaded the page');
    } catch (error) {
      console.error('[MCP-CDP] Reload failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tabs_list to see available tabs.`);
      }
      return errorResult(`Reload failed: ${errorMessage}`);
    }
  },
});

export default [
  navigate,
  goBack,
  goForward,
  reload,
];