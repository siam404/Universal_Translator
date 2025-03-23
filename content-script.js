// content-script.js
let translationPopup = null;
let autoRemoveTimeout = null;
let isSelectionInsidePopup = false;
let contextMenuTriggered = false;
let targetLanguage = 'English'; // Set English as default target language
let detectedLanguage = ''; // Will store the detected language
let hotkeysEnabled = false; // Default to auto-translation (hotkeys disabled)
let hotkeyModifier = 'Shift'; // Default hotkey modifier
let hotkeyKey = 'T'; // Default hotkey key

// Add variables to track connection state and last activity
let isConnectionActive = true;
let lastActivityTime = Date.now();
let connectionCheckInterval = null;

// Initialize the extension
function initialize() {
  console.log("Initializing Universal Translator in frame:", window.location.href);
  
  // Create a root element for our popups that will be outside any shadow DOM
  createRootElement();
  
  // Setup selection listeners
  setupSelectionListeners();
  
  // Load user preferences with retry mechanism
  loadUserPreferencesWithRetry();
  
  // Setup connection monitoring
  setupConnectionMonitoring();
}

// Load user preferences from storage
function loadUserPreferences() {
  browser.storage.local.get([
    'targetLanguage', 
    'hotkeysEnabled', 
    'hotkeyModifier', 
    'hotkeyKey'
  ], function(data) {
    if (data.targetLanguage) {
      targetLanguage = data.targetLanguage;
      console.log("Target language loaded from storage:", targetLanguage);
    } else {
      // Set default to English if no preference found
      targetLanguage = 'English';
      console.log("No target language found in storage, defaulting to English");
    }
    
    // Load hotkeys settings
    if (data.hotkeysEnabled !== undefined) {
      hotkeysEnabled = data.hotkeysEnabled;
      console.log("Hotkeys mode " + (hotkeysEnabled ? "enabled" : "disabled"));
    }
    
    // Load hotkey modifier
    if (data.hotkeyModifier) {
      hotkeyModifier = data.hotkeyModifier;
    }
    
    // Load hotkey key
    if (data.hotkeyKey) {
      hotkeyKey = data.hotkeyKey;
    }
    
    console.log(`Hotkey set to: ${hotkeyModifier}+${hotkeyKey}`);
  });
}

// Add a retry mechanism for loading user preferences
function loadUserPreferencesWithRetry(retryCount = 0, maxRetries = 5) {
  console.log(`Attempting to load user preferences (attempt ${retryCount + 1}/${maxRetries})`);
  
  browser.storage.local.get([
    'targetLanguage', 
    'hotkeysEnabled', 
    'hotkeyModifier', 
    'hotkeyKey',
    'geminiApiKey',
    'showMeanings'
  ], function(data) {
    // Check if API key is available
    const hasApiKey = !!data.geminiApiKey;
    
    if (data.targetLanguage) {
      targetLanguage = data.targetLanguage;
      console.log("Target language loaded from storage:", targetLanguage);
    } else {
      // Set default to English if no preference found
      targetLanguage = 'English';
      console.log("No target language found in storage, defaulting to English");
    }
    
    // Load hotkeys settings
    if (data.hotkeysEnabled !== undefined) {
      hotkeysEnabled = data.hotkeysEnabled;
      console.log("Hotkeys mode " + (hotkeysEnabled ? "enabled" : "disabled"));
    }
    
    // Load hotkey modifier
    if (data.hotkeyModifier) {
      hotkeyModifier = data.hotkeyModifier;
    }
    
    // Load hotkey key
    if (data.hotkeyKey) {
      hotkeyKey = data.hotkeyKey;
    }
    
    console.log(`Hotkey set to: ${hotkeyModifier}+${hotkeyKey}`);
    
    // Log API key status (without revealing the key)
    console.log("API key found in storage:", hasApiKey);
    
    // Retry more times and with exponential backoff for new tabs
    if (!hasApiKey && retryCount < maxRetries) {
      const delayMs = Math.min(1000 * Math.pow(1.5, retryCount), 10000); // Exponential backoff with 10s max
      console.log(`No API key found, will retry in ${delayMs/1000}s (attempt ${retryCount + 1}/${maxRetries})...`);
      
      setTimeout(() => {
        loadUserPreferencesWithRetry(retryCount + 1, maxRetries);
      }, delayMs);
    }
  });
}

// Create a persistent root element for our popups
function createRootElement() {
  // Check if we already have a root element
  if (document.getElementById('translator-root')) {
    return;
  }
  
  const root = document.createElement('div');
  root.id = 'translator-root';
  root.style.position = 'fixed';
  root.style.zIndex = '2147483647';
  root.style.pointerEvents = 'none'; // Initially allow events to pass through
  document.body.appendChild(root);
  console.log("Created translator root element");
}

// Set up all selection-related event listeners
function setupSelectionListeners() {
  // Listen for mouseup events to detect text selection
  document.addEventListener('mouseup', handleMouseUp, true);
  
  // Track mousedown to detect where selection starts
  document.addEventListener('mousedown', handleMouseDown, true);
  
  // Handle selection changes
  document.addEventListener('selectionchange', handleSelectionChange, false);
  
  // Handle page click outside popup
  document.addEventListener('mousedown', handleOutsideClick, false);
  
  // Handle window resize to ensure popup stays within viewport
  window.addEventListener('resize', handleResize, false);
  
  // Handle keyboard shortcut (Alt+T) for translation
  document.addEventListener('keydown', handleKeyboardShortcut, false);
}

