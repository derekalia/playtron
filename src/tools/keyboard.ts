import { z } from 'zod';
import { defineTool, successResult, errorResult } from './tool';
import { elementReferences } from './mouse';

const baseElementSchema = z.object({
  element: z.string().describe('Human-readable element description'),
  ref: z.string().optional().describe('Element reference from snapshot'),
  selector: z.string().optional().describe('CSS selector or Playwright selector')
});

const pressKey = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_press_key',
    title: 'Press a key',
    description: 'Press a key on the keyboard',
    inputSchema: z.object({
      key: z.string().describe('Name of the key to press or a character to generate, such as `ArrowLeft` or `a`'),
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error(`[MCP-CDP] Tool: browser_press_key called with key: ${params.key}`);
    try {
      const page = connector.getPage();
      if (!page) {
        throw new Error('No page connected');
      }
      
      await page.keyboard.press(params.key);
      return successResult(`Successfully pressed key: ${params.key}`);
    } catch (error) {
      console.error('[MCP-CDP] Press key failed:', error);
      return errorResult(`Press key failed: ${(error as Error).message}`);
    }
  },
});

const type = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_type',
    title: 'Type text',
    description: 'Type text into editable element',
    inputSchema: baseElementSchema.extend({
      text: z.string().describe('Text to type into the element'),
      submit: z.boolean().optional().describe('Whether to submit entered text (press Enter after)'),
      slowly: z.boolean().optional().describe('Whether to type one character at a time'),
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_type called');
    try {
      const page = connector.getPage();
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
      
      const locator = page.locator(selector);
      
      if (params.slowly) {
        // Type one character at a time
        await locator.pressSequentially(params.text);
      } else {
        // Fill instantly
        await locator.fill(params.text);
      }
      
      if (params.submit) {
        await locator.press('Enter');
      }
      
      return successResult(`Successfully typed "${params.text}" into ${params.element}`);
    } catch (error) {
      console.error('[MCP-CDP] Type failed:', error);
      return errorResult(`Type failed: ${(error as Error).message}`);
    }
  },
});

const fill = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_fill',
    title: 'Fill input',
    description: 'Fill an input field instantly',
    inputSchema: baseElementSchema.extend({
      value: z.string().describe('Value to fill'),
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_fill called');
    try {
      const page = connector.getPage();
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
      
      await page.fill(selector, params.value);
      return successResult(`Successfully filled "${params.value}" into ${params.element}`);
    } catch (error) {
      console.error('[MCP-CDP] Fill failed:', error);
      return errorResult(`Fill failed: ${(error as Error).message}`);
    }
  },
});

const selectOption = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_select_option',
    title: 'Select option',
    description: 'Select an option in a dropdown',
    inputSchema: baseElementSchema.extend({
      values: z.array(z.string()).describe('Array of values to select in the dropdown'),
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_select_option called');
    try {
      const page = connector.getPage();
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
      
      await page.selectOption(selector, params.values);
      return successResult(`Successfully selected options: ${params.values.join(', ')} in ${params.element}`);
    } catch (error) {
      console.error('[MCP-CDP] Select option failed:', error);
      return errorResult(`Select option failed: ${(error as Error).message}`);
    }
  },
});

const setChecked = defineTool({
  capability: 'core',
  schema: {
    name: 'browser_set_checked',
    title: 'Set checkbox',
    description: 'Check or uncheck a checkbox',
    inputSchema: baseElementSchema.extend({
      checked: z.boolean().describe('Whether to check or uncheck'),
    }),
    type: 'destructive',
  },
  handle: async (connector, params) => {
    console.error('[MCP-CDP] Tool: browser_set_checked called');
    try {
      const page = connector.getPage();
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
      
      await page.setChecked(selector, params.checked);
      return successResult(`Successfully ${params.checked ? 'checked' : 'unchecked'} ${params.element}`);
    } catch (error) {
      console.error('[MCP-CDP] Set checked failed:', error);
      return errorResult(`Set checked failed: ${(error as Error).message}`);
    }
  },
});

export default [
  pressKey,
  type,
  fill,
  selectOption,
  setChecked,
];