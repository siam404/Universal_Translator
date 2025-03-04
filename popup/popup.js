// popup/popup.js
document.addEventListener('DOMContentLoaded', function() {
    console.log("Popup loaded");
    
    // Load the saved API key
    browser.storage.local.get('geminiApiKey', function(data) {
      if (data.geminiApiKey) {
        document.getElementById('apiKey').value = data.geminiApiKey;
        document.getElementById('statusMessage').textContent = 'Status: API Key Saved';
        console.log("API key loaded from storage");
      } else {
        console.log("No API key found in storage");
      }
    });
  
    // Save API key
    document.getElementById('saveKey').addEventListener('click', function() {
      const apiKey = document.getElementById('apiKey').value.trim();
      
      if (apiKey) {
        console.log("Saving API key");
        browser.storage.local.set({ 'geminiApiKey': apiKey }, function() {
          document.getElementById('statusMessage').textContent = 'Status: API Key Saved';
          
          // Notify the background script that the API key has been updated
          browser.runtime.sendMessage({ 
            action: "apiKeySaved", 
            apiKey: apiKey 
          }, function(response) {
            console.log("API key update message sent to background");
          });
        });
      } else {
        document.getElementById('statusMessage').textContent = 'Status: Please enter a valid API key';
        console.log("Empty API key, not saving");
      }
    });
  });