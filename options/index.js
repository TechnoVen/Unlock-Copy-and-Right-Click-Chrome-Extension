'use strict';

const whitelistTextarea = document.getElementById('whitelist');
const saveButton = document.getElementById('save');
const resetButton = document.getElementById('reset');
const toast = document.getElementById('toast');

function displayToast(message, isError = false) {
  clearTimeout(displayToast.timeoutId);
  toast.textContent = message;
  toast.classList.toggle('toast-error', isError);
  toast.classList.add('toast-show');
  displayToast.timeoutId = setTimeout(() => {
    toast.classList.remove('toast-show');
  }, 3000);
}

function loadOptions() {
  chrome.storage.local.get({ 'hostnames': [] }, (prefs) => {
    whitelistTextarea.value = prefs.hostnames.join(', ');
    whitelistTextarea.disabled = false;
    saveButton.disabled = false;
  });
}

function saveOptions() {
  try {
    const hostnames = whitelistTextarea.value.split(/\s*,\s*/).map(hostname => {
      try {
        const trimmedHostname = hostname.trim();
        const hostnameRegex = /^([a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,})|localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d{1,5})?$/i;
        if (!hostnameRegex.test(trimmedHostname)) {
          displayToast(`Invalid hostname: ${trimmedHostname}`, true);
          return null;
        }
        if (trimmedHostname.startsWith('http')) {
          return new URL(trimmedHostname).origin;
        }
        return trimmedHostname;
      } catch (error) {
        console.error('Invalid URL or hostname:', hostname, error);
        displayToast(`Invalid URL or hostname: ${hostname}`, true);
        return null;
      }
    }).filter((hostname, index, array) => hostname && array.indexOf(hostname) === index);

    if (hostnames.some(hostname => hostname === null)) {
      return;
    }

    chrome.storage.local.set({ 'monitor': hostnames.length > 0, hostnames }, () => {
      whitelistTextarea.value = hostnames.join(', ');
      displayToast('Options saved.');
    });
  } catch (error) {
    console.error('Error saving options:', error);
    displayToast('Error saving options.', true);
  }
}

function resetOptions(event) {
  if (event.detail === 1) {
    displayToast('Double-click to reset.');
  } else {
    chrome.storage.local.set({ 'monitor': false, 'hostnames': [] }, () => {
      chrome.runtime.reload();
      window.close();
    });
  }
}

window.addEventListener('load', () => {
  loadOptions();

  saveButton.addEventListener('click', saveOptions);
  resetButton.addEventListener('click', resetOptions);

  whitelistTextarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      saveButton.focus();
      event.preventDefault();
    }
  });

  saveButton.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !event.shiftKey) {
      resetButton.focus();
      event.preventDefault();
    }
  });

  resetButton.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && event.shiftKey) {
      saveButton.focus();
      event.preventDefault();
    }
  });
});