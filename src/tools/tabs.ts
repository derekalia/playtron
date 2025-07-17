import { z } from 'zod';
import { defineTool, successResult, errorResult } from './tool';

const tabNew = defineTool({
  capability: 'tabs',
  schema: {
    name: 'browser_tab_new',
    title: 'Open a new tab',
    description: 'Open a new tab',
    inputSchema: z.object({
      url: z.string().optional().describe('The URL to navigate to in the new tab'),
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_tab_new called');
    try {
      const tabId = await connector.createTab(params.url || 'https://www.google.com');
      return successResult(`Successfully created new tab with ID: ${tabId}`);
    } catch (error) {
      console.error('[MCP-CDP] Create tab failed:', error);
      return errorResult(`Create tab failed: ${(error as Error).message}`);
    }
  },
});

const tabSelect = defineTool({
  capability: 'tabs',
  schema: {
    name: 'browser_tab_select',
    title: 'Select a tab',
    description: 'Select a tab by index',
    inputSchema: z.object({
      index: z.number().describe('The index of the tab to select'),
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_tab_select called');
    try {
      // Get list of tabs first to find the ID by index
      const tabs = await connector.listTabs();
      
      if (params.index < 0 || params.index >= tabs.length) {
        return errorResult(`Invalid tab index: ${params.index}. Available tabs: ${tabs.length}`);
      }
      
      const tab = tabs[params.index];
      console.error(`[MCP-CDP] Switching to tab index ${params.index} with ID: ${tab.id}`);
      const success = await connector.switchTab(tab.id);
      
      if (success) {
        return successResult(`Successfully switched to tab ${params.index}: ${tab.url}`);
      } else {
        return errorResult(`Failed to switch to tab ${params.index}`);
      }
    } catch (error) {
      console.error('[MCP-CDP] Select tab failed:', error);
      return errorResult(`Select tab failed: ${(error as Error).message}`);
    }
  },
});

const tabList = defineTool({
  capability: 'tabs',
  schema: {
    name: 'browser_tab_list',
    title: 'List tabs',
    description: 'List browser tabs',
    inputSchema: z.object({}),
    type: 'readOnly',
  },
  handle: async (connector) => {
    console.error('[MCP-CDP] Tool: browser_tab_list called');
    try {
      const tabs = await connector.listTabs();
      
      const tabInfo = tabs.map((tab, index) => 
        `[${index}] ${tab.isActive ? '* ' : ''}${tab.title || 'Untitled'} - ${tab.url}`
      ).join('\n');
      
      return successResult(`Available tabs:\n${tabInfo}`);
    } catch (error) {
      console.error('[MCP-CDP] List tabs failed:', error);
      return errorResult(`List tabs failed: ${(error as Error).message}`);
    }
  },
});

const tabClose = defineTool({
  capability: 'tabs',
  schema: {
    name: 'browser_tab_close',
    title: 'Close a tab',
    description: 'Close a tab',
    inputSchema: z.object({
      index: z.number().optional().describe('The index of the tab to close. Closes current tab if not provided'),
    }),
    type: 'destructive',
  },
  handle: async () => {
    console.error('[MCP-CDP] Tool: browser_tab_close called');
    try {
      // This would require implementing tab close functionality in the connector
      // For now, return a message indicating the limitation
      return successResult('Tab close functionality not yet implemented for Electron browser');
    } catch (error) {
      console.error('[MCP-CDP] Close tab failed:', error);
      return errorResult(`Close tab failed: ${(error as Error).message}`);
    }
  },
});

export default [
  tabNew,
  tabSelect,
  tabList,
  tabClose,
];