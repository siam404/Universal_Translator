// background.js
let geminiApiKey = '';
let featureSettings = {
  showMeanings: true,
  showSynonyms: true,
  showExamples: true
};

// Initialize context menu item
browser.contextMenus.create({
  id: "translate-selection",
  title: "Translate to Bangla",
  contexts: ["selection"]
});

// Load settings from storage
browser.storage.local.get([
  'geminiApiKey', 
  'showMeanings',
  'showSynonyms',
  'showExamples'
], function(data) {
  if (data.geminiApiKey) {
    geminiApiKey = data.geminiApiKey;
    console.log("Gemini API key loaded from storage");
  }
  
  // Update feature settings
  if (data.showMeanings !== undefined) featureSettings.showMeanings = data.showMeanings;
  if (data.showSynonyms !== undefined) featureSettings.showSynonyms = data.showSynonyms;
  if (data.showExamples !== undefined) featureSettings.showExamples = data.showExamples;
  
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
    if (message.settings.showSynonyms !== undefined) {
      featureSettings.showSynonyms = message.settings.showSynonyms;
    }
    if (message.settings.showExamples !== undefined) {
      featureSettings.showExamples = message.settings.showExamples;
    }
    
    console.log("Feature settings updated:", featureSettings);
    return true;
  }
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

// Listen for messages from content script
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === "translateSelection" && message.text) {
    console.log("Translation requested from content script:", message.text);
    
    if (!sender.tab) {
      console.error("Sender tab information missing");
      return true;
    }
    
    processText(message.text, sender.tab.id);
  }
  return true;
});

// Main function to process selected text
function processText(text, tabId) {
  console.log("Processing text:", text);
  
  if (!geminiApiKey) {
    notifyAllFrames(tabId, {
      action: "showError",
      error: "Gemini API key not found. Please set your Gemini API key in the extension popup."
    });
    return;
  }
  
  // Prepare the prompt based on enabled features
  let promptParts = ["Provide a response in JSON format with the following:"];
  promptParts.push("1. Translate the following English text to Bangla (Bengali): \"" + text + "\"");
  
  if (featureSettings.showMeanings) {
    promptParts.push("2. Provide the meanings of key words in the text (in English)");
  }
  
  if (featureSettings.showSynonyms) {
    promptParts.push("3. Provide synonyms for key words in the text (in English)");
  }
  
  if (featureSettings.showExamples) {
    promptParts.push("4. Provide 1-2 example sentences for each key word (in English)");
  }
  
  promptParts.push("Format your response in this JSON structure:");
  
  let jsonStructure = `{
    "translation": "Bengali translation here",`;
  
  if (featureSettings.showMeanings) {
    jsonStructure += `
    "meanings": {
      "word1": "meaning1",
      "word2": "meaning2"
    },`;
  }
  
  if (featureSettings.showSynonyms) {
    jsonStructure += `
    "synonyms": {
      "word1": ["synonym1", "synonym2"],
      "word2": ["synonym1", "synonym2"]
    },`;
  }
  
  if (featureSettings.showExamples) {
    jsonStructure += `
    "examples": {
      "word1": ["example sentence 1", "example sentence 2"],
      "word2": ["example sentence 1", "example sentence 2"]
    }`;
  } else {
    // Remove trailing comma if examples aren't included
    jsonStructure = jsonStructure.replace(/,\s*$/, "");
  }
  
  jsonStructure += `
}`;
  
  promptParts.push(jsonStructure);
  promptParts.push("Return ONLY the JSON with no additional text, explanation, or prefixes.");
  
  const finalPrompt = promptParts.join("\n\n");
  console.log("Final prompt:", finalPrompt);
  
  const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
  
  const requestBody = {
    contents: [{
      parts: [{
        text: finalPrompt
      }]
    }]
  };
  
  console.log("Sending API request with body:", JSON.stringify(requestBody));
  
  fetch(`${apiUrl}?key=${geminiApiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  })
  .then(response => {
    console.log("API response status:", response.status);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    return response.json();
  })
  .then(data => {
    console.log("API response data:", JSON.stringify(data));

    // Extract response from Gemini API
    let responseContent = "";
    
    if (data.candidates && 
        data.candidates[0] && 
        data.candidates[0].content && 
        data.candidates[0].content.parts && 
        data.candidates[0].content.parts[0] && 
        data.candidates[0].content.parts[0].text) {
      
      responseContent = data.candidates[0].content.parts[0].text;
      console.log("Extracted response content:", responseContent);
      
      // Parse the JSON response
      try {
        // The response might have markdown code blocks, so we need to clean it
        responseContent = responseContent.replace(/```json\s+/g, '').replace(/```/g, '');
        
        const parsedResponse = JSON.parse(responseContent);
        console.log("Parsed response:", parsedResponse);
        
        // Send all the data to content script
        notifyAllFrames(tabId, {
          action: "showEnhancedTranslation",
          original: text,
          result: parsedResponse,
          features: featureSettings
        });
      } catch (e) {
        console.error("JSON parsing error:", e);
        console.error("Response content causing error:", responseContent);
        notifyAllFrames(tabId, {
          action: "showError",
          error: "Error parsing translation result. Please try again."
        });
      }
    } else {
      console.error("Unexpected API response structure:", data);
      notifyAllFrames(tabId, {
        action: "showError",
        error: "Translation failed. API response format was unexpected."
      });
    }
  })
  .catch(error => {
    console.error("Translation error:", error);
    notifyAllFrames(tabId, {
      action: "showError",
      error: "API error: " + error.message
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