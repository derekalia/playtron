import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { TabApiClient } from './tab-api-client';

/**
 * Connects Playwright to our Electron app via Chrome DevTools Protocol
 * This allows us to use Playwright's features while keeping the Electron UI
 */
export class PlaywrightCDPConnector {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdpEndpoint: string = 'http://localhost:9222';
  private tabPageMap: Map<string, Page> = new Map(); // Track tabs by their ID
  private pageToTabMap: Map<Page, string> = new Map(); // Reverse mapping
  private currentTabId: string | null = null; // Track current tab
  private tabApiClient: TabApiClient;
  private useTabApi: boolean = false;

  constructor() {
    console.log('[PlaywrightCDP] Connector initialized');
    console.log('[PlaywrightCDP] Will connect to CDP endpoint:', this.cdpEndpoint);
    this.tabApiClient = new TabApiClient();
  }

  /**
   * Check if Tab API is available
   */
  async checkTabApiAvailability(): Promise<void> {
    this.useTabApi = await this.tabApiClient.isAvailable();
    
    if (this.useTabApi) {
      console.log('[PlaywrightCDP] ✅ Tab API is available and will be used');
    } else {
      console.warn('[PlaywrightCDP] ⚠️ Tab API not available, using legacy approach');
    }
  }

  /**
   * Connect to the Electron browser via CDP
   * Browser availability is already confirmed before calling this
   */
  async connect(): Promise<void> {
    console.log('[PlaywrightCDP] Connecting to Electron via CDP...');
    
    // Check if Tab API is available
    await this.checkTabApiAvailability();
    
    try {
      // Connect to the existing browser instance
      this.browser = await chromium.connectOverCDP(this.cdpEndpoint);
      console.log('[PlaywrightCDP] ✅ Successfully connected to Electron browser');
      
      // Get the existing context (Electron's context)
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        console.log('[PlaywrightCDP] ✅ Found existing browser context');
      } else {
        console.log('[PlaywrightCDP] ⚠️ No contexts found, this might be an issue');
      }
      
      // Get the page (our WebContentsView)
      if (this.context) {
        const pages = this.context.pages();
        console.log(`[PlaywrightCDP] Found ${pages.length} pages`);
        
        if (pages.length > 0) {
          // List all pages for debugging
          for (let i = 0; i < pages.length; i++) {
            console.log(`[PlaywrightCDP] Page ${i}: ${pages[i].url()}`);
          }
          
          // Find the WebContentsView page (not the controls page)
          // The WebContentsView typically loads external URLs while the main window loads webpack entries
          let webContentsViewPage = null;
          
          for (const page of pages) {
            const url = page.url();
            // Skip webpack/localhost URLs (these are usually the control UI)
            if (!url.includes('localhost') && !url.includes('webpack') && !url.includes('file://')) {
              webContentsViewPage = page;
              break;
            }
          }
          
          // If we couldn't find a non-localhost page, try to find one that's not about:blank
          if (!webContentsViewPage) {
            for (const page of pages) {
              if (page.url() !== 'about:blank') {
                webContentsViewPage = page;
              }
            }
          }
          
          // Fall back to the last page if we still haven't found one
          this.page = webContentsViewPage || pages[pages.length - 1];
          console.log(`[PlaywrightCDP] ✅ Selected page: ${this.page.url()}`);
          
          // Set up event listeners
          this.setupPageListeners();
        } else {
          console.log('[PlaywrightCDP] No pages found, waiting for page creation...');
          // Wait for a page to be created
          this.page = await this.context.waitForEvent('page');
          console.log('[PlaywrightCDP] ✅ Page created, connected');
          this.setupPageListeners();
        }
      }
      
      // Connection successful
      
    } catch (error) {
      console.error('[PlaywrightCDP] ❌ Failed to connect to Electron browser:', (error as Error).message);
      console.error('[PlaywrightCDP] Error details:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners for the page
   */
  private setupPageListeners(): void {
    if (!this.page) return;
    
    this.page.on('load', () => {
      console.log(`[PlaywrightCDP] Page loaded: ${this.page?.url()}`);
    });
    
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('[PlaywrightCDP] Console error:', msg.text());
      }
    });
  }

  /**
   * Get accessibility snapshot of the current page
   * This is the key feature - getting structured data without screenshots
   */
  async getAccessibilitySnapshot(options?: { interestingOnly?: boolean; root?: any }): Promise<any> {
    if (!this.page) {
      console.error('[PlaywrightCDP] ERROR: No page connected when getting snapshot');
      throw new Error('No page connected');
    }
    
    console.log('[PlaywrightCDP] Getting accessibility snapshot...');
    console.log('[PlaywrightCDP] Page state:', {
      url: this.page.url(),
      isClosed: this.page.isClosed()
    });
    
    try {
      const snapshot = await this.page.accessibility.snapshot({
        interestingOnly: options?.interestingOnly !== false, // Default to true
        root: options?.root
      });
      
      console.log('[PlaywrightCDP] Accessibility snapshot captured successfully');
      return snapshot;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to get accessibility snapshot:', error);
      console.error('[PlaywrightCDP] Error details:', {
        message: (error as Error).message,
        stack: (error as Error).stack
      });
      
      // Check if the page is still valid
      if (this.page.isClosed()) {
        console.error('[PlaywrightCDP] Page is closed! Need to reconnect.');
        this.page = null;
      }
      
      throw error;
    }
  }

  /**
   * Convert accessibility snapshot to a simplified format
   * Following Playwright MCP's approach
   */
  async getSimplifiedPageStructure(): Promise<string> {
    if (!this.page) {
      throw new Error('No page connected');
    }
    
    const url = this.page.url();
    const title = await this.page.title();
    
    console.log('[PlaywrightCDP] Getting page snapshot...');
    
    const snapshot = await this.getAccessibilitySnapshot();
    
    if (!snapshot) {
      return 'No accessibility data available';
    }
    
    // Start with page metadata (like Playwright MCP)
    let result = `url: ${url}\ntitle: ${title}\n\n`;
    
    // Convert to a simplified text representation
    const simplified = this.simplifyAccessibilityNode(snapshot);
    result += this.formatAsYAML(simplified);
    
    return result;
  }

  /**
   * Recursively simplify accessibility nodes
   */
  private simplifyAccessibilityNode(node: any, depth: number = 0): any[] {
    const results: any[] = [];
    
    if (!node) return results;
    
    // Extract relevant information
    const simplified: any = {
      role: node.role,
      name: node.name,
      value: node.value,
      description: node.description,
      level: depth
    };
    
    // Add additional properties if they exist
    if (node.checked !== undefined) simplified.checked = node.checked;
    if (node.disabled !== undefined) simplified.disabled = node.disabled;
    if (node.expanded !== undefined) simplified.expanded = node.expanded;
    if (node.selected !== undefined) simplified.selected = node.selected;
    if (node.multiselectable !== undefined) simplified.multiselectable = node.multiselectable;
    if (node.required !== undefined) simplified.required = node.required;
    if (node.readonly !== undefined) simplified.readonly = node.readonly;
    
    // Only include nodes with meaningful content
    if (simplified.role || simplified.name || simplified.value) {
      results.push(simplified);
    }
    
    // Process children
    if (node.children) {
      for (const child of node.children) {
        results.push(...this.simplifyAccessibilityNode(child, depth + 1));
      }
    }
    
    return results;
  }

  /**
   * Format simplified structure as YAML-like text
   * Following Playwright MCP's compact format with element references
   */
  private formatAsYAML(nodes: any[]): string {
    let result = 'elements:\n';
    let elementIndex = 0;
    const elementRefs = new Map<any, string>();
    
    // First pass: assign references to interactive elements
    for (const node of nodes) {
      if (this.isInteractiveNode(node)) {
        elementRefs.set(node, `[${elementIndex++}]`);
      }
    }
    
    // Second pass: format the output
    for (const node of nodes) {
      // Skip non-relevant nodes for cleaner output
      if (!this.isRelevantNode(node)) {
        continue;
      }
      
      const indent = '  '.repeat(Math.min(node.level + 1, 3));
      const ref = elementRefs.get(node) || '';
      
      // Format like Playwright MCP: compact single-line format
      let line = `${indent}${ref}`;
      
      if (ref) line += ' ';
      
      line += `${node.role || 'element'}`;
      
      if (node.name) {
        line += ` "${node.name.replace(/"/g, '\'')}"`;
      }
      
      // Add value for input fields
      if (node.value && ['textbox', 'searchbox', 'spinbutton'].includes(node.role)) {
        line += ` (value: "${node.value.replace(/"/g, '\'')}")`;
      }
      
      // Add relevant states in brackets
      const states = [];
      if (node.checked) states.push('checked');
      if (node.disabled) states.push('disabled');
      if (node.selected) states.push('selected');
      if (node.expanded) states.push('expanded');
      if (node.required) states.push('required');
      if (node.readonly) states.push('readonly');
      
      if (states.length > 0) {
        line += ` [${states.join(', ')}]`;
      }
      
      result += line + '\n';
    }
    
    return result;
  }
  
  /**
   * Check if a node is interactive (can be clicked, typed into, etc.)
   */
  private isInteractiveNode(node: any): boolean {
    const interactiveRoles = [
      'button', 'link', 'textbox', 'checkbox', 'radio',
      'combobox', 'listbox', 'menu', 'menuitem', 'tab',
      'slider', 'spinbutton', 'searchbox', 'switch'
    ];
    
    return interactiveRoles.includes(node.role);
  }
  
  /**
   * Check if a node is relevant for the snapshot
   */
  private isRelevantNode(node: any): boolean {
    // Skip empty text nodes
    if (node.role === 'text' && (!node.name || node.name.trim() === '')) {
      return false;
    }
    
    // Include interactive elements
    if (this.isInteractiveNode(node)) {
      return true;
    }
    
    // Include important structural elements
    const structuralRoles = [
      'heading', 'img', 'list', 'listitem', 'article',
      'navigation', 'main', 'form', 'table', 'region'
    ];
    
    if (structuralRoles.includes(node.role)) {
      return true;
    }
    
    // Include if it has a meaningful name and isn't generic
    if (node.name && node.name.trim().length > 0 && node.role !== 'generic') {
      return true;
    }
    
    return false;
  }

  /**
   * Get the connected Playwright page instance
   * Ensures we're using the correct page by syncing with Tab API if available
   */
  async getPage(): Promise<Page | null> {
    // If using Tab API, sync to ensure we have the right page
    if (this.useTabApi && this.tabApiClient) {
      await this.syncWithActiveTab();
    }
    return this.page;
  }

  /**
   * Disconnect from the browser
   */
  async disconnect(): Promise<void> {
    console.log('[PlaywrightCDP] Disconnecting from Electron browser');
    
    // We don't close the browser as it's managed by Electron
    // Just disconnect our connection
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.browser !== null && this.page !== null;
  }
  
  /**
   * Ensure we're controlling the correct page (WebContentsView)
   * Call this before operations to handle page switches
   */
  async ensureCorrectPage(): Promise<void> {
    if (!this.context) {
      console.error('[PlaywrightCDP] No context available in ensureCorrectPage');
      return;
    }
    
    const pages = this.context.pages();
    console.log(`[PlaywrightCDP] ensureCorrectPage: Found ${pages.length} pages`);
    
    // Log all pages for debugging
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const url = page.url();
      const isClosed = page.isClosed();
      console.log(`[PlaywrightCDP] Page ${i}: ${url} (closed: ${isClosed})`);
    }
    
    // If we have a current tab ID, try to maintain that page
    if (this.currentTabId && this.tabPageMap.has(this.currentTabId)) {
      const targetPage = this.tabPageMap.get(this.currentTabId);
      if (targetPage && !targetPage.isClosed()) {
        this.page = targetPage;
        console.log(`[PlaywrightCDP] Maintaining current tab ${this.currentTabId}: ${this.page.url()}`);
        return;
      }
    }
    
    // If current page is closed, find a new one
    if (this.page && this.page.isClosed()) {
      console.log('[PlaywrightCDP] Current page is closed, finding new page...');
      this.page = null;
    }
    
    // If we don't have a page or need to switch
    if (!this.page || pages.length > 1) {
      // Find the best page to use
      let selectedPage = null;
      
      // First priority: Find a non-localhost, non-webpack page
      for (const page of pages) {
        if (page.isClosed()) continue;
        const url = page.url();
        if (!url.includes('localhost') && !url.includes('webpack') && !url.includes('file://') && url !== 'about:blank') {
          selectedPage = page;
          console.log(`[PlaywrightCDP] Selected external page: ${url}`);
          break;
        }
      }
      
      // Second priority: Any non-closed page that's not about:blank
      if (!selectedPage) {
        for (const page of pages) {
          if (!page.isClosed() && page.url() !== 'about:blank') {
            selectedPage = page;
            console.log(`[PlaywrightCDP] Selected non-blank page: ${page.url()}`);
            break;
          }
        }
      }
      
      // Last resort: Any non-closed page
      if (!selectedPage) {
        for (const page of pages) {
          if (!page.isClosed()) {
            selectedPage = page;
            console.log(`[PlaywrightCDP] Selected any available page: ${page.url()}`);
            break;
          }
        }
      }
      
      if (selectedPage && selectedPage !== this.page) {
        console.log(`[PlaywrightCDP] Switching to page: ${selectedPage.url()}`);
        this.page = selectedPage;
        this.setupPageListeners();
      } else if (!selectedPage) {
        console.error('[PlaywrightCDP] No valid page found!');
      }
    }
  }



  /**
   * Remove a tab from internal tracking
   */
  removeTab(tabId: string): void {
    const page = this.tabPageMap.get(tabId);
    if (page) {
      this.pageToTabMap.delete(page);
      this.tabPageMap.delete(tabId);
      
      if (this.currentTabId === tabId) {
        this.currentTabId = null;
        this.page = null;
      }
    }
  }

  /**
   * Create a new tab using the Tab API
   */
  private async createTabViaApi(url: string): Promise<string> {
    console.log(`[PlaywrightCDP] Creating new tab via API with URL: ${url}`);
    
    try {
      // Use the new API
      const tab = await this.tabApiClient.createTab(url);
      
      // Wait for CDP to recognize the new target
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Since the new tab is created and activated, we need to update our page reference
      await this.syncWithActiveTab();
      
      return tab.id;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to create tab via API:', error);
      throw error;
    }
  }

  /**
   * Create a new tab using legacy approach
   */
  private async createTabLegacy(url: string): Promise<string> {
    console.log(`[PlaywrightCDP] Creating new tab with URL: ${url}`);
    
    if (!this.context) {
      throw new Error('Not connected to browser context');
    }
    
    try {
      // Store the current pages before creating new tab
      const pagesBefore = this.context.pages().filter(p => 
        !p.url().includes('localhost') && !p.url().includes('webpack') && !p.url().includes('file://')
      );
      
      // Create tab by evaluating JavaScript in the main renderer process
      const pages = this.context.pages();
      let mainPage = null;
      
      // Find the main renderer page (webpack/localhost)
      for (const page of pages) {
        if (page.url().includes('localhost') || page.url().includes('webpack')) {
          mainPage = page;
          break;
        }
      }
      
      if (!mainPage) {
        throw new Error('Could not find main renderer page to create tab');
      }
      
      // Get the actual tab ID from Electron
      const tabId = await mainPage.evaluate(async (url: string) => {
        const win = window as any;
        if (win.electronAPI && win.electronAPI.createTab) {
          // This should return the actual tab ID created by Electron
          return await win.electronAPI.createTab(url);
        }
        throw new Error('electronAPI not available');
      }, url);
      
      console.log(`[PlaywrightCDP] Created tab with ID: ${tabId}`);
      
      // Wait for the new page to appear
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Find the new page that was created
      const pagesAfter = this.context.pages().filter(p => 
        !p.url().includes('localhost') && !p.url().includes('webpack') && !p.url().includes('file://')
      );
      
      // Find the page that wasn't there before
      let newPage: Page | null = null;
      for (const page of pagesAfter) {
        let isNew = true;
        for (const oldPage of pagesBefore) {
          if (page === oldPage) {
            isNew = false;
            break;
          }
        }
        if (isNew) {
          newPage = page;
          break;
        }
      }
      
      if (newPage) {
        this.tabPageMap.set(tabId, newPage);
        this.pageToTabMap.set(newPage, tabId);
        console.log(`[PlaywrightCDP] Mapped tab ${tabId} to page: ${newPage.url()}`);
      } else {
        console.warn(`[PlaywrightCDP] Could not find new page for tab ${tabId}`);
      }
      
      return tabId;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to create tab:', error);
      throw error;
    }
  }

  /**
   * Create a new tab - delegates to API or legacy approach
   */
  async createTab(url: string = 'https://www.google.com'): Promise<string> {
    if (this.useTabApi) {
      return this.createTabViaApi(url);
    } else {
      return this.createTabLegacy(url);
    }
  }

  /**
   * Switch to a specific tab using the Tab API
   */
  private async switchTabViaApi(tabId: string): Promise<boolean> {
    console.log(`[PlaywrightCDP] Switching to tab via API: ${tabId}`);
    
    try {
      // Use the API to switch tabs
      await this.tabApiClient.switchTab(tabId);
      
      // Wait a bit for the switch to take effect
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Sync with the active tab
      await this.syncWithActiveTab();
      
      return true;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to switch tab via API:', error);
      throw error;
    }
  }

  /**
   * Switch to a specific tab using legacy approach
   */
  private async switchTabLegacy(tabId: string): Promise<boolean> {
    console.log(`[PlaywrightCDP] Switching to tab: ${tabId}`);
    
    if (!this.context) {
      throw new Error('Not connected to browser context');
    }
    
    try {
      // Find the main renderer page to trigger the switch
      const pages = this.context.pages();
      let mainPage = null;
      
      for (const page of pages) {
        if (page.url().includes('localhost') || page.url().includes('webpack')) {
          mainPage = page;
          break;
        }
      }
      
      if (!mainPage) {
        throw new Error('Could not find main renderer page to switch tab');
      }
      
      // Use the Electron API to switch tabs
      await mainPage.evaluate((tabId: string) => {
        const win = window as any;
        if (win.electronAPI && win.electronAPI.switchTab) {
          win.electronAPI.switchTab(tabId);
        }
      }, tabId);
      
      // Update our current page to the switched tab
      // Wait a bit for the tab switch to complete
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get all tabs from Electron to find the index
      const electronTabs = await mainPage.evaluate(() => {
        const win = window as any;
        if (win.electronAPI && win.electronAPI.getTabs) {
          return win.electronAPI.getTabs();
        }
        return null;
      });
      
      if (electronTabs && Array.isArray(electronTabs)) {
        const tabIndex = electronTabs.findIndex(t => t.id === tabId);
        
        if (tabIndex !== -1) {
          // Get pages in the same order
          const pages = this.context.pages().filter(p => 
            !p.url().includes('localhost') && 
            !p.url().includes('webpack') && 
            !p.url().includes('file://')
          );
          
          if (tabIndex < pages.length) {
            const page = pages[tabIndex];
            this.page = page;
            this.currentTabId = tabId;
            
            // Update mappings
            this.tabPageMap.set(tabId, page);
            this.pageToTabMap.set(page, tabId);
            
            // Bring the page to front
            await page.bringToFront();
            
            console.log(`[PlaywrightCDP] Switched to tab ${tabId} (index ${tabIndex}): ${page.url()}`);
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to switch tab:', error);
      throw error;
    }
  }

  /**
   * Switch to a specific tab - delegates to API or legacy approach
   */
  async switchTab(tabId: string): Promise<boolean> {
    if (this.useTabApi) {
      return this.switchTabViaApi(tabId);
    } else {
      return this.switchTabLegacy(tabId);
    }
  }

  /**
   * List all tabs using the Tab API
   */
  private async listTabsViaApi(): Promise<any[]> {
    console.log('[PlaywrightCDP] Listing all tabs via API');
    
    try {
      const tabs = await this.tabApiClient.listTabs();
      
      return tabs.map(tab => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        isActive: tab.isActive || tab.id === this.currentTabId
      }));
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to list tabs via API:', error);
      throw error;
    }
  }

  /**
   * List all available tabs using legacy approach
   */
  private async listTabsLegacy(): Promise<any[]> {
    console.log('[PlaywrightCDP] Listing all tabs');
    
    if (!this.context) {
      throw new Error('Not connected to browser context');
    }
    
    try {
      const pages = this.context.pages();
      let mainPage = null;
      
      // Find the main renderer page
      for (const page of pages) {
        if (page.url().includes('localhost') || page.url().includes('webpack')) {
          mainPage = page;
          break;
        }
      }
      
      if (!mainPage) {
        // Fallback to manual page listing
        const pageInfo = [];
        let index = 0;
        for (const page of pages) {
          if (!page.isClosed() && !page.url().includes('localhost') && !page.url().includes('webpack')) {
            const tabId = this.pageToTabMap.get(page) || `page-${index}`;
            pageInfo.push({
              id: tabId,
              url: page.url(),
              title: await page.title().catch(() => 'Unknown'),
              isActive: page === this.page
            });
            index++;
          }
        }
        return pageInfo;
      }
      
      // Get tabs from the Electron renderer
      const electronTabs = await mainPage.evaluate(() => {
        const win = window as any;
        if (win.electronAPI && win.electronAPI.getTabs) {
          return win.electronAPI.getTabs();
        }
        return null;
      });
      
      if (electronTabs && Array.isArray(electronTabs)) {
        // Map Electron tabs to our page references
        const result = [];
        for (const tab of electronTabs) {
          const page = this.tabPageMap.get(tab.id);
          if (page) {
            result.push({
              id: tab.id,
              url: page.url(),
              title: await page.title().catch(() => tab.title || 'Unknown'),
              isActive: tab.isActive || page === this.page
            });
          } else {
            // Tab exists in Electron but we don't have a page reference yet
            result.push({
              id: tab.id,
              url: tab.url || 'unknown',
              title: tab.title || 'Unknown',
              isActive: tab.isActive || false
            });
          }
        }
        return result;
      }
      
      // Fallback: List pages we know about
      const pageInfo = [];
      let index = 0;
      for (const page of pages) {
        if (!page.isClosed() && !page.url().includes('localhost') && !page.url().includes('webpack')) {
          const tabId = this.pageToTabMap.get(page) || `page-${index}`;
          pageInfo.push({
            id: tabId,
            url: page.url(),
            title: await page.title().catch(() => 'Unknown'),
            isActive: page === this.page
          });
          index++;
        }
      }
      
      console.log(`[PlaywrightCDP] Found ${pageInfo.length} tabs`);
      return pageInfo;
    } catch (error) {
      console.error('[PlaywrightCDP] Failed to list tabs:', error);
      throw error;
    }
  }

  /**
   * List all available tabs - delegates to API or legacy approach
   */
  async listTabs(): Promise<any[]> {
    if (this.useTabApi) {
      return this.listTabsViaApi();
    } else {
      return this.listTabsLegacy();
    }
  }

  /**
   * Sync the Playwright page reference with the Tab API's active tab
   * This ensures snapshots are taken from the correct tab
   */
  private async syncWithActiveTab(): Promise<void> {
    console.log('[PlaywrightCDP] Syncing with active tab from Tab API');
    
    if (!this.context) {
      console.error('[PlaywrightCDP] No context available for sync');
      return;
    }
    
    try {
      // Get the active tab from the Tab API
      const tabs = await this.tabApiClient.listTabs();
      const activeTab = tabs.find(t => t.isActive);
      
      if (!activeTab) {
        console.error('[PlaywrightCDP] No active tab found in Tab API');
        console.error('[PlaywrightCDP] Available tabs:', tabs.map(t => ({ id: t.id, url: t.url, isActive: t.isActive })));
        return;
      }
      
      console.log(`[PlaywrightCDP] Active tab from API: ${activeTab.id} (${activeTab.url})`);
      
      // Find the matching page
      const pages = this.context.pages().filter(p => 
        !p.url().includes('localhost') && 
        !p.url().includes('webpack') && 
        !p.url().includes('file://')
      );
      
      console.log(`[PlaywrightCDP] Found ${pages.length} content pages`);
      pages.forEach((page, index) => {
        console.log(`[PlaywrightCDP]   Page ${index}: ${page.url()}`);
      });
      
      let matchedPage: Page | null = null;
      
      // First try: Match by URL (most reliable for new tabs)
      matchedPage = pages.find(p => p.url() === activeTab.url) || null;
      
      if (matchedPage) {
        console.log(`[PlaywrightCDP] Found matching page by URL: ${matchedPage.url()}`);
      } else {
        console.log('[PlaywrightCDP] No URL match found, trying other methods...');
        
        // Try to get CDP target mapping
        const cdpTargets = await this.tabApiClient.getCdpTargets();
        
        if (cdpTargets && Object.keys(cdpTargets).length > 0) {
          const targetInfo = cdpTargets[activeTab.id];
          if (targetInfo) {
            console.log(`[PlaywrightCDP] CDP target ID for active tab: ${targetInfo.cdpTargetId}`);
            
            // Try to match by CDP target ID
            for (const page of pages) {
              try {
                // Get the CDP session for this page
                const client = await this.context.newCDPSession(page);
                const pageTargetInfo = await client.send('Target.getTargetInfo');
                await client.detach();
                
                console.log(`[PlaywrightCDP] Page ${page.url()} has CDP target: ${pageTargetInfo.targetInfo.targetId}`);
                
                if (pageTargetInfo.targetInfo.targetId === targetInfo.cdpTargetId) {
                  matchedPage = page;
                  console.log(`[PlaywrightCDP] Found matching page by CDP target ID`);
                  break;
                }
              } catch (error) {
                console.error(`[PlaywrightCDP] Error getting CDP target for page:`, error);
              }
            }
          }
        }
        
        // Last resort: Use the most recently navigated page
        if (!matchedPage && pages.length > 0) {
          // Sort by navigation time if possible, otherwise use the last page
          matchedPage = pages[pages.length - 1];
          console.log(`[PlaywrightCDP] Using last page as fallback: ${matchedPage.url()}`);
        }
      }
      
      if (matchedPage) {
        this.page = matchedPage;
        this.currentTabId = activeTab.id;
        this.tabPageMap.set(activeTab.id, matchedPage);
        this.pageToTabMap.set(matchedPage, activeTab.id);
        
        // Bring the page to front
        await matchedPage.bringToFront();
        
        console.log(`[PlaywrightCDP] Successfully synced to active tab ${activeTab.id}: ${matchedPage.url()}`);
      } else {
        console.error('[PlaywrightCDP] Could not find matching page for active tab');
        console.error('[PlaywrightCDP] Active tab URL:', activeTab.url);
        console.error('[PlaywrightCDP] Available page URLs:', pages.map(p => p.url()));
      }
    } catch (error) {
      console.error('[PlaywrightCDP] Error syncing with active tab:', error);
    }
  }
}