// Main handler for mouse up events (potential selections)
function handleMouseUp(event) {
  // Update last activity time
  lastActivityTime = Date.now();
  
  // Skip if the event came from within our popup
  if (translationPopup && isEventInsidePopup(event)) {
    console.log("Mouse up inside popup - ignoring");
    return;
  }
  
  // Short delay to ensure selection is complete
  setTimeout(() => {
    if (contextMenuTriggered) {
      // If context menu was used, don't auto-translate
      contextMenuTriggered = false;
      return;
    }
    
    const selectedText = getSelectedText();
    if (selectedText && selectedText.length > 0 && !isSelectionInsidePopup) {
      console.log("Text selected:", selectedText);
      
      // If hotkeys are enabled, don't auto-translate
      if (hotkeysEnabled) {
        console.log("Hotkeys mode enabled - not auto-translating");
        return;
      }
      
      // Get fresh target language from storage before translating
      browser.storage.local.get(['targetLanguage'], function(data) {
        if (data.targetLanguage) {
          targetLanguage = data.targetLanguage;
          console.log("Using fresh target language from storage:", targetLanguage);
        }
        
        // If connection might be inactive, try to reconnect first
        if (!isConnectionActive) {
          console.log("Connection appears inactive, attempting to reconnect before translating");
          reconnectToBackgroundScript();
          
          // Wait a moment for reconnection attempt before trying to translate
          setTimeout(() => {
            sendTranslationRequest(selectedText, targetLanguage);
          }, 500);
        } else {
          // Connection should be active, proceed normally
          sendTranslationRequest(selectedText, targetLanguage);
        }
      });
    }
  }, 200);
}

// Handle mouse down events to track selection start
function handleMouseDown(event) {
  isSelectionInsidePopup = translationPopup && isEventInsidePopup(event);
  
  // If right-click, this might be a context menu operation
  if (event.button === 2) {
    contextMenuTriggered = true;
  } else {
    contextMenuTriggered = false;
  }
}

// Handle selection change events for keyboard selections
function handleSelectionChange() {
  // We mainly handle selection in mouseup, but this helps with keyboard selection
  // We don't auto-translate here to avoid too many simultaneous requests
}

// Keyboard shortcut handler
function handleKeyboardShortcut(event) {
  // Update last activity time
  lastActivityTime = Date.now();
  
  // Check if the pressed key matches our hotkey configuration
  const isHotkeyPressed = checkHotkeyPressed(event);
  
  if (isHotkeyPressed) {
    const selectedText = getSelectedText();
    if (selectedText && selectedText.length > 0) {
      console.log(`Hotkey ${hotkeyModifier}+${hotkeyKey} triggered translation for:`, selectedText);
      
      // Get fresh target language from storage before translating
      browser.storage.local.get(['targetLanguage'], function(data) {
        if (data.targetLanguage) {
          targetLanguage = data.targetLanguage;
          console.log("Using fresh target language from storage:", targetLanguage);
        }
        
        // If connection might be inactive, try to reconnect first
        if (!isConnectionActive) {
          console.log("Connection appears inactive, attempting to reconnect before translating");
          reconnectToBackgroundScript();
          
          // Wait a moment for reconnection attempt before trying to translate
          setTimeout(() => {
            sendTranslationRequest(selectedText, targetLanguage);
          }, 500);
        } else {
          // Connection should be active, proceed normally
          sendTranslationRequest(selectedText, targetLanguage);
        }
      });
    }
  }
}

// Helper function to check if the pressed key matches our hotkey configuration
function checkHotkeyPressed(event) {
  // Convert configuration to actual event properties
  const modifierMap = {
    'Alt': 'altKey',
    'Ctrl': 'ctrlKey',
    'Shift': 'shiftKey'
  };
  
  const modifierProperty = modifierMap[hotkeyModifier];
  
  // For key matching
  let keyMatches = false;
  
  // Handle special case for Space
  if (hotkeyKey === 'Space') {
    keyMatches = event.key === ' ' || event.code === 'Space';
  } else {
    // Case-insensitive comparison for regular keys
    keyMatches = event.key.toLowerCase() === hotkeyKey.toLowerCase();
  }
  
  // Check if both modifier and key match
  return event[modifierProperty] && keyMatches;
}

// Get selected text from anywhere in the document
function getSelectedText() {
  let selectedText = '';
  
  // Standard selection
  const selection = window.getSelection();
  if (selection) {
    selectedText = selection.toString().trim();
  }
  
  // If no text is selected or selection is inside our popup, return empty
  if (selectedText.length === 0 || isSelectionInsidePopup) {
    return '';
  }
  
  return selectedText;
}

// Check if an event occurred inside our popup
function isEventInsidePopup(event) {
  if (!translationPopup) return false;
  
  // Check if the event target is our popup or a child of it
  return translationPopup.contains(event.target) || 
         event.target.closest('[data-translator-popup="true"]');
}

// Handle clicks outside the popup
function handleOutsideClick(event) {
  if (translationPopup && !isEventInsidePopup(event)) {
    removeExistingPopup();
  }
}

// Handle window resize
function handleResize() {
  if (translationPopup) {
    ensurePopupVisibility(translationPopup);
  }
}

// Listen for messages from background script
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log("Message received in content script:", message);
  
  if (message.action === "showTranslation") {
    console.log("Showing translation:", message.translation);
    detectedLanguage = message.detectedLanguage || '';
    showTranslationPopup(message.original, message.translation);
    sendResponse({status: "translation shown"});
  } else if (message.action === "showEnhancedTranslation") {
    console.log("Showing enhanced translation:", message);
    detectedLanguage = message.detectedLanguage || '';
    showEnhancedTranslationPopup(message.original, message.result, message.features);
    sendResponse({status: "enhanced translation shown"});
  } else if (message.action === "showError") {
    console.log("Showing error:", message.error);
    showErrorPopup(message.error);
    sendResponse({status: "error shown"});
  } else if (message.action === "updateSettings") {
    // Handle settings updates
    console.log("Updating settings:", message);
    
    // Update target language
    if (message.targetLanguage) {
      targetLanguage = message.targetLanguage;
      console.log("Target language updated to:", targetLanguage);
    }
    
    // Update hotkeys settings
    if (message.hotkeysEnabled !== undefined) {
      hotkeysEnabled = message.hotkeysEnabled;
      console.log("Hotkeys mode " + (hotkeysEnabled ? "enabled" : "disabled"));
    }
    
    // Update hotkey modifier
    if (message.hotkeyModifier) {
      hotkeyModifier = message.hotkeyModifier;
    }
    
    // Update hotkey key
    if (message.hotkeyKey) {
      hotkeyKey = message.hotkeyKey;
    }
    
    console.log(`Hotkey set to: ${hotkeyModifier}+${hotkeyKey}`);
    
    // If we have an open popup, update its title
    if (translationPopup) {
      const popupTitle = translationPopup.querySelector('div:first-child div:first-child');
      if (popupTitle) {
        popupTitle.textContent = targetLanguage;
      }
    }
    
    sendResponse({status: "settings updated"});
  }
  return true;
});

