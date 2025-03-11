// content-script.js
let translationPopup = null;
let autoRemoveTimeout = null;
let isSelectionInsidePopup = false;
let contextMenuTriggered = false;

// Initialize the extension
function initialize() {
  console.log("Initializing Enhanced English to Bangla Translator in frame:", window.location.href);
  
  // Create a root element for our popups that will be outside any shadow DOM
  createRootElement();
  
  // Setup selection listeners
  setupSelectionListeners();
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
      // Send the selected text to the background script for translation
      browser.runtime.sendMessage({
        action: "translateSelection",
        text: selectedText
      }).catch(err => {
        console.error("Error sending message to background script:", err);
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

// Keyboard shortcut handler (Alt+T)
function handleKeyboardShortcut(event) {
  // Alt+T shortcut for translation
  if (event.altKey && event.key === 't') {
    const selectedText = getSelectedText();
    if (selectedText && selectedText.length > 0) {
      console.log("Keyboard shortcut triggered translation for:", selectedText);
      browser.runtime.sendMessage({
        action: "translateSelection",
        text: selectedText
      }).catch(err => {
        console.error("Error sending message to background script:", err);
      });
    }
  }
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
    showTranslationPopup(message.original, message.translation);
    sendResponse({status: "translation shown"});
  } else if (message.action === "showEnhancedTranslation") {
    console.log("Showing enhanced translation:", message);
    showEnhancedTranslationPopup(message.original, message.result, message.features);
    sendResponse({status: "enhanced translation shown"});
  } else if (message.action === "showError") {
    console.log("Showing error:", message.error);
    showErrorPopup(message.error);
    sendResponse({status: "error shown"});
  }
  return true;
});

// Function to show enhanced translation popup with meanings, synonyms, examples
function showEnhancedTranslationPopup(original, result, features) {
  console.log("Creating enhanced translation popup");
  // Remove existing popup if there is one
  removeExistingPopup();
  
  // Get the root element
  const root = document.getElementById('translator-root') || document.body;
  
  // Create popup element
  translationPopup = document.createElement('div');
  translationPopup.className = 'en-bn-translation-popup';
  translationPopup.setAttribute('data-translator-popup', 'true');
  
  // Style the popup with modern dark theme
  translationPopup.style.position = 'fixed';
  translationPopup.style.zIndex = '2147483647'; // Maximum z-index to ensure visibility
  translationPopup.style.backgroundColor = '#1e1e1e';  // Dark background
  translationPopup.style.border = '1px solid #333';
  translationPopup.style.borderRadius = '10px';
  translationPopup.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
  translationPopup.style.padding = '16px';
  translationPopup.style.maxWidth = '400px';
  translationPopup.style.width = 'auto';  // Allow responsive sizing
  translationPopup.style.fontSize = '14px';
  translationPopup.style.top = (window.scrollY + 100) + 'px';
  translationPopup.style.right = '20px';
  translationPopup.style.transition = 'all 0.2s ease';
  translationPopup.style.overflow = 'auto';  // Add scrolling for long content
  translationPopup.style.maxHeight = '80vh';  // Limit height to 80% of viewport
  translationPopup.style.color = '#fff';  // Base text color
  translationPopup.style.pointerEvents = 'auto';  // Make sure it can receive events
  
  // Create header with title and close button
  const popupHeader = document.createElement('div');
  popupHeader.style.display = 'flex';
  popupHeader.style.justifyContent = 'space-between';
  popupHeader.style.alignItems = 'center';
  popupHeader.style.marginBottom = '12px';
  popupHeader.style.position = 'sticky';
  popupHeader.style.top = '0';
  popupHeader.style.backgroundColor = '#1e1e1e';
  popupHeader.style.padding = '0 0 10px 0';
  popupHeader.style.borderBottom = '1px solid #333';
  
  const popupTitle = document.createElement('div');
  popupTitle.textContent = 'English to Bangla';
  popupTitle.style.fontWeight = 'bold';
  popupTitle.style.color = '#fff';  // White text
  popupTitle.style.fontSize = '16px';
  
  // Create close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '✕';
  closeButton.style.border = 'none';
  closeButton.style.background = 'none';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '16px';
  closeButton.style.color = '#aaa';  // Light gray
  closeButton.style.padding = '0 5px';
  closeButton.style.transition = 'color 0.2s ease';
  closeButton.onclick = removeExistingPopup;
  
  // Add hover effect to close button
  closeButton.onmouseover = function() {
    this.style.color = '#fff';
  };
  closeButton.onmouseout = function() {
    this.style.color = '#aaa';
  };
  
  popupHeader.appendChild(popupTitle);
  popupHeader.appendChild(closeButton);
  
  // Main content container
  const contentContainer = document.createElement('div');
  
  // Create original text element
  const originalElement = document.createElement('div');
  originalElement.style.marginBottom = '12px';
  originalElement.style.color = '#ccc';  // Light gray text
  originalElement.style.padding = '10px';
  originalElement.style.backgroundColor = '#2a2a2a';  // Slightly lighter background
  originalElement.style.border = '1px solid #444';
  originalElement.style.borderRadius = '6px';
  originalElement.style.wordWrap = 'break-word';  // Enable word wrapping
  originalElement.style.overflowWrap = 'break-word';  // Handle long words
  originalElement.style.maxHeight = '100px';  // Limit height for very long text
  originalElement.style.overflowY = 'auto';  // Add scrollbar for overflow
  originalElement.textContent = original;
  
  // Create translation section
  const translationSection = document.createElement('div');
  translationSection.style.marginBottom = '16px';
  
  const translationHeader = document.createElement('div');
  translationHeader.style.display = 'flex';
  translationHeader.style.justifyContent = 'space-between';
  translationHeader.style.alignItems = 'center';
  translationHeader.style.marginBottom = '8px';
  
  const translationLabel = document.createElement('div');
  translationLabel.textContent = 'Translation';
  translationLabel.style.fontWeight = 'bold';
  translationLabel.style.color = '#66d9ff';  // Light blue
  translationLabel.style.fontSize = '14px';
  
  translationHeader.appendChild(translationLabel);
  
  const translationElement = document.createElement('div');
  translationElement.style.fontWeight = 'bold';
  translationElement.style.color = '#fff'; // White for translation
  translationElement.style.padding = '10px';
  translationElement.style.backgroundColor = '#2a2a2a';
  translationElement.style.border = '1px solid #444';
  translationElement.style.borderRadius = '6px';
  translationElement.style.fontSize = '16px';  // Slightly larger font for Bangla
  translationElement.style.wordWrap = 'break-word';  // Enable word wrapping
  translationElement.style.overflowWrap = 'break-word';  // Handle long words
  translationElement.textContent = result.translation;
  
  // Add copy button for translation
  const copyButtonContainer = document.createElement('div');
  copyButtonContainer.style.textAlign = 'right';
  copyButtonContainer.style.marginTop = '8px';
  
  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy';
  copyButton.style.backgroundColor = '#444';
  copyButton.style.color = '#fff';
  copyButton.style.border = 'none';
  copyButton.style.borderRadius = '4px';
  copyButton.style.padding = '4px 8px';
  copyButton.style.cursor = 'pointer';
  copyButton.style.fontSize = '12px';
  copyButton.style.transition = 'background-color 0.2s';
  
  copyButton.onmouseover = function() {
    this.style.backgroundColor = '#555';
  };
  
  copyButton.onmouseout = function() {
    this.style.backgroundColor = '#444';
  };
  
  copyButton.onclick = function() {
    navigator.clipboard.writeText(result.translation).then(() => {
      const originalText = this.textContent;
      this.textContent = 'Copied!';
      this.style.backgroundColor = '#2a6b4a';
      setTimeout(() => {
        this.textContent = originalText;
        this.style.backgroundColor = '#444';
      }, 1500);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };
  
  copyButtonContainer.appendChild(copyButton);
  
  translationSection.appendChild(translationHeader);
  translationSection.appendChild(translationElement);
  translationSection.appendChild(copyButtonContainer);
  
  // Create meanings section if enabled and available
  let meaningsSection = null;
  if (features.showMeanings && result.meanings) {
    meaningsSection = createDictionarySection(
      'Meanings', 
      result.meanings, 
      '#66d9ff', // Light blue color
      (word, meaning) => meaning // Display format: just the meaning
    );
  }
  
  // Create synonyms section if enabled and available
  let synonymsSection = null;
  if (features.showSynonyms && result.synonyms) {
    synonymsSection = createDictionarySection(
      'Synonyms', 
      result.synonyms, 
      '#66ffb2', // Light green color
      (word, synonyms) => Array.isArray(synonyms) ? synonyms.join(', ') : synonyms // Join array with commas
    );
  }
  
  // Create examples section if enabled and available
  let examplesSection = null;
  if (features.showExamples && result.examples) {
    examplesSection = createDictionarySection(
      'Examples', 
      result.examples, 
      '#ff9966', // Light orange color
      (word, examples) => {
        if (!Array.isArray(examples)) return examples;
        
        // Create bullet points for multiple examples
        const examplesList = document.createElement('ul');
        examplesList.style.margin = '5px 0 0 20px';
        examplesList.style.padding = '0';
        
        examples.forEach(example => {
          const item = document.createElement('li');
          item.textContent = example;
          item.style.marginBottom = '4px';
          examplesList.appendChild(item);
        });
        
        return examplesList;
      },
      true // Process HTML elements
    );
  }
  
  // Add sections to content container
  contentContainer.appendChild(originalElement);
  contentContainer.appendChild(translationSection);
  if (meaningsSection) contentContainer.appendChild(meaningsSection);
  if (synonymsSection) contentContainer.appendChild(synonymsSection);
  if (examplesSection) contentContainer.appendChild(examplesSection);
  
  // Assemble popup
  translationPopup.appendChild(popupHeader);
  translationPopup.appendChild(contentContainer);
  
  // Add to the root element or document body
  root.appendChild(translationPopup);
  console.log("Enhanced translation popup added to document");
  
  // Enable pointer events for the root during popup display
  if (root.id === 'translator-root') {
    root.style.pointerEvents = 'auto';
  }
  
  // Ensure popup is fully visible within the viewport
  ensurePopupVisibility(translationPopup);
  
  // Set up hover behavior
  setupPopupHoverBehavior(translationPopup);
  
  // Start auto-remove timer (longer for enhanced popup since there's more content)
  startAutoRemoveTimer(10000); // 10 seconds
}

// Helper function to create dictionary sections (meanings, synonyms, examples)
function createDictionarySection(title, dataObj, titleColor, formatFn, processHTML = false) {
  // Create section container
  const section = document.createElement('div');
  section.style.marginBottom = '16px';
  
  // Create section header
  const header = document.createElement('div');
  header.textContent = title;
  header.style.fontWeight = 'bold';
  header.style.color = titleColor;
  header.style.marginBottom = '8px';
  header.style.fontSize = '14px';
  
  section.appendChild(header);
  
  // Create content container
  const content = document.createElement('div');
  content.style.backgroundColor = '#2a2a2a';
  content.style.border = '1px solid #444';
  content.style.borderRadius = '6px';
  content.style.padding = '10px';
  
  // Process and add each item
  const entries = Object.entries(dataObj);
  if (entries.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.textContent = 'No data available';
    emptyMsg.style.fontStyle = 'italic';
    emptyMsg.style.color = '#888';
    content.appendChild(emptyMsg);
  } else {
    entries.forEach(([word, data], index) => {
      const item = document.createElement('div');
      item.style.marginBottom = index < entries.length - 1 ? '8px' : '0';
      
      const wordEl = document.createElement('span');
      wordEl.textContent = word;
      wordEl.style.fontWeight = 'bold';
      wordEl.style.color = '#fff';
      
      const separator = document.createElement('span');
      separator.textContent = ': ';
      separator.style.color = '#888';
      
      item.appendChild(wordEl);
      item.appendChild(separator);
      
      // Format the data based on the provided function
      const formattedData = formatFn(word, data);
      
      if (processHTML && formattedData instanceof HTMLElement) {
        item.appendChild(formattedData);
      } else {
        const dataEl = document.createElement('span');
        dataEl.textContent = formattedData;
        dataEl.style.color = '#ddd';
        item.appendChild(dataEl);
      }
      
      content.appendChild(item);
    });
  }
  
  section.appendChild(content);
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
  
  // Style the popup with modern dark theme
  translationPopup.style.position = 'fixed';
  translationPopup.style.zIndex = '2147483647'; // Maximum z-index to ensure visibility
  translationPopup.style.backgroundColor = '#1e1e1e';  // Dark background
  translationPopup.style.border = '1px solid #333';
  translationPopup.style.borderRadius = '10px';
  translationPopup.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
  translationPopup.style.padding = '16px';
  translationPopup.style.maxWidth = '350px';
  translationPopup.style.width = 'auto';  // Allow responsive sizing
  translationPopup.style.fontSize = '14px';
  translationPopup.style.top = (window.scrollY + 100) + 'px';
  translationPopup.style.right = '20px';
  translationPopup.style.transition = 'all 0.2s ease';
  translationPopup.style.overflow = 'hidden';  // Prevent content overflow
  translationPopup.style.color = '#fff';  // Base text color
  translationPopup.style.pointerEvents = 'auto';  // Make sure it can receive events
  
  // Create header with title and close button
  const popupHeader = document.createElement('div');
  popupHeader.style.display = 'flex';
  popupHeader.style.justifyContent = 'space-between';
  popupHeader.style.alignItems = 'center';
  popupHeader.style.marginBottom = '12px';
  
  const popupTitle = document.createElement('div');
  popupTitle.textContent = 'English to Bangla';
  popupTitle.style.fontWeight = 'bold';
  popupTitle.style.color = '#fff';  // White text
  popupTitle.style.fontSize = '16px';
  
  // Create close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '✕';
  closeButton.style.border = 'none';
  closeButton.style.background = 'none';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '16px';
  closeButton.style.color = '#aaa';  // Light gray
  closeButton.style.padding = '0 5px';
  closeButton.style.transition = 'color 0.2s ease';
  closeButton.onclick = removeExistingPopup;
  
  // Add hover effect to close button
  closeButton.onmouseover = function() {
    this.style.color = '#fff';
  };
  closeButton.onmouseout = function() {
    this.style.color = '#aaa';
  };
  
  popupHeader.appendChild(popupTitle);
  popupHeader.appendChild(closeButton);
  
  // Create original text element
  const originalElement = document.createElement('div');
  originalElement.style.marginBottom = '12px';
  originalElement.style.color = '#ccc';  // Light gray text
  originalElement.style.padding = '10px';
  originalElement.style.backgroundColor = '#2a2a2a';  // Slightly lighter background
  originalElement.style.border = '1px solid #444';
  originalElement.style.borderRadius = '6px';
  originalElement.style.wordWrap = 'break-word';  // Enable word wrapping
  originalElement.style.overflowWrap = 'break-word';  // Handle long words
  originalElement.style.maxHeight = '100px';  // Limit height for very long text
  originalElement.style.overflowY = 'auto';  // Add scrollbar for overflow
  originalElement.textContent = original;
  
  // Create translation element
  const translationElement = document.createElement('div');
  translationElement.style.fontWeight = 'bold';
  translationElement.style.color = '#66d9ff';  // Light blue for better visibility on dark background
  translationElement.style.padding = '10px';
  translationElement.style.backgroundColor = '#2a2a2a';
  translationElement.style.border = '1px solid #444';
  translationElement.style.borderRadius = '6px';
  translationElement.style.fontSize = '16px';  // Slightly larger font for Bangla
  translationElement.style.wordWrap = 'break-word';  // Enable word wrapping
  translationElement.style.overflowWrap = 'break-word';  // Handle long words
  translationElement.style.maxHeight = '150px';  // Limit height for very long translations
  translationElement.style.overflowY = 'auto';  // Add scrollbar for overflow
  translationElement.textContent = translation;
  
  // Add copy button for translation
  const copyButtonContainer = document.createElement('div');
  copyButtonContainer.style.textAlign = 'right';
  copyButtonContainer.style.marginTop = '8px';
  
  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy';
  copyButton.style.backgroundColor = '#444';
  copyButton.style.color = '#fff';
  copyButton.style.border = 'none';
  copyButton.style.borderRadius = '4px';
  copyButton.style.padding = '4px 8px';
  copyButton.style.cursor = 'pointer';
  copyButton.style.fontSize = '12px';
  copyButton.style.transition = 'background-color 0.2s';
  
  copyButton.onmouseover = function() {
    this.style.backgroundColor = '#555';
  };
  
  copyButton.onmouseout = function() {
    this.style.backgroundColor = '#444';
  };
  
  copyButton.onclick = function() {
    navigator.clipboard.writeText(translation).then(() => {
      const originalText = this.textContent;
      this.textContent = 'Copied!';
      this.style.backgroundColor = '#2a6b4a';
      setTimeout(() => {
        this.textContent = originalText;
        this.style.backgroundColor = '#444';
      }, 1500);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };
  
  copyButtonContainer.appendChild(copyButton);
  
  // Assemble popup
  translationPopup.appendChild(popupHeader);
  translationPopup.appendChild(originalElement);
  translationPopup.appendChild(translationElement);
  translationPopup.appendChild(copyButtonContainer);
  
  // Add to the root element or document body
  root.appendChild(translationPopup);
  console.log("Translation popup added to document");
  
  // Enable pointer events for the root during popup display
  if (root.id === 'translator-root') {
    root.style.pointerEvents = 'auto';
  }
  
  // Ensure popup is fully visible within the viewport
  ensurePopupVisibility(translationPopup);
  
  // Set up hover behavior
  setupPopupHoverBehavior(translationPopup);
  
  // Start auto-remove timer
  startAutoRemoveTimer();
}

// Function to ensure popup is fully visible within viewport
function ensurePopupVisibility(popup) {
  // Get popup dimensions
  const popupRect = popup.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // Check if popup extends beyond right edge
  if (popupRect.right > viewportWidth) {
    popup.style.right = '20px';
    popup.style.left = 'auto';
  }
  
  // Check if popup extends beyond bottom edge
  if (popupRect.bottom > viewportHeight) {
    popup.style.top = Math.max((window.scrollY + viewportHeight - popupRect.height - 20), window.scrollY) + 'px';
  }
  
  // Check if popup extends beyond top edge
  if (popupRect.top < 0) {
    popup.style.top = (window.scrollY + 20) + 'px';
  }
}

// Function to show error popup
function showErrorPopup(errorMessage) {
  console.log("Creating error popup");
  // Remove existing popup if there is one
  removeExistingPopup();
  
  // Get the root element
  const root = document.getElementById('translator-root') || document.body;
  
  // Create popup element
  translationPopup = document.createElement('div');
  translationPopup.className = 'en-bn-translation-error';
  translationPopup.setAttribute('data-translator-popup', 'true');
  
  // Style the popup with modern dark theme
  translationPopup.style.position = 'fixed';
  translationPopup.style.zIndex = '2147483647'; // Maximum z-index to ensure visibility
  translationPopup.style.backgroundColor = '#1e1e1e';  // Dark background
  translationPopup.style.border = '1px solid #ff4444';  // Red border for error
  translationPopup.style.borderRadius = '10px';
  translationPopup.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';
  translationPopup.style.padding = '16px';
  translationPopup.style.maxWidth = '350px';
  translationPopup.style.fontSize = '14px';
  translationPopup.style.top = (window.scrollY + 100) + 'px';
  translationPopup.style.right = '20px';
  translationPopup.style.wordWrap = 'break-word';  // Enable word wrapping
  translationPopup.style.color = '#fff';  // Base text color
  translationPopup.style.pointerEvents = 'auto';  // Make sure it can receive events
  
  // Create header with title and close button
  const popupHeader = document.createElement('div');
  popupHeader.style.display = 'flex';
  popupHeader.style.justifyContent = 'space-between';
  popupHeader.style.alignItems = 'center';
  popupHeader.style.marginBottom = '12px';
  
  const popupTitle = document.createElement('div');
  popupTitle.textContent = 'Translation Error';
  popupTitle.style.fontWeight = 'bold';
  popupTitle.style.color = '#ff6666';  // Light red for error
  
  // Create close button
  const closeButton = document.createElement('button');
  closeButton.textContent = '✕';
  closeButton.style.border = 'none';
  closeButton.style.background = 'none';
  closeButton.style.cursor = 'pointer';
  closeButton.style.fontSize = '16px';
  closeButton.style.color = '#ff6666';
  closeButton.style.padding = '0 5px';
  closeButton.onclick = removeExistingPopup;
  
  popupHeader.appendChild(popupTitle);
  popupHeader.appendChild(closeButton);
  
  // Create error message element
  const errorElement = document.createElement('div');
  errorElement.textContent = errorMessage;
  errorElement.style.color = '#ff9999';  // Lighter red for error text
  errorElement.style.wordWrap = 'break-word';  // Enable word wrapping
  
  // Assemble popup
  translationPopup.appendChild(popupHeader);
  translationPopup.appendChild(errorElement);

  
  // Add to the root element or document body

  root.appendChild(translationPopup);

  console.log("Error popup added to document");

  

  // Enable pointer events for the root during popup display

  if (root.id === 'translator-root') {

    root.style.pointerEvents = 'auto';

  }

  

  // Ensure popup is fully visible within the viewport

  ensurePopupVisibility(translationPopup);

  

  // Set up hover behavior

  setupPopupHoverBehavior(translationPopup);

  

  // Start auto-remove timer

  startAutoRemoveTimer();

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

    

    // Add subtle highlight effect

    popup.style.boxShadow = '0 6px 25px rgba(102, 217, 255, 0.2)';

  });

  

  popup.addEventListener('mouseleave', function() {

    console.log("Mouse left popup - starting auto-remove timer");

    // Start a fresh auto-remove timer when mouse leaves popup

    startAutoRemoveTimer();

    

    // Remove highlight effect

    popup.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.3)';

  });

}



// Function to start auto-remove timer

function startAutoRemoveTimer() {

  // Clear any existing timer first

  if (autoRemoveTimeout) {

    clearTimeout(autoRemoveTimeout);

    autoRemoveTimeout = null;

  }

  

  // Set new timer

  autoRemoveTimeout = setTimeout(function() {

    removeExistingPopup();

  }, 5000); // 5 seconds

  

  console.log("Auto-remove timer started - popup will disappear in 5 seconds");

}



// Function to remove existing popup

function removeExistingPopup() {

  if (translationPopup && translationPopup.parentNode) {

    translationPopup.parentNode.removeChild(translationPopup);

    translationPopup = null;

    console.log("Popup removed");

    

    // Disable pointer events for the root when no popup is displayed

    const root = document.getElementById('translator-root');

    if (root) {

      root.style.pointerEvents = 'none';

    }

  }

  

  // Clear any existing timer

  if (autoRemoveTimeout) {

    clearTimeout(autoRemoveTimeout);

    autoRemoveTimeout = null;

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



console.log("English to Bangla Translator content script loaded in frame:", window.location.href);