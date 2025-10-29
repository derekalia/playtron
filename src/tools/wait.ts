import { z } from 'zod';
import { defineTool, successResult, errorResult } from './tool';

const waitFor = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_wait_for',
    title: 'Wait for',
    description: 'Wait for text to appear or disappear or a specified time to pass',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID for wait action. Defaults to active tab.'),
      time: z.number().optional().describe('The time to wait in seconds'),
      text: z.string().optional().describe('The text to wait for'),
      textGone: z.string().optional().describe('The text to wait for to disappear'),
    }).refine(data => data.time || data.text || data.textGone, {
      message: 'At least one of time, text, or textGone must be provided'
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_wait_for called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }

      if (params.time) {
        // Wait for specified time
        await page.waitForTimeout(params.time * 1000);
        return successResult(`Waited for ${params.time} seconds`);
      } else if (params.text) {
        // Wait for text to appear
        await page.locator(`text="${params.text}"`).waitFor({
          state: 'visible',
          timeout: 5000
        });
        return successResult(`Text "${params.text}" appeared on the page`);
      } else if (params.textGone) {
        // Wait for text to disappear
        await page.locator(`text="${params.textGone}"`).waitFor({
          state: 'hidden',
          timeout: 5000
        });
        return successResult(`Text "${params.textGone}" disappeared from the page`);
      }

      return errorResult('Invalid wait parameters');
    } catch (error) {
      console.error('[MCP-CDP] Wait for failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tab_list to see available tabs.`);
      }
      return errorResult(`Wait failed: ${errorMessage}`);
    }
  },
});

const waitForSelector = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_wait_for_selector',
    title: 'Wait for selector',
    description: 'Wait for an element to appear',
    inputSchema: z.object({
      tabId: z.string().optional().describe('Optional. Specific tab ID for wait action. Defaults to active tab.'),
      selector: z.string().describe('Element to wait for'),
      state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional()
        .describe('State to wait for'),
      timeout: z.number().optional().describe('Timeout in milliseconds')
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_wait_for_selector called${params.tabId ? ` (tab: ${params.tabId})` : ''}`);
    try {
      const page = await connector.getPage(params.tabId);
      if (!page) {
        throw new Error('No page connected');
      }

      await page.waitForSelector(params.selector, {
        state: params.state as any,
        timeout: params.timeout || 5000
      });

      return successResult(`Successfully waited for element with selector: ${params.selector} (state: ${params.state || 'attached'})`);
    } catch (error) {
      console.error('[MCP-CDP] Wait for selector failed:', error);
      const errorMessage = (error as Error).message;
      if (errorMessage.includes('Tab') && errorMessage.includes('not found')) {
        return errorResult(`Tab error: ${errorMessage}\nHint: Use browser_tab_list to see available tabs.`);
      }
      return errorResult(`Wait for selector failed: ${errorMessage}`);
    }
  },
});

export default [
  waitFor,
  waitForSelector,
];