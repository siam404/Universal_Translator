// popup/popup.js
document.addEventListener('DOMContentLoaded', function() {
  console.log("Enhanced Translator popup loaded");
  
  // Prevent text selection outside of API key input
  document.addEventListener('selectstart', function(e) {
    // Allow selection only in API key input field
    if (e.target.id !== 'geminiApiKey') {
      e.preventDefault();
      return false;
    }
  });
  
  // Prevent context menu except for API key input
  document.addEventListener('contextmenu', function(e) {
    if (e.target.id !== 'geminiApiKey') {
      e.preventDefault();
      return false;
    }
  });
  
  // Prevent copy except for API key input
  document.addEventListener('copy', function(e) {
    if (e.target.id !== 'geminiApiKey' && !isDescendantOf(e.target, document.getElementById('geminiApiKey'))) {
      e.preventDefault();
      return false;
    }
  });
  
  // API Key Help Modal functionality
  const apiKeyHelpModal = document.getElementById('apiKeyHelpModal');
  const closeModalBtn = document.querySelector('.close-modal');
  
  // Close modal when X is clicked
  closeModalBtn.addEventListener('click', function() {
    apiKeyHelpModal.style.display = 'none';
  });
  
  // Close modal when clicking outside of it
  window.addEventListener('click', function(event) {
    if (event.target === apiKeyHelpModal) {
      apiKeyHelpModal.style.display = 'none';
    }
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && apiKeyHelpModal.style.display === 'block') {
      apiKeyHelpModal.style.display = 'none';
    }
  });
  
  // Load saved settings
  browser.storage.local.get([
    'geminiApiKey',
    'showMeanings',
    'targetLanguage',
    'hotkeysEnabled',
    'hotkeyModifier',
    'hotkeyKey'
  ], function(data) {
    // Load API key
    if (data.geminiApiKey) {
      document.getElementById('geminiApiKey').value = data.geminiApiKey;
    }
    
    // Load target language (default to English if not set)
    if (data.targetLanguage) {
      document.getElementById('targetLanguage').value = data.targetLanguage;
    } else {
      // If no language is set, default to English
      document.getElementById('targetLanguage').value = 'English';
    }
    
    // Load feature toggle states (default to true if not set)
    document.getElementById('showMeanings').checked = 
      data.showMeanings !== undefined ? data.showMeanings : true;
    
    // Load hotkeys settings
    const hotkeysEnabledCheckbox = document.getElementById('hotkeysEnabled');
    hotkeysEnabledCheckbox.checked = 
      data.hotkeysEnabled !== undefined ? data.hotkeysEnabled : false;
      
    // Set hotkey modifier (default to Shift)
    if (data.hotkeyModifier) {
      document.getElementById('hotkeyModifier').value = data.hotkeyModifier;
      document.getElementById('currentModifierText').textContent = data.hotkeyModifier;
    } else {
      document.getElementById('hotkeyModifier').value = 'Shift';
      document.getElementById('currentModifierText').textContent = 'Shift';
    }
    
    // Set hotkey key (default to T)
    if (data.hotkeyKey) {
      document.getElementById('hotkeyKey').value = data.hotkeyKey;
      document.getElementById('currentKeyText').textContent = data.hotkeyKey;
    } else {
      document.getElementById('hotkeyKey').value = 'T';
      document.getElementById('currentKeyText').textContent = 'T';
    }
    
    // Update initial visibility of the hotkey editor
    updateHotkeyEditorVisibility();
    
    // Update status message
    updateStatusMessage(data.geminiApiKey);
    
    console.log("Settings loaded from storage");
  });
  
  // Make target language change instant
  document.getElementById('targetLanguage').addEventListener('change', function() {
    const targetLanguage = this.value;
    
    // Save and broadcast the target language
    browser.storage.local.set({ 'targetLanguage': targetLanguage }, function() {
      console.log("Target language saved:", targetLanguage);
      
      // Get current hotkey settings
      const hotkeysEnabled = document.getElementById('hotkeysEnabled').checked;
      const hotkeyModifier = document.getElementById('hotkeyModifier').value;
      const hotkeyKey = document.getElementById('hotkeyKey').value;
      
      // Broadcast the settings to all tabs
      broadcastTargetLanguageUpdate(targetLanguage);
      
      // Show a brief status notification
      const statusElem = document.getElementById('statusMessage');
      const originalText = statusElem.textContent;
      const originalColor = statusElem.style.color;
      
      statusElem.textContent = `Status: Language set to ${targetLanguage}`;
      statusElem.style.color = '#4CAF50';
      
      // Reset the status message after a brief delay
      setTimeout(() => {
        if (originalText.includes('API key')) {
          // Keep API key status messages
          statusElem.textContent = originalText;
          statusElem.style.color = originalColor;
        } else {
          // Default status
          updateDefaultStatus();
        }
      }, 1500);
    });
  });
  
  // Make meanings toggle instant
  document.getElementById('showMeanings').addEventListener('change', function() {
    const showMeanings = this.checked;
    
    // Save and broadcast the meanings setting
    browser.storage.local.set({ 'showMeanings': showMeanings }, function() {
      console.log("Meanings setting saved:", showMeanings ? "shown" : "hidden");
      
      // Notify the background script that settings have been updated
      browser.runtime.sendMessage({ 
        action: "settingsUpdated", 
        settings: {
          showMeanings: showMeanings
        }
      });
      
      // Show a brief status notification
      const statusElem = document.getElementById('statusMessage');
      const originalText = statusElem.textContent;
      const originalColor = statusElem.style.color;
      
      statusElem.textContent = `Status: Meanings ${showMeanings ? 'enabled' : 'disabled'}`;
      statusElem.style.color = '#4CAF50';
      
      // Reset the status message after a brief delay
      setTimeout(() => {
        if (originalText.includes('API key')) {
          // Keep API key status messages
          statusElem.textContent = originalText;
          statusElem.style.color = originalColor;
        } else {
          // Default status
          updateDefaultStatus();
        }
      }, 1500);
    });
  });
  
  // Toggle hotkeys info visibility based on checkbox state
  const hotkeysEnabledCheckbox = document.getElementById('hotkeysEnabled');
  const hotkeyDisplay = document.getElementById('hotkeyDisplay');
  const hotkeyEditor = document.getElementById('hotkeyEditor');
  
  // Function to update hotkey editor visibility
  function updateHotkeyEditorVisibility() {
    const isEnabled = hotkeysEnabledCheckbox.checked;
    
    // Show/hide hotkey display based on hotkeys enabled state
    if (hotkeyDisplay) {
      hotkeyDisplay.style.display = isEnabled ? 'flex' : 'none';
    }
    
    // Always hide the editor by default
    if (hotkeyEditor) {
      hotkeyEditor.style.display = 'none';
    }
    
    // Show/hide hotkey info text
    const hotkeyInfoText = document.querySelector('.hotkey-info-text');
    if (hotkeyInfoText) {
      hotkeyInfoText.style.display = isEnabled ? 'block' : 'none';
    }
  }
  
  // Set initial visibility
  updateHotkeyEditorVisibility();
  
  // Add event listener for checkbox change
  hotkeysEnabledCheckbox.addEventListener('change', function() {
    const isEnabled = this.checked;
    updateHotkeyEditorVisibility();
    
    // Immediately save and apply the hotkeys setting when toggled
    browser.storage.local.set({ 'hotkeysEnabled': isEnabled }, function() {
      console.log("Hotkeys setting saved: " + (isEnabled ? "enabled" : "disabled"));
      
      // Get current hotkey modifier and key
      const hotkeyModifier = document.getElementById('hotkeyModifier').value;
      const hotkeyKey = document.getElementById('hotkeyKey').value;
      
      // Broadcast the setting to all tabs
      broadcastHotkeySettings(isEnabled, hotkeyModifier, hotkeyKey);
      
      // Show a brief status notification
      const statusElem = document.getElementById('statusMessage');
      const originalText = statusElem.textContent;
      const originalColor = statusElem.style.color;
      
      statusElem.textContent = 'Status: Hotkeys ' + (isEnabled ? 'enabled' : 'disabled');
      statusElem.style.color = '#4CAF50';
      
      // Reset the status message after a brief delay
      setTimeout(() => {
        if (originalText.includes('API key')) {
          // Keep API key status messages
          statusElem.textContent = originalText;
          statusElem.style.color = originalColor;
        } else {
          // Default status
          updateDefaultStatus();
        }
      }, 1500);
    });
  });
  
  // Current hotkey button click handler - toggle editor visibility
  const currentHotkeyButton = document.getElementById('currentHotkeyButton');
  
  if (currentHotkeyButton) {
    currentHotkeyButton.addEventListener('click', function(event) {
      // Toggle the hotkey editor visibility
      if (hotkeyEditor) {
        if (hotkeyEditor.style.display === 'block') {
          // If the editor is open, close it with animation
          closeHotkeyEditor();
        } else {
          // If the editor is closed, open it with animation
          openHotkeyEditor();
        }
      }
      
      // Prevent the event from bubbling up to document
      event.stopPropagation();
    });
  }
  
  // Add a document click listener to close the editor when clicking outside
  document.addEventListener('click', function(event) {
    // Check if the editor is open and if the click is outside both the button and editor
    if (hotkeyEditor && 
        hotkeyEditor.style.display === 'block' && 
        !currentHotkeyButton.contains(event.target) && 
        !hotkeyEditor.contains(event.target)) {
      closeHotkeyEditor();
    }
  });
  
  // Function to open the hotkey editor with animation
  function openHotkeyEditor() {
    // Update the values in the editor to match current settings
    document.getElementById('hotkeyModifier').value = document.getElementById('currentModifierText').textContent;
    document.getElementById('hotkeyKey').value = document.getElementById('currentKeyText').textContent;
    
    // Display the editor
    hotkeyEditor.style.display = 'block';
    hotkeyEditor.style.opacity = '0';
    hotkeyEditor.style.transform = 'translateY(-5px)';
    
    // Make sure help button container stays visible
    document.querySelector('.help-button-container').style.visibility = 'visible';
    
    // Trigger animation
    setTimeout(() => {
      hotkeyEditor.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      hotkeyEditor.style.opacity = '1';
      hotkeyEditor.style.transform = 'translateY(0)';
    }, 10);
  }
  
  // Function to close the hotkey editor with animation
  function closeHotkeyEditor() {
    // Animate closing
    hotkeyEditor.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    hotkeyEditor.style.opacity = '0';
    hotkeyEditor.style.transform = 'translateY(-5px)';
    
    // Make sure help button container stays visible
    document.querySelector('.help-button-container').style.visibility = 'visible';
    
    // After animation completes, hide the editor
    setTimeout(() => {
      hotkeyEditor.style.display = 'none';
      // Reset transition for next open
      hotkeyEditor.style.transition = '';
    }, 200);
  }
  
  // Save hotkey button click handler
  document.getElementById('saveHotkeyButton').addEventListener('click', function() {
    saveHotkeyConfig();
    closeHotkeyEditor();
  });
  
  // Handle escape key to close the editor
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && hotkeyEditor && hotkeyEditor.style.display === 'block') {
      closeHotkeyEditor();
    }
  });
  
  // Add event listeners for hotkey dropdown changes to update the preview
  document.getElementById('hotkeyModifier').addEventListener('change', function() {
    // No action needed here - we'll update the display when applied
  });
  
  document.getElementById('hotkeyKey').addEventListener('change', function() {
    // No action needed here - we'll update the display when applied
  });
  
  // Function to save and broadcast hotkey configuration changes
  function saveHotkeyConfig() {
    const isEnabled = document.getElementById('hotkeysEnabled').checked;
    const hotkeyModifier = document.getElementById('hotkeyModifier').value;
    const hotkeyKey = document.getElementById('hotkeyKey').value;
    
    // Update the current hotkey display
    document.getElementById('currentModifierText').textContent = hotkeyModifier;
    document.getElementById('currentKeyText').textContent = hotkeyKey;
    
    // Save the modified hotkey configuration
    browser.storage.local.set({ 
      'hotkeyModifier': hotkeyModifier,
      'hotkeyKey': hotkeyKey
    }, function() {
      console.log(`Hotkey configuration updated to: ${hotkeyModifier}+${hotkeyKey}`);
      
      // Only broadcast if hotkeys are enabled
      if (isEnabled) {
        broadcastHotkeySettings(isEnabled, hotkeyModifier, hotkeyKey);
      }
      
      // Show a brief status notification
      const statusElem = document.getElementById('statusMessage');
      const originalText = statusElem.textContent;
      const originalColor = statusElem.style.color;
      
      statusElem.textContent = `Status: Hotkey set to ${hotkeyModifier}+${hotkeyKey}`;
      statusElem.style.color = '#4CAF50';
      
      // Reset the status message after a brief delay
      setTimeout(() => {
        if (originalText.includes('API key')) {
          // Keep API key status messages
          statusElem.textContent = originalText;
          statusElem.style.color = originalColor;
        } else {
          // Default status
          updateDefaultStatus();
        }
      }, 1500);
    });
  }

  // Save API Key
  document.getElementById('saveApiKey').addEventListener('click', function() {
    const geminiApiKey = document.getElementById('geminiApiKey').value.trim();
    
    if (geminiApiKey) {
      console.log("Saving API key");
      
      // Save the API key
      browser.storage.local.set({ 'geminiApiKey': geminiApiKey }, function() {
        // Notify the background script that API key has been updated
        browser.runtime.sendMessage({ 
          action: "settingsUpdated", 
          settings: {
            geminiApiKey: geminiApiKey
          }
        }, function(response) {
          console.log("API key update message sent to background");
        });
        
        updateStatusMessage(geminiApiKey);
      });
    } else {
      document.getElementById('statusMessage').textContent = 'Status: Gemini API key is required';
      document.getElementById('statusMessage').style.color = '#F44336';
      console.log("Empty Gemini API key, not saving");
    }
  });
  
  // Helper function to update the status message
  function updateStatusMessage(apiKey) {
    const statusElem = document.getElementById('statusMessage');
    if (apiKey) {
      statusElem.textContent = 'Status: API key saved';
      statusElem.style.color = '#4CAF50';
    } else {
      statusElem.textContent = 'Status: API key required';
      statusElem.style.color = '#F44336';
    }
  }
  
  // Helper function to reset status to default
  function updateDefaultStatus() {
    // Check if API key exists to determine default status
    browser.storage.local.get(['geminiApiKey'], function(data) {
      const statusElem = document.getElementById('statusMessage');
      if (data.geminiApiKey) {
        statusElem.textContent = 'Status: API key saved';
        statusElem.style.color = '#4CAF50';
      } else {
        statusElem.textContent = 'Status: API key required';
        statusElem.style.color = '#F44336';
      }
    });
  }
  
  // Function to broadcast target language update to all tabs
  function broadcastTargetLanguageUpdate(targetLanguage) {
    // Query for all tabs
    browser.tabs.query({}).then(tabs => {
      console.log(`Broadcasting target language update to ${tabs.length} tabs`);
      
      // Send update message to each tab
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, {
          action: 'updateSettings',
          targetLanguage: targetLanguage
        }).catch(error => {
          // Ignore errors for tabs that don't have content scripts loaded
          console.log(`Error sending to tab ${tab.id}:`, error);
        });
      });
    });
  }
  
  // Function to broadcast hotkey settings update to all tabs
  function broadcastHotkeySettings(hotkeysEnabled, hotkeyModifier, hotkeyKey) {
    // Query for all tabs
    browser.tabs.query({}).then(tabs => {
      console.log(`Broadcasting hotkey settings update to ${tabs.length} tabs`);
      
      // Send update message to each tab
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, {
          action: 'updateSettings',
          hotkeysEnabled: hotkeysEnabled,
          hotkeyModifier: hotkeyModifier,
          hotkeyKey: hotkeyKey
        }).catch(error => {
          // Ignore errors for tabs that don't have content scripts loaded
          console.log(`Error sending to tab ${tab.id}:`, error);
        });
      });
    });
  }
  
  // Helper function to check if an element is a descendant of another element
  function isDescendantOf(child, parent) {
    let node = child.parentNode;
    while (node !== null) {
      if (node === parent) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }
  
  // Clear any existing selection when clicking outside the API key field
  document.addEventListener('mousedown', function(e) {
    if (e.target.id !== 'geminiApiKey' && !isDescendantOf(e.target, document.getElementById('geminiApiKey'))) {
      // Clear any existing text selection
      window.getSelection().removeAllRanges();
    }
  });
});