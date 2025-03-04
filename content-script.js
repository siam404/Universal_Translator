// content-script.js
let translationPopup = null;
let autoRemoveTimeout = null;

// Listen for text selection
document.addEventListener('mouseup', function(event) {
  const selection = window.getSelection();
  const selectedText = selection.toString().trim();
  
  if (selectedText.length > 0) {
    console.log("Text selected:", selectedText);
    // Send the selected text to the background script for translation
    browser.runtime.sendMessage({
      action: "translateSelection",
      text: selectedText
    }, response => {
      console.log("Message sent to background script, response:", response);
    });
  }
});

// Listen for messages from background script
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log("Message received in content script:", message);
  
  if (message.action === "showTranslation") {
    console.log("Showing translation:", message.translation);
    showTranslationPopup(message.original, message.translation);
    sendResponse({status: "translation shown"});
  } else if (message.action === "showError") {
    console.log("Showing error:", message.error);
    showErrorPopup(message.error);
    sendResponse({status: "error shown"});
  }
  return true;
});

// Function to show translation popup
function showTranslationPopup(original, translation) {
  console.log("Creating translation popup");
  // Remove existing popup if there is one
  removeExistingPopup();
  
  // Create popup element
  translationPopup = document.createElement('div');
  translationPopup.className = 'en-bn-translation-popup';
  
  // Style the popup with modern dark theme
  translationPopup.style.position = 'fixed';
  translationPopup.style.zIndex = '10000';
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
  
  // Assemble popup
  translationPopup.appendChild(popupHeader);
  translationPopup.appendChild(originalElement);
  translationPopup.appendChild(translationElement);
  
  // Add to document
  document.body.appendChild(translationPopup);
  console.log("Translation popup added to document");
  
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
  }
  
  // Check if popup extends beyond bottom edge
  if (popupRect.bottom > viewportHeight) {
    popup.style.top = (window.scrollY + viewportHeight - popupRect.height - 20) + 'px';
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
  
  // Create popup element
  translationPopup = document.createElement('div');
  translationPopup.className = 'en-bn-translation-error';
  
  // Style the popup with modern dark theme
  translationPopup.style.position = 'fixed';
  translationPopup.style.zIndex = '10000';
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
  
  // Add to document
  document.body.appendChild(translationPopup);
  console.log("Error popup added to document");
  
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
  }, 3000); // 3 seconds
  
  console.log("Auto-remove timer started - popup will disappear in 3 seconds");
}

// Function to remove existing popup
function removeExistingPopup() {
  if (translationPopup && translationPopup.parentNode) {
    translationPopup.parentNode.removeChild(translationPopup);
    translationPopup = null;
    console.log("Popup removed");
  }
  
  // Clear any existing timer
  if (autoRemoveTimeout) {
    clearTimeout(autoRemoveTimeout);
    autoRemoveTimeout = null;
  }
}

// Handle page click outside popup
document.addEventListener('mousedown', function(event) {
  if (translationPopup && !translationPopup.contains(event.target)) {
    removeExistingPopup();
  }
});

// Handle window resize to ensure popup stays within viewport
window.addEventListener('resize', function() {
  if (translationPopup) {
    ensurePopupVisibility(translationPopup);
  }
});

console.log("English to Bangla Translator content script loaded");