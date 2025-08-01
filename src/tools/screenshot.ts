import { z } from 'zod';
import { defineTool } from './tool';
import { elementReferences } from './mouse';

const screenshot = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_take_screenshot',
    title: 'Take a screenshot',
    description: 'Take a screenshot of the current page. You can\'t perform actions based on the screenshot, use browser_snapshot for actions.',
    inputSchema: z.object({
      raw: z.boolean().optional().describe('Whether to return without compression (PNG). Default is false (JPEG)'),
      filename: z.string().optional().describe('File name to save the screenshot to'),
      element: z.string().optional().describe('Human-readable element description to screenshot'),
      ref: z.string().optional().describe('Element reference from snapshot'),
      selector: z.string().optional().describe('CSS selector for element to screenshot')
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_take_screenshot called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      let buffer: Buffer;
      
      // Handle element screenshot
      if (params.selector || params.ref) {
        let selector = params.selector;
        
        // If ref is provided, resolve it to a selector
        if (params.ref && elementReferences.has(params.ref)) {
          selector = elementReferences.get(params.ref);
        }
        
        if (!selector) {
          return {
            content: [{
              type: 'text',
              text: 'Error: No valid selector found for element screenshot'
            }]
          };
        }
        
        const element = await page.locator(selector).first();
        buffer = await element.screenshot({
          type: params.raw ? 'png' : 'jpeg',
          quality: params.raw ? undefined : 90
        });
      } else {
        // Viewport screenshot (visible area only)
        buffer = await page.screenshot({
          type: params.raw ? 'png' : 'jpeg',
          quality: params.raw ? undefined : 90
        });
      }
      
      // If filename is provided, we should save it (this would require file system access)
      // For now, we'll just return the base64 data
      
      return {
        content: [{
          type: 'image',
          data: buffer.toString('base64'),
          mimeType: params.raw ? 'image/png' : 'image/jpeg'
        }]
      };
    } catch (error) {
      console.error('[MCP-CDP] Screenshot failed:', error);
      return {
        content: [{
          type: 'text',
          text: `Screenshot failed: ${(error as Error).message}`
        }]
      };
    }
  },
});

export default [
  screenshot,
];