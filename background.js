// background.js
let geminiApiKey = '';
let featureSettings = {
  showMeanings: true
};

// Initialize context menu item
browser.contextMenus.create({
  id: "translate-selection",
  title: "Translate with Universal Translator",
  contexts: ["selection"]
});

// Load settings from storage
browser.storage.local.get([
  'geminiApiKey', 
  'showMeanings',
  'targetLanguage',
  'hotkeysEnabled',
  'hotkeyModifier',
  'hotkeyKey'
], function(data) {
  if (data.geminiApiKey) {
    geminiApiKey = data.geminiApiKey;
    console.log("Gemini API key loaded from storage");
  }
  
  // Update feature settings
  if (data.showMeanings !== undefined) featureSettings.showMeanings = data.showMeanings;
  
  console.log("Feature settings loaded:", featureSettings);
});

// Listen for settings updates
browser.runtime.onMessage.addListener(function(message) {
  if (message.action === "settingsUpdated") {
    if (message.settings.geminiApiKey) {
      geminiApiKey = message.settings.geminiApiKey;
      console.log("Gemini API key updated");
    }
    
    // Update feature settings
    if (message.settings.showMeanings !== undefined) {
      featureSettings.showMeanings = message.settings.showMeanings;
    }
    
    // Handle target language updates
    if (message.settings.targetLanguage !== undefined) {
      console.log("Target language updated to:", message.settings.targetLanguage);
    }
    
    // Handle hotkeys settings updates
    if (message.settings.hotkeysEnabled !== undefined) {
      console.log("Hotkeys mode " + (message.settings.hotkeysEnabled ? "enabled" : "disabled"));
    }
    
    if (message.settings.hotkeyModifier && message.settings.hotkeyKey) {
      console.log(`Hotkey set to: ${message.settings.hotkeyModifier}+${message.settings.hotkeyKey}`);
    }
    
    console.log("Feature settings updated:", featureSettings);
    return true;
  }
  return true;
});

// Add handlers for ping and wakeup actions in the message listener
browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log("Background script received message:", request);
  
  // Handle ping requests (for connection checking)
  if (request.action === "ping") {
    console.log("Received ping request from content script");
    sendResponse({ status: "alive", timestamp: Date.now() });
    return true;
  }
  
  // Handle wakeup requests (for reconnection)
  if (request.action === "wakeup") {
    console.log("Received wakeup request from content script");
    // Simply responding confirms the connection is working
    sendResponse({ status: "awake", timestamp: Date.now() });
    return true;
  }
  
  // Rest of the message handling...
  
  // For existing translateSelection action
  if (request.action === "translateSelection") {
    if (request.text) {
      console.log("Translation requested from content script:", request.text);
      
      if (!sender.tab) {
        console.error("Sender tab information missing");
        return true;
      }
      
      const targetLanguage = request.targetLanguage || 'Bangla';
      processText(request.text, sender.tab.id, targetLanguage);
    }
  }
  
  // Return true to indicate async response (if needed)
  return true;
});

// Handle context menu click
browser.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === "translate-selection") {
    const textToTranslate = info.selectionText;
    console.log("Context menu translation requested for:", textToTranslate);
    
    if (textToTranslate && geminiApiKey) {
      processText(textToTranslate, tab.id);
    } else if (!geminiApiKey) {
      console.error("No Gemini API key available");
      notifyAllFrames(tab.id, {
        action: "showError",
        error: "Gemini API key not found. Please set your Gemini API key in the extension popup."
      });
    }
  }
});

