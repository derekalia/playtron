import { z } from 'zod';
import { defineTool, successResult, errorResult } from './tool';
import { elementReferences } from './mouse';

const evaluate = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_evaluate',
    title: 'Evaluate JavaScript',
    description: 'Evaluate JavaScript expression on page or element',
    inputSchema: z.object({
      function: z.string().describe('() => { /* code */ } or (element) => { /* code */ } when element is provided'),
      element: z.string().optional().describe('Human-readable element description'),
      ref: z.string().optional().describe('Element reference from snapshot'),
      selector: z.string().optional().describe('CSS selector for element')
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_evaluate called');
    try {
      const page = connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      let result;
      
      // Check if we need to evaluate on an element
      if (params.ref || params.selector) {
        let selector = params.selector;
        
        // If ref is provided, resolve it to a selector
        if (params.ref && elementReferences.has(params.ref)) {
          selector = elementReferences.get(params.ref);
        }
        
        if (!selector) {
          return errorResult('No valid selector found for element evaluation');
        }
        
        // Evaluate on the element
        const element = await page.locator(selector).first();
        result = await element.evaluate(params.function);
      } else {
        // Evaluate on the page
        result = await page.evaluate(params.function);
      }
      
      return successResult(`JavaScript evaluation result: ${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      console.error('[MCP-CDP] Evaluate failed:', error);
      return errorResult(`JavaScript evaluation failed: ${(error as Error).message}`);
    }
  },
});

const getText = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_get_text',
    title: 'Get text content',
    description: 'Get text content of elements using Playwright selectors',
    inputSchema: z.object({
      selector: z.string().describe('Playwright selector (supports text=, role=, css, xpath, etc.)'),
      all: z.boolean().optional().describe('Get all matching elements')
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_get_text called');
    try {
      const page = connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      let text: string | string[];
      if (params.all) {
        const elements = await page.locator(params.selector).all();
        const textContents = await Promise.all(elements.map(el => el.textContent()));
        text = textContents.map(content => content || '');
      } else {
        text = await page.locator(params.selector).first().textContent() || '';
      }
      
      return successResult(`Text content: ${JSON.stringify(text, null, 2)}`);
    } catch (error) {
      console.error('[MCP-CDP] Get text failed:', error);
      return errorResult(`Get text failed: ${(error as Error).message}`);
    }
  },
});

export default [
  evaluate,
  getText,
];