// Function to show enhanced translation popup with meanings, synonyms, examples
function showEnhancedTranslationPopup(original, result, features) {
  // Remove any existing popup
  removeExistingPopup();
  
  // Check if we have the root element, create it if not
  let root = document.getElementById('translator-root');
  if (!root) {
    createRootElement();
    root = document.getElementById('translator-root');
  }
  
  // Create the popup container
  translationPopup = document.createElement('div');
  translationPopup.dataset.translatorPopup = "true";
  
  // Set fixed position styles - always positioned at top right with slight indent
  translationPopup.style.position = 'fixed';
  translationPopup.style.top = '100px'; // Fixed position from top
  translationPopup.style.right = '20px'; // Fixed position from right
  translationPopup.style.width = '350px'; // Set a fixed width
  translationPopup.style.minWidth = '350px'; // Enforce minimum width
  translationPopup.style.maxWidth = '350px'; // Enforce maximum width
  translationPopup.style.maxHeight = '80vh';
  translationPopup.style.overflowY = 'auto';
  translationPopup.style.overflowX = 'hidden';
  translationPopup.style.backgroundColor = '#222831';
  translationPopup.style.color = '#eeeeee';
  translationPopup.style.borderRadius = '12px';
  translationPopup.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
  translationPopup.style.fontFamily = 'Arial, sans-serif';
  translationPopup.style.fontSize = '14px';
  translationPopup.style.zIndex = '2147483647';
  translationPopup.style.pointerEvents = 'auto';
  translationPopup.style.opacity = '1';
  translationPopup.style.transform = 'translateY(0)';
  translationPopup.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  translationPopup.style.border = '1px solid #00adb5';
  translationPopup.style.boxSizing = 'border-box'; // Ensure padding is included in width
  
  // Create header with target language and close button
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.padding = '10px 15px';
  header.style.borderBottom = '1px solid #393e46';
  header.style.backgroundColor = '#1f252d';
  header.style.borderTopLeftRadius = '12px';
  header.style.borderTopRightRadius = '12px';
  header.style.width = '100%'; // Ensure header takes full width
  header.style.boxSizing = 'border-box'; // Include padding in width calculation
  
  // Title is the target language only (no subtitle)
  const titleSpan = document.createElement('div');
  titleSpan.textContent = targetLanguage;
  titleSpan.style.fontWeight = 'bold';
  titleSpan.style.color = '#00adb5';
  titleSpan.style.fontSize = '16px';
  
  // Create close button
  const closeButton = document.createElement('div');
  closeButton.innerHTML = '&times;';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '20px';
  closeButton.style.color = '#aaaaaa';
  closeButton.style.width = '24px';
  closeButton.style.height = '24px';
  closeButton.style.lineHeight = '24px';
  closeButton.style.textAlign = 'center';
  closeButton.style.borderRadius = '50%';
  closeButton.style.transition = 'all 0.2s ease';
  
  // Hover effect for close button
  closeButton.addEventListener('mouseover', () => {
    closeButton.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    closeButton.style.color = '#ffffff';
  });
  
  closeButton.addEventListener('mouseout', () => {
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.color = '#aaaaaa';
  });
  
  // Close popup when button is clicked
  closeButton.addEventListener('click', () => {
    removeExistingPopup();
  });
  
  header.appendChild(titleSpan);
  header.appendChild(closeButton);
  translationPopup.appendChild(header);
  
  // Content container
  const contentContainer = document.createElement('div');
  contentContainer.style.padding = '15px';
  contentContainer.style.width = '100%'; // Ensure content container takes full width
  contentContainer.style.boxSizing = 'border-box'; // Include padding in width calculation
  
  // Add original text with language detection
  let originalTitle = 'Original';
  if (result.detectedLanguage) {
    originalTitle = `Original - ${result.detectedLanguage}`;
  }
  
  const originalTextSection = createCollapsibleSection(
    originalTitle,
    original,
    '#aaaaaa',
    true // Make Original section expanded by default
  );
  contentContainer.appendChild(originalTextSection);
  
  // Add translation
  const translationSection = createCollapsibleSection(
    'Translation',
    result.translation,
    '#ffffff',
    true
  );
  contentContainer.appendChild(translationSection);
  
  // Add meanings if available
  if (features.showMeanings && result.meanings && Object.keys(result.meanings).length > 0) {
    // Now create the meanings section with properly rendered content
    const meaningsSection = createCollapsibleSection(
      'Meanings',
      result.meanings,
      '#ffffff',
      false,
      function(word, meaning) {
        // Directly return the meaning text without HTML tags
        if (typeof meaning === 'string') {
          // Check if meaning has HTML tags and strip them
          if (meaning.includes('<') && meaning.includes('>')) {
            // Simple HTML tag stripping for display
            return meaning.replace(/<[^>]*>/g, '');
          }
          return meaning;
        }
        return String(meaning);
      }
    );
    contentContainer.appendChild(meaningsSection);
  }
  
  // Add copy button
  const copyContainer = document.createElement('div');
  copyContainer.style.display = 'flex';
  copyContainer.style.justifyContent = 'flex-end';
  copyContainer.style.padding = '10px 15px';
  copyContainer.style.borderTop = '1px solid #393e46';
  
  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy';
  copyButton.style.backgroundColor = '#00adb5';
  copyButton.style.color = '#ffffff';
  copyButton.style.border = 'none';
  copyButton.style.borderRadius = '4px';
  copyButton.style.padding = '6px 12px';
  copyButton.style.cursor = 'pointer';
  copyButton.style.fontSize = '12px';
  copyButton.style.fontWeight = 'bold';
  copyButton.style.transition = 'background-color 0.2s';
  
  // Hover effect for copy button
  copyButton.addEventListener('mouseover', () => {
    copyButton.style.backgroundColor = '#00c2cf';
  });
  
  copyButton.addEventListener('mouseout', () => {
    copyButton.style.backgroundColor = '#00adb5';
  });
  
  // Copy translation to clipboard
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(result.translation)
      .then(() => {
        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
          copyButton.textContent = originalText;
        }, 1500);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  });
  
  copyContainer.appendChild(copyButton);
  contentContainer.appendChild(copyContainer);
  translationPopup.appendChild(contentContainer);
  
  // Add the popup to the root element
  root.appendChild(translationPopup);
  
  // Make sure the root element has correct pointer events
  root.style.pointerEvents = 'auto';
  
  // Add hover behavior to prevent auto-removal
  setupPopupHoverBehavior(translationPopup);
  
  // Start auto-removal timer with longer duration
  startAutoRemoveTimer(12000); // Increase to 12 seconds
}

