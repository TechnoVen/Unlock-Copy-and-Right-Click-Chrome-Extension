'use strict';

const enabledSitesList = document.getElementById('enabled-sites');

function showToast(message) {
  const toast = document.getElementById('toast') || document.createElement('div');
  toast.id = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function loadEnabledSites() {
  chrome.storage.sync.get(null, (items) => {
    for (const [hostname, enabled] of Object.entries(items)) {
      if (enabled) {
        addSiteToList(hostname);
      }
    }
  });
}

function addSiteToList(hostname) {
  const listItem = document.createElement('li');
  listItem.textContent = hostname;

  const removeButton = document.createElement('button');
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    chrome.storage.sync.remove(hostname, () => {
      listItem.remove();
      showToast(`${hostname} has been removed.`);
    });
  });

  listItem.appendChild(removeButton);
  enabledSitesList.appendChild(listItem);
}

window.addEventListener('load', loadEnabledSites);