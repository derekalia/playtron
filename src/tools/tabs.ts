import { z } from 'zod';
import { defineTool, successResult, errorResult } from './tool';
import { TabApiClient } from '../tab-api-client';

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
    description: 'Activate/switch to a specific tab by ID',
    inputSchema: z.object({
      tabId: z.string().describe('Required. The tab ID to activate. Use browser_tab_list to see available tab IDs.'),
      index: z.number().optional().describe('Deprecated. Use tabId instead. The index of the tab to select.'),
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_tab_select called');
    try {
      let targetTabId: string;

      // Support both tabId (new) and index (legacy)
      if (params.tabId) {
        targetTabId = params.tabId;
      } else if (params.index !== undefined) {
        // Legacy: Get list of tabs first to find the ID by index
        const tabs = await connector.listTabs();

        if (params.index < 0 || params.index >= tabs.length) {
          return errorResult(`Invalid tab index: ${params.index}. Available tabs: ${tabs.length}`);
        }

        targetTabId = tabs[params.index].id;
      } else {
        return errorResult('Either tabId or index must be provided');
      }

      console.error(`[MCP-CDP] Switching to tab ID: ${targetTabId}`);
      const success = await connector.switchTab(targetTabId);

      if (success) {
        return successResult(`Successfully switched to tab: ${targetTabId}`);
      } else {
        return errorResult(`Failed to switch to tab: ${targetTabId}`);
      }
    } catch (error) {
      console.error('[MCP-CDP] Select tab failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tab_list to see available tabs.`);
      }
      return errorResult(`Select tab failed: ${errorMessage}`);
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
    description: 'Close a specific tab by ID',
    inputSchema: z.object({
      tabId: z.string().describe('Required. The tab ID to close. Use browser_tab_list to see available tab IDs.'),
      index: z.number().optional().describe('Deprecated. Use tabId instead. The index of the tab to close.'),
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_tab_close called');
    try {
      const tabApiClient = new TabApiClient();

      // Check if Tab API is available
      const apiAvailable = await tabApiClient.isAvailable();
      if (!apiAvailable) {
        return successResult('Tab close functionality requires Tab API to be available');
      }

      let targetTabId: string;

      // Support both tabId (new) and index (legacy)
      if (params.tabId) {
        targetTabId = params.tabId;
      } else if (params.index !== undefined) {
        // Legacy: Get list of tabs to find the tab ID by index
        const tabs = await connector.listTabs();

        if (params.index < 0 || params.index >= tabs.length) {
          return errorResult(`Invalid tab index: ${params.index}. Available tabs: ${tabs.length}`);
        }

        targetTabId = tabs[params.index].id;
      } else {
        return errorResult('tabId must be provided');
      }

      // Close the tab via API
      await tabApiClient.closeTab(targetTabId);

      // Clean up internal state
      connector.removeTab(targetTabId);

      return successResult(`Successfully closed tab: ${targetTabId}`);
    } catch (error) {
      console.error('[MCP-CDP] Close tab failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tab_list to see available tabs.`);
      }
      return errorResult(`Close tab failed: ${errorMessage}`);
    }
  },
});

export default [
  tabNew,
  tabSelect,
  tabList,
  tabClose,
];