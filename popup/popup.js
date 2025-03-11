// popup/popup.js
document.addEventListener('DOMContentLoaded', function() {
  console.log("Enhanced Translator popup loaded");
  
  // Load saved settings
  browser.storage.local.get([
    'geminiApiKey',
    'showMeanings',
    'showSynonyms',
    'showExamples'
  ], function(data) {
    // Load API key
    if (data.geminiApiKey) {
      document.getElementById('geminiApiKey').value = data.geminiApiKey;
    }
    
    // Load feature toggle states (default to true if not set)
    document.getElementById('showMeanings').checked = 
      data.showMeanings !== undefined ? data.showMeanings : true;
    document.getElementById('showSynonyms').checked = 
      data.showSynonyms !== undefined ? data.showSynonyms : true;
    document.getElementById('showExamples').checked = 
      data.showExamples !== undefined ? data.showExamples : true;
    
    // Update status message
    updateStatusMessage(data.geminiApiKey);
    
    console.log("Settings loaded from storage");
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', function() {
    const geminiApiKey = document.getElementById('geminiApiKey').value.trim();
    const showMeanings = document.getElementById('showMeanings').checked;
    const showSynonyms = document.getElementById('showSynonyms').checked;
    const showExamples = document.getElementById('showExamples').checked;
    
    if (geminiApiKey) {
      console.log("Saving settings");
      
      // Save all settings at once
      browser.storage.local.set({ 
        'geminiApiKey': geminiApiKey,
        'showMeanings': showMeanings,
        'showSynonyms': showSynonyms,
        'showExamples': showExamples
      }, function() {
        // Notify the background script that settings have been updated
        browser.runtime.sendMessage({ 
          action: "settingsUpdated", 
          settings: {
            geminiApiKey: geminiApiKey,
            showMeanings: showMeanings,
            showSynonyms: showSynonyms,
            showExamples: showExamples
          }
        }, function(response) {
          console.log("Settings update message sent to background");
        });
        
        updateStatusMessage(geminiApiKey);
      });
    } else {
      document.getElementById('statusMessage').textContent = 'Status: Gemini API key is required';
      console.log("Empty Gemini API key, not saving");
    }
  });
  
  function updateStatusMessage(geminiApiKey) {
    const statusMessage = document.getElementById('statusMessage');
    if (geminiApiKey) {
      statusMessage.textContent = 'Status: Settings Saved';
    } else {
      statusMessage.textContent = 'Status: Gemini API key required';
    }
  }
});