// Main function to process selected text
function processText(text, tabId, targetLanguage = 'English') {
  console.log("Processing text:", text, "to", targetLanguage);
  
  if (!geminiApiKey) {
    notifyAllFrames(tabId, {
      action: "showError",
      error: "Gemini API key not found. Please set your Gemini API key in the extension popup."
    });
    return;
  }
  
  if (text.length > 500) {
    text = text.substring(0, 500);
    console.log("Text truncated to 500 characters");
  }
  
  // Construct the prompt
  let promptParts = [
    `1. Detect the language of the following text and translate it to ${targetLanguage}. Return the detected language name (not code) in English.`
  ];
  
  // Generate the list of requested features
  if (featureSettings.showMeanings) {
    promptParts.push(`2. Provide the meanings of key words in the text. Give meanings in both English AND ${targetLanguage}`);
  }
  
  promptParts.push("Format your response in this JSON structure:");
  
  // Build the expected JSON structure based on enabled features
  let jsonStructure = `{
    "detectedLanguage": "name of detected source language",
    "translation": "${targetLanguage} translation goes here"`;
  
  if (featureSettings.showMeanings) {
    jsonStructure += `,
    "meanings": {
      "word1": "English meaning + ${targetLanguage} meaning",
      "word2": "English meaning + ${targetLanguage} meaning"
    }`;
  }
  
  jsonStructure += `
}`;
  
  promptParts.push(jsonStructure);
  promptParts.push(`Text to translate: "${text}"`);
  
  const prompt = promptParts.join("\n\n");
  console.log("Generated prompt:", prompt);
  
  // Call the Gemini API
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      }
    })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    try {
      console.log("API response:", data);
      
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No response from API");
      }
      
      const responseText = data.candidates[0].content.parts[0].text;
      console.log("Response text:", responseText);
      
      // Extract JSON from the response
      const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                        responseText.match(/({[\s\S]*})/);
      
      if (!jsonMatch) {
        throw new Error("Could not extract JSON from response");
      }
      
      const jsonString = jsonMatch[1];
      const result = JSON.parse(jsonString);
      
      if (!result.translation) {
        throw new Error("No translation in result");
      }
      
      // Send the translation to all frames
      notifyAllFrames(tabId, {
        action: "showEnhancedTranslation",
        original: text,
        result: result,
        detectedLanguage: result.detectedLanguage || '',
        features: featureSettings
      });
      
    } catch (error) {
      console.error("Error processing API response:", error);
      
      // Simplified response for errors - use simple translation if available
      try {
        const simpleTranslation = data.candidates[0].content.parts[0].text
          .split('\n')
          .find(line => !line.startsWith('{') && !line.includes('```') && line.trim().length > 0);
        
        if (simpleTranslation) {
          // Try to extract detected language from the response text
          let detectedLanguage = '';
          const langMatch = responseText.match(/detected language.*?[is:|:]\s*([\w\s]+)/i);
          if (langMatch && langMatch[1]) {
            detectedLanguage = langMatch[1].trim();
          }
          
          notifyAllFrames(tabId, {
            action: "showTranslation",
            original: text,
            translation: simpleTranslation,
            detectedLanguage: detectedLanguage
          });
        } else {
          throw new Error("Could not extract a simple translation");
        }
      } catch (e) {
        notifyAllFrames(tabId, {
          action: "showError",
          error: "Could not process the translation. API response format was unexpected."
        });
      }
    }
  })
  .catch(error => {
    console.error("API call error:", error);
    notifyAllFrames(tabId, {
      action: "showError",
      error: "Error calling the Gemini API: " + error.message
    });
  });
}

// Function to notify all frames in a tab with a message
function notifyAllFrames(tabId, message) {
  // First, try sending to all frames
  browser.tabs.sendMessage(tabId, message, { frameId: 0 }).catch(error => {
    console.log("Error sending to main frame:", error);
  });
  
  // Also try to query for all frames and send to each one
  browser.webNavigation.getAllFrames({ tabId: tabId }).then(frames => {
    if (frames && frames.length > 0) {
      console.log(`Found ${frames.length} frames in tab ${tabId}`);
      frames.forEach(frame => {
        console.log(`Sending message to frame ${frame.frameId}`);
        browser.tabs.sendMessage(tabId, message, { frameId: frame.frameId }).catch(error => {
          console.log(`Error sending to frame ${frame.frameId}:`, error);
        });
      });
    } else {
      console.log("No frames found in tab, trying regular send");
      // Fallback to regular sendMessage if getAllFrames fails
      browser.tabs.sendMessage(tabId, message).catch(error => {
        console.error("Error sending message to tab:", error);
      });
    }
  }).catch(error => {
    console.error("Error querying frames:", error);
    // Fallback to regular sendMessage if getAllFrames fails
    browser.tabs.sendMessage(tabId, message).catch(err => {
      console.error("Fallback error sending message to tab:", err);
    });
  });
}