// Add smooth animations for collapsible sections
function animateContentHeight(element, start, end, duration = 300) {
  // Cancel any ongoing animation
  if (element.__animation) {
    cancelAnimationFrame(element.__animation);
  }
  
  // For collapse animations, start with hidden overflow
  if (end === 0) {
    element.style.overflowY = 'hidden';
  }
  
  const startTime = performance.now();
  
  function animate(currentTime) {
    const elapsedTime = currentTime - startTime;
    const progress = Math.min(elapsedTime / duration, 1);
    
    // Use different easing for expand vs collapse
    let easedProgress;
    if (end > start) {
      // For expansion, use cubic ease-out
      easedProgress = 1 - Math.pow(1 - progress, 3);
    } else {
      // For collapse, use cubic ease-in (faster at the end)
      easedProgress = Math.pow(progress, 3);
    }
    
    const height = start + (end - start) * easedProgress;
    element.style.maxHeight = `${height}px`;
    
    if (progress < 1) {
      element.__animation = requestAnimationFrame(animate);
    } else {
      element.__animation = null;
      if (end === 0) {
        element.style.display = 'none';
        element.style.maxHeight = '0px'; // Ensure maxHeight is reset
      } else {
        // Only apply scrollbar at the end of expansion if needed
        if (element.scrollHeight > element.clientHeight) {
          element.style.overflowY = 'auto';
        } else {
          element.style.overflowY = 'hidden';
        }
      }
    }
  }
  
  if (end > 0 && element.style.display === 'none') {
    element.style.display = 'block';
    element.style.maxHeight = `${start}px`;
    // Always start with overflow hidden for smooth animation
    element.style.overflowY = 'hidden';
  }
  
  element.__animation = requestAnimationFrame(animate);
}

