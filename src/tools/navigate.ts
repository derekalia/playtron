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
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional()
        .describe('When to consider navigation finished')
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_navigate called to ${params.url}`);
    
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      const timeout = 30000;
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
      return errorResult(`Navigation error: ${(error as Error).message}`);
    }
  },
});

const goBack = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_navigate_back',
    title: 'Go back',
    description: 'Go back to the previous page',
    inputSchema: z.object({}),
    type: 'readOnly',
  },
  handle: async (connector) => {
    console.error('[MCP-CDP] Tool: browser_navigate_back called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      await page.goBack();
      return successResult('Successfully navigated back in browser history');
    } catch (error) {
      console.error('[MCP-CDP] GoBack failed:', error);
      return errorResult(`Go back failed: ${(error as Error).message}`);
    }
  },
});

const goForward = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_navigate_forward',
    title: 'Go forward',
    description: 'Go forward to the next page',
    inputSchema: z.object({}),
    type: 'readOnly',
  },
  handle: async (connector) => {
    console.error('[MCP-CDP] Tool: browser_navigate_forward called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      await page.goForward();
      return successResult('Successfully navigated forward in browser history');
    } catch (error) {
      console.error('[MCP-CDP] GoForward failed:', error);
      return errorResult(`Go forward failed: ${(error as Error).message}`);
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
      waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle', 'commit']).optional()
        .describe('When to consider reload finished')
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_reload called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      await page.reload({
        waitUntil: params.waitUntil as any
      });
      return successResult('Successfully reloaded the page');
    } catch (error) {
      console.error('[MCP-CDP] Reload failed:', error);
      return errorResult(`Reload failed: ${(error as Error).message}`);
    }
  },
});

export default [
  navigate,
  goBack,
  goForward,
  reload,
];