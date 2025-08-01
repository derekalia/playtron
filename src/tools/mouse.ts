import { z } from 'zod';
import { defineTool, successResult, errorResult } from './tool';

// Element references from snapshots (will be populated by snapshot tool)
export const elementReferences = new Map<string, string>();

const baseElementSchema = z.object({
  element: z.string().optional().describe('Human-readable element description'),
  ref: z.string().optional().describe('Element reference from snapshot'),
  selector: z.string().optional().describe('CSS selector or Playwright selector')
});

const elementSchema = baseElementSchema.refine(data => data.selector || data.ref, {
  message: 'Either selector or ref must be provided'
});

const click = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_click',
    title: 'Click',
    description: 'Perform click on a web page',
    inputSchema: baseElementSchema.extend({
      doubleClick: z.boolean().optional().describe('Whether to perform a double click'),
      button: z.enum(['left', 'right', 'middle']).optional().describe('Button to click'),
      clickCount: z.number().optional().describe('Number of clicks'),
      delay: z.number().optional().describe('Delay between clicks'),
      timeout: z.number().optional().describe('Timeout in milliseconds')
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_click called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      let selector = params.selector;
      
      // If ref is provided, resolve it to a selector
      if (params.ref && elementReferences.has(params.ref)) {
        selector = elementReferences.get(params.ref);
        console.error(`[MCP-CDP] Resolved ref ${params.ref} to selector: ${selector}`);
      }
      
      if (!selector) {
        return errorResult('No valid selector found. Please provide either a selector or a valid ref.');
      }
      
      // Ensure element is visible and scroll to it
      await page.locator(selector).scrollIntoViewIfNeeded();
      
      if (params.doubleClick) {
        await page.dblclick(selector, {
          button: params.button,
          delay: params.delay,
          timeout: params.timeout || 5000
        });
        return successResult(`Successfully double-clicked element: ${params.element || selector}`);
      } else {
        await page.click(selector, {
          button: params.button,
          clickCount: params.clickCount,
          delay: params.delay,
          timeout: params.timeout || 5000
        });
        return successResult(`Successfully clicked element: ${params.element || selector}`);
      }
    } catch (error) {
      console.error('[MCP-CDP] Click failed:', error);
      return errorResult(`Click failed: ${(error as Error).message}`);
    }
  },
});

const hover = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_hover',
    title: 'Hover mouse',
    description: 'Hover over element on page',
    inputSchema: elementSchema,
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_hover called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      let selector = params.selector;
      
      // If ref is provided, resolve it to a selector
      if (params.ref && elementReferences.has(params.ref)) {
        selector = elementReferences.get(params.ref);
      }
      
      if (!selector) {
        return errorResult('No valid selector found.');
      }
      
      await page.hover(selector);
      return successResult(`Successfully hovered over element: ${params.element || selector}`);
    } catch (error) {
      console.error('[MCP-CDP] Hover failed:', error);
      return errorResult(`Hover failed: ${(error as Error).message}`);
    }
  },
});

const drag = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_drag',
    title: 'Drag mouse',
    description: 'Perform drag and drop between two elements',
    inputSchema: z.object({
      startElement: z.string().describe('Human-readable source element description'),
      startRef: z.string().optional().describe('Source element reference from snapshot'),
      startSelector: z.string().optional().describe('Source element selector'),
      endElement: z.string().describe('Human-readable target element description'),
      endRef: z.string().optional().describe('Target element reference from snapshot'),
      endSelector: z.string().optional().describe('Target element selector'),
    }).refine(data => (data.startSelector || data.startRef) && (data.endSelector || data.endRef), {
      message: 'Both start and end selectors or refs must be provided'
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_drag called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      let startSelector = params.startSelector;
      let endSelector = params.endSelector;
      
      // Resolve refs to selectors
      if (params.startRef && elementReferences.has(params.startRef)) {
        startSelector = elementReferences.get(params.startRef);
      }
      if (params.endRef && elementReferences.has(params.endRef)) {
        endSelector = elementReferences.get(params.endRef);
      }
      
      if (!startSelector || !endSelector) {
        return errorResult('Valid selectors not found for start or end elements.');
      }
      
      await page.dragAndDrop(startSelector, endSelector);
      return successResult(`Successfully dragged from ${params.startElement} to ${params.endElement}`);
    } catch (error) {
      console.error('[MCP-CDP] Drag failed:', error);
      return errorResult(`Drag failed: ${(error as Error).message}`);
    }
  },
});

// Coordinate-based mouse operations (vision capability)
const mouseClickXY = defineTool({
  capability: 'vision',
  schema: {
    name: 'browser_mouse_click_xy',
    title: 'Click at coordinates',
    description: 'Click left mouse button at a given position',
    inputSchema: z.object({
      element: z.string().describe('Human-readable element description'),
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_mouse_click_xy called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      await page.mouse.click(params.x, params.y);
      return successResult(`Successfully clicked at (${params.x}, ${params.y}) on ${params.element}`);
    } catch (error) {
      console.error('[MCP-CDP] Click XY failed:', error);
      return errorResult(`Click at coordinates failed: ${(error as Error).message}`);
    }
  },
});

const mouseMoveXY = defineTool({
  capability: 'vision',
  schema: {
    name: 'browser_mouse_move_xy',
    title: 'Move mouse',
    description: 'Move mouse to a given position',
    inputSchema: z.object({
      element: z.string().describe('Human-readable element description'),
      x: z.number().describe('X coordinate'),
      y: z.number().describe('Y coordinate'),
    }),
    type: 'readOnly',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_mouse_move_xy called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      await page.mouse.move(params.x, params.y);
      return successResult(`Successfully moved mouse to (${params.x}, ${params.y})`);
    } catch (error) {
      console.error('[MCP-CDP] Move XY failed:', error);
      return errorResult(`Move to coordinates failed: ${(error as Error).message}`);
    }
  },
});

const mouseDragXY = defineTool({
  capability: 'vision',
  schema: {
    name: 'browser_mouse_drag_xy',
    title: 'Drag mouse',
    description: 'Drag left mouse button to a given position',
    inputSchema: z.object({
      element: z.string().describe('Human-readable element description'),
      startX: z.number().describe('Start X coordinate'),
      startY: z.number().describe('Start Y coordinate'),
      endX: z.number().describe('End X coordinate'),
      endY: z.number().describe('End Y coordinate'),
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_mouse_drag_xy called');
    try {
      const page = await connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      await page.mouse.move(params.startX, params.startY);
      await page.mouse.down();
      await page.mouse.move(params.endX, params.endY);
      await page.mouse.up();
      
      return successResult(`Successfully dragged from (${params.startX}, ${params.startY}) to (${params.endX}, ${params.endY})`);
    } catch (error) {
      console.error('[MCP-CDP] Drag XY failed:', error);
      return errorResult(`Drag coordinates failed: ${(error as Error).message}`);
    }
  },
});

export default [
  click,
  hover,
  drag,
  mouseClickXY,
  mouseMoveXY,
  mouseDragXY,
];