// Helper function to create collapsible sections for translation popup
function createCollapsibleSection(title, content, titleColor, initiallyExpanded = false, formatFn = null, processHTML = false) {
  // Create section container
  const section = document.createElement('div');
  section.style.marginBottom = '10px';
  section.style.border = '1px solid #393e46';
  section.style.borderRadius = '10px';
  section.style.overflow = 'hidden';
  section.style.transition = 'box-shadow 0.2s ease';
  section.style.width = '100%'; // Ensure section takes full width of parent
  
  // Add hover effect to section
  section.onmouseover = function() {
    this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
  };
  
  section.onmouseout = function() {
    this.style.boxShadow = 'none';
  };
  
  // Create header for collapsible section
  const header = document.createElement('div');
  header.style.fontWeight = 'bold';
  header.style.color = titleColor;
  header.style.padding = '10px 14px';
  header.style.backgroundColor = '#2d3642';
  header.style.fontSize = '14px';
  header.style.cursor = 'pointer';
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.transition = 'background-color 0.2s ease';
  header.style.userSelect = 'none'; // Prevent text selection when clicking
  header.style.width = '100%'; // Ensure header takes full width
  
  // Add hover effect to header
  header.onmouseover = function() {
    this.style.backgroundColor = '#333b47';
  };
  
  header.onmouseout = function() {
    this.style.backgroundColor = '#2d3642';
  };
  
  // Create title span
  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;
  header.appendChild(titleSpan);
  
  // Add toggle indicator with better styling
  const toggleIndicator = document.createElement('span');
  toggleIndicator.textContent = initiallyExpanded ? '▼' : '►';
  toggleIndicator.style.fontSize = '10px';
  toggleIndicator.style.color = titleColor;
  toggleIndicator.style.opacity = '0.8';
  toggleIndicator.style.marginLeft = '8px';
  toggleIndicator.style.transition = 'transform 0.3s ease';
  toggleIndicator.style.display = 'inline-block';
  
  if (initiallyExpanded) {
    toggleIndicator.style.transform = 'rotate(0deg)';
  } else {
    toggleIndicator.style.transform = 'rotate(0deg)';
  }
  header.appendChild(toggleIndicator);
  
  // Create content container
  const contentContainer = document.createElement('div');
  contentContainer.style.padding = initiallyExpanded ? '12px 14px' : '0 14px';
  contentContainer.style.backgroundColor = '#222831';
  contentContainer.style.fontSize = '13px';
  contentContainer.style.lineHeight = '1.4';
  contentContainer.style.display = initiallyExpanded ? 'block' : 'none';
  contentContainer.style.overflow = 'hidden';
  contentContainer.style.maxHeight = initiallyExpanded ? '150px' : '0px';
  contentContainer.style.width = '100%'; // Ensure content takes full width
  contentContainer.style.boxSizing = 'border-box'; // Include padding in width calculation
  
  // Process content based on type
  if (typeof content === 'string') {
    contentContainer.textContent = content;
    // Only add overflow-y for longer content
    if (content.length > 200) {
      contentContainer.style.overflowY = 'auto';
    }
  } else if (content && typeof content === 'object') {
    const entries = Object.entries(content);
  if (entries.length === 0) {
      contentContainer.textContent = 'No data available';
      contentContainer.style.fontStyle = 'italic';
      contentContainer.style.color = '#888';
  } else {
    entries.forEach(([word, data], index) => {
      const item = document.createElement('div');
      item.style.marginBottom = index < entries.length - 1 ? '8px' : '0';
      item.style.padding = '4px 0';
      item.style.borderBottom = index < entries.length - 1 ? '1px solid #393e46' : 'none';
      item.style.width = '100%'; // Ensure item takes full width
      item.style.boxSizing = 'border-box'; // Include padding in width calculation
      item.style.display = 'flex'; // Use flex for better layout control
      item.style.flexDirection = 'column'; // Stack content vertically
      item.style.overflowWrap = 'break-word'; // Break long words
      item.style.wordWrap = 'break-word'; // Fallback for older browsers
      
      const wordEl = document.createElement('span');
      wordEl.textContent = word;
      wordEl.style.fontWeight = 'bold';
      wordEl.style.color = '#00adb5';
      wordEl.style.overflowWrap = 'break-word'; // Break long words
      
      const separator = document.createElement('span');
      separator.textContent = ': ';
      separator.style.color = '#888';
      
      const wordWrapper = document.createElement('div');
      wordWrapper.style.display = 'flex';
      wordWrapper.style.flexWrap = 'wrap';
      wordWrapper.appendChild(wordEl);
      wordWrapper.appendChild(separator);
      
      item.appendChild(wordWrapper);
      
      if (formatFn) {
        const formattedData = formatFn(word, data);
      
        if (processHTML && formattedData instanceof HTMLElement) {
          item.appendChild(formattedData);
        } else {
          // Check if the meaning contains both English and target language
          if (typeof formattedData === 'string' && formattedData.includes(' + ')) {
            const [englishMeaning, targetMeaning] = formattedData.split(' + ').map(s => s.trim());
            
            // Create container for dual meanings
            const meaningsContainer = document.createElement('div');
            meaningsContainer.style.display = 'flex';
            meaningsContainer.style.flexDirection = 'column';
            meaningsContainer.style.width = '100%';
            meaningsContainer.style.overflowWrap = 'break-word';
            
            // English meaning
            const englishEl = document.createElement('span');
            englishEl.textContent = `🇬🇧 ${englishMeaning}`;
            englishEl.style.color = '#dddddd';
            englishEl.style.marginBottom = '4px';
            englishEl.style.overflowWrap = 'break-word';
            
            // Target language meaning
            const targetEl = document.createElement('span');
            targetEl.textContent = `🌐 ${targetMeaning}`;
            targetEl.style.color = '#00adb5';
            targetEl.style.overflowWrap = 'break-word';
            
            meaningsContainer.appendChild(englishEl);
            meaningsContainer.appendChild(targetEl);
            item.appendChild(meaningsContainer);
          } else {
            // Regular meaning (fallback)
            const dataEl = document.createElement('span');
            dataEl.textContent = formattedData;
            dataEl.style.color = '#dddddd';
            dataEl.style.overflowWrap = 'break-word';
            dataEl.style.wordWrap = 'break-word';
            item.appendChild(dataEl);
          }
        }
      } else {
        const dataEl = document.createElement('span');
        dataEl.textContent = data;
        dataEl.style.color = '#dddddd';
        dataEl.style.overflowWrap = 'break-word';
        dataEl.style.wordWrap = 'break-word';
        item.appendChild(dataEl);
      }
      
      contentContainer.appendChild(item);
    });
      
    // Only add scrollbar if there are many entries
    if (entries.length > 6) {
      contentContainer.style.overflowY = 'auto';
    }
    }
  }
  
  // Add toggle functionality with smooth animation
  header.addEventListener('click', function() {
    const isCollapsed = contentContainer.style.display === 'none' || contentContainer.style.maxHeight === '0px';
    
    if (isCollapsed) {
      // Get content height for animation
      contentContainer.style.display = 'block';
      contentContainer.style.maxHeight = '0px';
      contentContainer.style.padding = '0 14px';
      
      // Force layout calculation to enable animation
      const fullContentHeight = contentContainer.scrollHeight;
      const targetHeight = Math.min(fullContentHeight + 24, 200); // Increased height limit
      
      // Only show scrollbar if content would be taller than the allowed height
      if (fullContentHeight + 24 > 200) {
        contentContainer.style.overflowY = 'auto';
      } else {
        contentContainer.style.overflowY = 'hidden';
      }
      
      // Animate the expansion
      contentContainer.style.padding = '12px 14px';
      animateContentHeight(contentContainer, 0, targetHeight);
      
      toggleIndicator.style.transform = 'rotate(180deg)';
      toggleIndicator.textContent = '▼';
    } else {
      // Fix: Get current height BEFORE changing any styles
      const currentHeight = contentContainer.offsetHeight;
      
      // Immediately hide scrollbar to prevent visible jumpiness
      contentContainer.style.overflowY = 'hidden';
      
      // Animate the collapse directly from current visual height
      animateContentHeight(contentContainer, currentHeight, 0);
      contentContainer.style.padding = '0 14px';
      
      toggleIndicator.style.transform = 'rotate(0deg)';
      toggleIndicator.textContent = '►';
    }
  });
  
  section.appendChild(header);
  section.appendChild(contentContainer);
  
  return section;
}

