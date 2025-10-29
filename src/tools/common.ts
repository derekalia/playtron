import { z } from 'zod';
import { defineTool, successResult, errorResult } from './tool';

const close = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_close',
    title: 'Close browser',
    description: 'Close the page',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID to close. Defaults to active tab.'),
    }),
    type: 'readOnly',
  },
  handle: async (_connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_close called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      // Note: We don't actually close the browser since it's managed by Electron
      // This would typically close the current tab or page
      // The tabId parameter is available for future implementation
      return successResult('Browser close requested. Note: Electron browser remains open.');
    } catch (error) {
      console.error('[MCP-CDP] Close failed:', error);
      return errorResult(`Close failed: ${(error as Error).message}`);
    }
  },
});

const resize = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_resize',
    title: 'Resize browser window',
    description: 'Resize the browser window',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID to resize. Defaults to active tab.'),
      width: z.number().describe('Width of the browser window'),
      height: z.number().describe('Height of the browser window'),
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_resize called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }

      await page.setViewportSize({
        width: params.width,
        height: params.height
      });

      return successResult(`Successfully resized browser window to ${params.width}x${params.height}`);
    } catch (error) {
      console.error('[MCP-CDP] Resize failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tab_list to see available tabs.`);
      }
      return errorResult(`Resize failed: ${errorMessage}`);
    }
  },
});

const getPageInfo = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_page_info',
    title: 'Get page info',
    description: 'Get information about the current page',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID to get info from. Defaults to active tab.'),
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_page_info called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }

      const url = page.url();
      const title = await page.title();
      const viewport = page.viewportSize();

      const info = [
        `URL: ${url}`,
        `Title: ${title}`,
        viewport ? `Viewport: ${viewport.width}x${viewport.height}` : 'Viewport: Not set'
      ].join('\n');

      return successResult(info);
    } catch (error) {
      console.error('[MCP-CDP] Get page info failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tab_list to see available tabs.`);
      }
      return errorResult(`Get page info failed: ${errorMessage}`);
    }
  },
});

export default [
  close,
  resize,
  getPageInfo,
];