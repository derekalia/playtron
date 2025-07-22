const { TabApiClient } = require('./dist/tab-api-client');

async function testTabApi() {
  const client = new TabApiClient();
  
  console.log('===========================================');
  console.log('Tab API Integration Test');
  console.log('===========================================');
  
  try {
    console.log('\n1. Testing Tab API availability...');
    const available = await client.isAvailable();
    console.log('   API Available:', available);
    
    if (!available) {
      console.log('\n❌ Tab API not running. Please start the browser with Tab API enabled.');
      console.log('   Expected endpoint: http://localhost:9223/api');
      return;
    }
    
    console.log('\n2. Listing current tabs...');
    const tabs = await client.listTabs();
    console.log('   Current tabs:', tabs.length);
    tabs.forEach((tab, index) => {
      console.log(`   [${index}] ${tab.isActive ? '* ' : '  '}${tab.title || 'Untitled'} - ${tab.url}`);
      console.log(`        ID: ${tab.id}, CDP Target: ${tab.cdpTargetId}`);
    });
    
    console.log('\n3. Creating a new tab...');
    const newTab = await client.createTab('https://example.com', true);
    console.log('   Created tab:', {
      id: newTab.id,
      url: newTab.url,
      title: newTab.title,
      cdpTargetId: newTab.cdpTargetId
    });
    
    // Wait a bit for the tab to load
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n4. Listing tabs after creation...');
    const tabsAfter = await client.listTabs();
    console.log('   Total tabs:', tabsAfter.length);
    
    console.log('\n5. Switching to the new tab...');
    await client.switchTab(newTab.id);
    console.log('   Successfully switched to tab:', newTab.id);
    
    console.log('\n6. Getting CDP targets...');
    const targets = await client.getCdpTargets();
    console.log('   CDP Targets:', Object.keys(targets).length);
    for (const [tabId, target] of Object.entries(targets)) {
      console.log(`   ${tabId}: ${target.url} (${target.type})`);
    }
    
    console.log('\n7. Closing the test tab...');
    await client.closeTab(newTab.id);
    console.log('   Successfully closed tab:', newTab.id);
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('   Stack:', error.stack);
  }
}

// Run the test
console.log('Starting Tab API test...');
testTabApi().then(() => {
  console.log('\nTest completed.');
}).catch(error => {
  console.error('Test error:', error);
});