// Function to show basic translation popup (fallback)
function showTranslationPopup(original, translation) {
  console.log("Creating basic translation popup");
  // Remove existing popup if there is one
  removeExistingPopup();
  
  // Get the root element
  const root = document.getElementById('translator-root') || document.body;
  
  // Create popup element
  translationPopup = document.createElement('div');
  translationPopup.className = 'en-bn-translation-popup';
  translationPopup.setAttribute('data-translator-popup', 'true');
  
  // Style the popup with modern standardized theme
  translationPopup.style.position = 'fixed';
  translationPopup.style.zIndex = '2147483647';
  translationPopup.style.backgroundColor = '#222831';
  translationPopup.style.border = '1px solid #393e46';
  translationPopup.style.borderRadius = '12px';
  translationPopup.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
  translationPopup.style.padding = '14px';
  translationPopup.style.width = '340px';
  translationPopup.style.height = 'auto';
  translationPopup.style.fontSize = '13px';
  translationPopup.style.top = (window.scrollY + 70) + 'px';
  translationPopup.style.right = '20px';
  translationPopup.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
  translationPopup.style.overflow = 'hidden';
  translationPopup.style.color = '#eeeeee';
  translationPopup.style.pointerEvents = 'auto';
  translationPopup.style.transform = 'translateY(10px)';
  translationPopup.style.opacity = '0';
  
  // Create header with title, language selector, and close button
  const popupHeader = document.createElement('div');
  popupHeader.style.display = 'flex';
  popupHeader.style.justifyContent = 'space-between';
  popupHeader.style.alignItems = 'center';
  popupHeader.style.marginBottom = '10px';
  popupHeader.style.borderBottom = '1px solid #393e46';
  popupHeader.style.paddingBottom = '10px';
  
  // Create target language title
  const popupTitle = document.createElement('div');
  popupTitle.textContent = targetLanguage;
  popupTitle.style.fontWeight = 'bold';
  popupTitle.style.color = '#00adb5';
  popupTitle.style.fontSize = '16px';
  popupTitle.style.letterSpacing = '0.5px';
  
  // Create close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '✕';
  closeButton.style.border = 'none';
  closeButton.style.background = 'none';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '16px';
  closeButton.style.color = '#aaa';
  closeButton.style.padding = '4px 8px';
  closeButton.style.transition = 'all 0.2s ease';
  closeButton.style.borderRadius = '6px';
  closeButton.onclick = removeExistingPopup;
  
  // Add hover effect to close button
  closeButton.onmouseover = function() {
    this.style.color = '#fff';
    this.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  };
  closeButton.onmouseout = function() {
    this.style.color = '#aaa';
    this.style.backgroundColor = 'transparent';
  };
  
  popupHeader.appendChild(popupTitle);
  popupHeader.appendChild(closeButton);
  
  // Create accordion for content
  const accordion = document.createElement('div');
  accordion.style.display = 'flex';
  accordion.style.flexDirection = 'column';
  accordion.style.gap = '10px';
  
  // Create original text as a collapsible section with detected language
  const originalTitle = detectedLanguage ? `Original - ${detectedLanguage}` : 'Original';
  const originalSection = createCollapsibleSection(originalTitle, original, '#00adb5', true);
  accordion.appendChild(originalSection);
  
  // Create translation element
  const translationElement = document.createElement('div');
  translationElement.style.fontWeight = 'bold';
  translationElement.style.color = '#eeeeee';
  translationElement.style.padding = '12px 14px';
  translationElement.style.backgroundColor = '#2d3642';
  translationElement.style.border = '1px solid #4a4f57';
  translationElement.style.borderRadius = '10px';
  translationElement.style.fontSize = '16px';
  translationElement.style.wordWrap = 'break-word';
  translationElement.style.overflowWrap = 'break-word';
  translationElement.style.minHeight = '30px';
  translationElement.style.maxHeight = '200px'; // Increased height
  translationElement.style.overflow = 'hidden'; // Default to hidden
  translationElement.style.transition = 'background-color 0.2s ease, max-height 0.3s ease';
  translationElement.style.lineHeight = '1.5';
  translationElement.textContent = translation;
  
  // Only add scrollbar if content exceeds the container
  setTimeout(() => {
    if (translationElement.scrollHeight > translationElement.clientHeight) {
      translationElement.style.overflowY = 'auto';
    }
  }, 50);
  
  // Add hover effect to translation element
  translationElement.onmouseover = function() {
    this.style.backgroundColor = '#333b47';
  };
  
  translationElement.onmouseout = function() {
    this.style.backgroundColor = '#2d3642';
  };
  
  // Add copy button for translation
  const copyButtonContainer = document.createElement('div');
  copyButtonContainer.style.textAlign = 'right';
  copyButtonContainer.style.marginTop = '8px';
  
  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy';
  copyButton.style.backgroundColor = '#2d3642';
  copyButton.style.color = '#eeeeee';
  copyButton.style.border = 'none';
  copyButton.style.borderRadius = '6px';
  copyButton.style.padding = '6px 12px';
  copyButton.style.cursor = 'pointer';
  copyButton.style.fontSize = '12px';
  copyButton.style.transition = 'all 0.2s ease';
  copyButton.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
  
  copyButton.onmouseover = function() {
    this.style.backgroundColor = '#333b47';
    this.style.transform = 'translateY(-1px)';
    this.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
  };
  
  copyButton.onmouseout = function() {
    this.style.backgroundColor = '#2d3642';
    this.style.transform = 'translateY(0)';
    this.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
  };
  
  copyButton.onclick = function() {
    navigator.clipboard.writeText(translation).then(() => {
      const originalText = this.textContent;
      this.textContent = 'Copied!';
      this.style.backgroundColor = '#00adb5';
      this.style.boxShadow = '0 4px 10px rgba(0, 173, 181, 0.3)';
      
      setTimeout(() => {
        this.textContent = originalText;
        this.style.backgroundColor = '#2d3642';
        this.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
      }, 1500);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };
  
  copyButtonContainer.appendChild(copyButton);
  
  // Create translation container
  const translationContainer = document.createElement('div');
  translationContainer.style.marginBottom = '8px';
  translationContainer.appendChild(translationElement);
  translationContainer.appendChild(copyButtonContainer);
  
  // Add translation to accordion
  accordion.appendChild(translationContainer);
  
  // Assemble popup
  translationPopup.appendChild(popupHeader);
  translationPopup.appendChild(accordion);
  
  // Add to the root element or document body
  root.appendChild(translationPopup);
  console.log("Translation popup added to document");

  // Enable pointer events for the root during popup display
  if (root.id === 'translator-root') {
    root.style.pointerEvents = 'auto';
  }
  
  // Animate popup entry
  setTimeout(() => {
    translationPopup.style.transform = 'translateY(0)';
    translationPopup.style.opacity = '1';
  }, 10);

  // Ensure popup is fully visible within the viewport
  ensurePopupVisibility(translationPopup);

  // Set up hover behavior
  setupPopupHoverBehavior(translationPopup);

  // Start auto-remove timer
  startAutoRemoveTimer(6000); // 6 seconds
}

// Function to setup hover behavior
function setupPopupHoverBehavior(popup) {
  popup.addEventListener('mouseenter', function() {
    console.log("Mouse entered popup - canceling auto-remove");
    // Cancel auto-remove when mouse enters popup
    if (autoRemoveTimeout) {
      clearTimeout(autoRemoveTimeout);
      autoRemoveTimeout = null;
    }
    
    // Add enhanced highlight and elevation effect
    popup.style.boxShadow = '0 10px 30px rgba(0, 173, 181, 0.25)';
    popup.style.transform = 'translateY(-2px)';
    popup.style.border = '1px solid #00adb5';
    
    // Don't use animation as it might interfere with visibility
    popup.style.animation = 'none';
  });

  popup.addEventListener('mouseleave', function() {
    console.log("Mouse left popup - starting auto-remove timer");
    // Start a fresh auto-remove timer when mouse leaves popup
    // Use a longer timeout for better user experience
    startAutoRemoveTimer(10000); // 10 seconds after mouse leaves

    // Remove highlight and elevation effects
    popup.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';
    popup.style.transform = 'translateY(0)';
    popup.style.border = popup.style.border.includes('f44336') ? 
      '1px solid #f44336' : '1px solid #393e46';
    popup.style.animation = 'none';
  });
}

// Function to start auto-remove timer
function startAutoRemoveTimer(customTimeout = 10000) { // Increase default to 10 seconds
  // Clear any existing timer first
  if (autoRemoveTimeout) {
    clearTimeout(autoRemoveTimeout);
    autoRemoveTimeout = null;
  }

  // Set new timer
  autoRemoveTimeout = setTimeout(function() {
    removeExistingPopup();
  }, customTimeout);
  
  console.log(`Auto-remove timer started - popup will disappear in ${customTimeout/1000} seconds`);
}

// Function to remove existing popup
function removeExistingPopup() {
  if (translationPopup) {
    // Don't animate out, just remove immediately if we're having issues with visibility
    if (translationPopup && translationPopup.parentNode) {
      translationPopup.parentNode.removeChild(translationPopup);
    }
    translationPopup = null;
    
    // Clear any auto-remove timeout
    if (autoRemoveTimeout) {
      clearTimeout(autoRemoveTimeout);
      autoRemoveTimeout = null;
    }
  }
}

// Initialize once the DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  // DOM already loaded, initialize immediately
  initialize();
}

// For websites that dynamically load content (like Facebook, YouTube)
// Re-check periodically if our script is working
setInterval(() => {
  // If our translator root doesn't exist, we need to re-initialize
  if (!document.getElementById('translator-root') && document.body) {
    console.log("Re-initializing translator due to DOM changes");
    initialize();
  }
}, 3000);

console.log("Universal Translator content script loaded in frame:", window.location.href);

// Function to ensure popup is fully visible within viewport
function ensurePopupVisibility(popup) {
  // Get popup dimensions
  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Calculate the popup's width - use fixed width for consistency
  const popupWidth = 340; // Updated to match our standard width
  const popupHeight = popupRect.height;
  
  // Check if popup extends beyond right edge
  if (popupRect.right > viewportWidth) {
    const rightOffset = Math.max(20, viewportWidth - popupWidth - 20);
    popup.style.right = rightOffset + 'px';
  }
  
  // Check if popup extends beyond left edge
  if (popupRect.left < 20) {
    popup.style.right = (viewportWidth - popupWidth - 20) + 'px';
  }
  
  // Check if popup extends beyond bottom edge
  if (popupRect.bottom > viewportHeight) {
    popup.style.top = Math.max((window.scrollY + viewportHeight - popupHeight - 20), window.scrollY + 20) + 'px';
  }
  
  // Check if popup extends beyond top edge
  if (popupRect.top < 0) {
    popup.style.top = (window.scrollY + 20) + 'px';
  }
  
  // Ensure enough space is reserved for animation effects
  if (popupRect.top < 20) {
    popup.style.top = (window.scrollY + 20) + 'px';
  }
  
  // Make sure popup is not too close to right edge to accommodate animation
  if (viewportWidth - popupRect.right < 20) {
    popup.style.right = '20px';
  }
}

// Function to show error popup
function showErrorPopup(errorMessage) {
  // Remove any existing popup
  removeExistingPopup();
  
  // Check if we have the root element, create it if not
  let root = document.getElementById('translator-root');
  if (!root) {
    createRootElement();
    root = document.getElementById('translator-root');
  }
  
  // Create the popup container
  translationPopup = document.createElement('div');
  translationPopup.dataset.translatorPopup = "true";
  
  // Set fixed position styles - always positioned at top right with slight indent
  translationPopup.style.position = 'fixed';
  translationPopup.style.top = '100px'; // Fixed position from top
  translationPopup.style.right = '20px'; // Fixed position from right
  translationPopup.style.width = '350px'; // Set a fixed width matching enhanced popup
  translationPopup.style.minWidth = '350px'; // Enforce minimum width
  translationPopup.style.maxWidth = '350px'; // Enforce maximum width
  translationPopup.style.backgroundColor = '#222831';
  translationPopup.style.color = '#eeeeee';
  translationPopup.style.borderRadius = '12px';
  translationPopup.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
  translationPopup.style.fontFamily = 'Arial, sans-serif';
  translationPopup.style.fontSize = '14px';
  translationPopup.style.zIndex = '2147483647';
  translationPopup.style.pointerEvents = 'auto';
  translationPopup.style.opacity = '1';
  translationPopup.style.transform = 'translateY(0)';
  translationPopup.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  translationPopup.style.border = '1px solid #f44336';
  translationPopup.style.boxSizing = 'border-box'; // Ensure padding is included in width
  
  // Create header with error title and close button
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.padding = '10px 15px';
  header.style.borderBottom = '1px solid #393e46';
  header.style.backgroundColor = '#1f252d';
  header.style.borderTopLeftRadius = '12px';
  header.style.borderTopRightRadius = '12px';
  header.style.width = '100%'; // Ensure header takes full width
  header.style.boxSizing = 'border-box'; // Include padding in width calculation
  
  // Add title
  const titleSpan = document.createElement('div');
  titleSpan.textContent = 'Translator Error';
  titleSpan.style.fontWeight = 'bold';
  titleSpan.style.color = '#f44336';
  
  // Create close button
  const closeButton = document.createElement('div');
  closeButton.innerHTML = '&times;';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '20px';
  closeButton.style.color = '#aaaaaa';
  closeButton.style.transition = 'color 0.2s';
  
  // Hover effect for close button
  closeButton.addEventListener('mouseover', () => {
    closeButton.style.color = '#ffffff';
  });
  
  closeButton.addEventListener('mouseout', () => {
    closeButton.style.color = '#aaaaaa';
  });
  
  // Close popup when button is clicked
  closeButton.addEventListener('click', () => {
    removeExistingPopup();
  });
  
  header.appendChild(titleSpan);
  header.appendChild(closeButton);
  translationPopup.appendChild(header);
  
  // Content container
  const contentContainer = document.createElement('div');
  contentContainer.style.padding = '15px';
  contentContainer.style.width = '100%'; // Ensure content container takes full width
  contentContainer.style.boxSizing = 'border-box'; // Include padding in width calculation
  
  // Warning icon
  const warningContainer = document.createElement('div');
  warningContainer.style.display = 'flex';
  warningContainer.style.alignItems = 'center';
  warningContainer.style.marginBottom = '10px';
  
  const warningIcon = document.createElement('div');
  warningIcon.innerHTML = '⚠️';
  warningIcon.style.marginRight = '8px';
  warningIcon.style.fontSize = '18px';
  
  const warningText = document.createElement('div');
  warningText.textContent = 'Something went wrong';
  warningText.style.color = '#f44336';
  
  warningContainer.appendChild(warningIcon);
  warningContainer.appendChild(warningText);
  contentContainer.appendChild(warningContainer);
  
  // Error message
  const errorContainer = document.createElement('div');
  errorContainer.style.backgroundColor = '#2d333d';
  errorContainer.style.padding = '12px';
  errorContainer.style.borderRadius = '6px';
  errorContainer.style.color = '#f48fb1';
  errorContainer.textContent = errorMessage;
  errorContainer.style.overflowWrap = 'break-word'; // Break long words
  errorContainer.style.wordWrap = 'break-word'; // For older browsers
  contentContainer.appendChild(errorContainer);
  
  translationPopup.appendChild(contentContainer);
  
  // Add the popup to the root element
  root.appendChild(translationPopup);
  
  // Make sure the root element has correct pointer events
  root.style.pointerEvents = 'auto';
  
  // Add hover behavior to prevent auto-removal
  setupPopupHoverBehavior(translationPopup);
  
  // Start auto-removal timer with even longer duration for errors
  startAutoRemoveTimer(15000); // Increase to 15 seconds for errors
}

// Add a new function to set up connection monitoring
function setupConnectionMonitoring() {
  // Cancel any existing interval
  if (connectionCheckInterval) {
    clearInterval(connectionCheckInterval);
  }
  
  // Start monitoring connection every 30 seconds
  connectionCheckInterval = setInterval(() => {
    // If it's been more than 5 minutes since last activity, check connection
    const timeSinceLastActivity = Date.now() - lastActivityTime;
    if (timeSinceLastActivity > 5 * 60 * 1000) { // 5 minutes
      console.log("Checking extension connection after inactivity...");
      checkConnection();
    }
  }, 30000); // Check every 30 seconds
  
  // Also set up a ping every 2 minutes to keep the connection alive
  setInterval(() => {
    pingBackgroundScript();
  }, 2 * 60 * 1000); // 2 minutes
}

// Function to check connection to background script
function checkConnection() {
  browser.runtime.sendMessage({ action: "ping" })
    .then(response => {
      console.log("Connection check successful:", response);
      isConnectionActive = true;
    })
    .catch(error => {
      console.log("Connection check failed:", error);
      isConnectionActive = false;
      
      // Try to re-establish connection
      console.log("Attempting to re-establish connection...");
      reconnectToBackgroundScript();
    });
}

// Function to ping the background script to keep connection alive
function pingBackgroundScript() {
  browser.runtime.sendMessage({ action: "ping" })
    .then(response => {
      // Connection is still active, update last activity time
      lastActivityTime = Date.now();
      isConnectionActive = true;
    })
    .catch(error => {
      // Don't update connection state here to avoid false positives
    });
}

// Function to attempt reconnection to background script
function reconnectToBackgroundScript() {
  // Reload preferences to ensure we have up-to-date settings
  loadUserPreferencesWithRetry(0, 3);
  
  // Perform a test translation request to wake up the background script
  browser.runtime.sendMessage({ 
    action: "wakeup",
    timestamp: Date.now()
  }).then(response => {
    console.log("Successfully reconnected to background script");
    isConnectionActive = true;
    lastActivityTime = Date.now();
  }).catch(error => {
    console.log("Reconnection attempt failed:", error);
    // Will try again on next user interaction
  });
}

// Add a helper function to send translation requests
function sendTranslationRequest(text, targetLang) {
  // Send the selected text to the background script for translation
  browser.runtime.sendMessage({
    action: "translateSelection",
    text: text,
    targetLanguage: targetLang
  }).then(response => {
    // If we get a response, update connection status
    isConnectionActive = true;
    lastActivityTime = Date.now();
  }).catch(err => {
    console.error("Error sending message to background script:", err);
    isConnectionActive = false;
    
    // Show a user-friendly error if the translation fails
    if (err.message && err.message.includes("could not establish connection")) {
      showErrorPopup("Connection to translator service was lost. Please try again.");
      
      // Attempt reconnection for next time
      reconnectToBackgroundScript();
    }
  });
}