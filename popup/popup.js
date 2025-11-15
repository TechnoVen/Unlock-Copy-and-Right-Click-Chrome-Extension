const toggleSwitch = document.getElementById('toggleSwitch');

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = new URL(tabs[0].url);
  const hostname = url.hostname;

  chrome.storage.sync.get([hostname], (result) => {
    toggleSwitch.checked = result[hostname] || false;
  });

  toggleSwitch.addEventListener('change', () => {
    chrome.storage.sync.set({ [hostname]: toggleSwitch.checked });
  });
});