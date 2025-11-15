
/* global URLPattern */
function notifyAddon(msg) {
  chrome.notifications.create({
    title: chrome.runtime.getManifest().name,
    message: msg,
    type: 'basic',
    iconUrl: '/icons/64.png'
  });
}

function actionClicked(tabId, obj) {
  chrome.scripting.executeScript({
    target: {
      tabId,
      ...obj
    },
    files: ['/script/page.js']
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error injecting script:', chrome.runtime.lastError);
      notifyAddon(chrome.runtime.lastError.message);
    }
  });
}

setInterval(function() {
  chrome.storage.local.set({'tt': Date.now()}, () => {
    if (chrome.runtime.lastError) {
      console.error('Error setting storage for keep-alive:', chrome.runtime.lastError);
    }
  });
}, 20000);

chrome.action.onClicked.addListener(function(tab) {
  actionClicked(tab.id, { allFrames: true });
});

chrome.runtime.onMessage.addListener(function(request, sender, response) {
  if (request.method === 'rc-status') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => window.pointers.status
    }, r => {
      if (chrome.runtime.lastError) {
        console.error('Error getting script status:', chrome.runtime.lastError);
        response(null);
      } else {
        response(r && r[0] ? r[0].result : null);
      }
    });
    return true;
  } else if (request.method === 'rc-activate') {
    if (sender.frameId === 0) {
      chrome.action.setIcon({
        tabId: sender.tab.id,
        path: {
          '16': '/icons/active/16.png',
          '32': '/icons/active/32.png',
          '64': '/icons/active/64.png'
        }
      });
    }
  } else if (request.method === 'rc-release') {
    if (sender.frameId === 0) {
      chrome.action.setIcon({
        tabId: sender.tab.id,
        path: {
          '16': '/icons/16.png',
          '32': '/icons/32.png',
          '64': '/icons/64.png'
        }
      });
    }
  } else if (request.method === 'rc-emulate-press') {
    actionClicked(sender.tab.id, { frameIds: [sender.frameId] });
  }
});

// automation
{
  const observe = () => chrome.storage.local.get({
      monitor: false,
      hostnames: []
    },
    async prefs => {
      try {
        await chrome.scripting.unregisterContentScripts();
        if (prefs.monitor && prefs.hostnames.length) {
          const matches = new Set();
          for (const hostname of prefs.hostnames) {
            const normalizedHostname = hostname.trim();
            if (normalizedHostname) {
              let patternString = normalizedHostname.includes('*') ? normalizedHostname : `*://${normalizedHostname}/*`;
              matches.add(patternString);
            }
          }
          let idCounter = 1;
          for (let m of matches) {
            try {
              await chrome.scripting.registerContentScripts([{
                allFrames: true,
                matchOriginAsFallback: true,
                runAt: 'document_start',
                id: 'monitor-' + idCounter++,
                js: ['/script/action.js'],
                matches: [m]
              }]);
            } catch (e) {
              console.error('Error registering content script for:', m, e);
            }
          }
        }
      } catch (error) {
        console.error('Error in observe function:', error);
        notifyAddon('Error observing hostnames: ' + error.message);
      }
    });
  observe();
  chrome.storage.onChanged.addListener(prefs => {
    if (
      (prefs.monitor && prefs.monitor.newValue !== prefs.monitor.oldValue) ||
      (prefs.hostnames && JSON.stringify(prefs.hostnames.newValue) !== JSON.stringify(prefs.hostnames.oldValue))
    ) {
      observe();
    }
  });
}

// context menu
function createContextMenu() {
  chrome.contextMenus.create({
    id: 'rc-auto-site',
    title: "Enable on this site",
    contexts: ['action']
  }, () => chrome.runtime.lastError && console.error('Context menu creation failed:', chrome.runtime.lastError));
  chrome.contextMenus.create({
    id: 'rc-frames',
    title: "Enable in frames",
    contexts: ['action']
  }, () => chrome.runtime.lastError && console.error('Context menu creation failed:', chrome.runtime.lastError));
}
chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'rc-auto-site') {
    const url = tab.url;
    if (url && url.startsWith('http')) {
      try {
        const { hostname } = new URL(url);
        chrome.storage.local.get({ hostnames: [] }, prefs => {
          if (chrome.runtime.lastError) {
            console.error('Error getting hostnames:', chrome.runtime.lastError);
            return;
          }
          const newHostnames = new Set(prefs.hostnames);
          newHostnames.add(hostname);

          chrome.storage.local.set({
            hostnames: [...newHostnames]
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('Error saving hostname:', chrome.runtime.lastError);
            } else {
              notifyAddon(`"${hostname}" added to whitelist.`);
            }
          });
        });
        chrome.storage.local.set({ monitor: true }, () => {
          if (chrome.runtime.lastError) console.error('Error setting monitor:', chrome.runtime.lastError);
        });
        actionClicked(tab.id, { allFrames: true });
      } catch (error) {
        console.error('Error processing context menu click:', error);
        notifyAddon('Invalid URL: ' + url);
      }
    } else {
      notifyAddon('Cannot enable on non-website pages.');
    }
  } else if (info.menuItemId === 'rc-frames') {
    actionClicked(tab.id, { allFrames: true });
  }
});

// --- Refactored Icon Management ---

const activeIcons = {
  '16': '/icons/active/16.png',
  '32': '/icons/active/32.png',
  '64': '/icons/active/64.png',
  '128': '/icons/active/128.png'
};

const defaultIcons = {
  '16': '/icons/16.png',
  '32': '/icons/32.png',
  '64': '/icons/64.png',
  '128': '/icons/128.png'
};

async function updateIcon(tabId) {
    try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.url || !tab.url.startsWith('http')) {
            chrome.action.setIcon({ tabId, path: defaultIcons });
            return;
        }

        const { monitor, hostnames } = await chrome.storage.local.get({ monitor: false, hostnames: [] });
        const { hostname } = new URL(tab.url);

        const isEnabled = monitor && hostnames.includes(hostname);
        const iconPath = isEnabled ? activeIcons : defaultIcons;

        chrome.action.setIcon({ tabId, path: iconPath }, () => {
            if (chrome.runtime.lastError) {
                // Ignore errors
            }
        });

    } catch(e) {
        // Tab was likely closed
    }
}

// --- Simplified Event Listeners for Icon Updates ---

chrome.tabs.onActivated.addListener(activeInfo => updateIcon(activeInfo.tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
     updateIcon(tabId);
  }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && (changes.monitor || changes.hostnames)) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && !chrome.runtime.lastError) {
        updateIcon(tabs[0].id);
      }
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => updateIcon(tab.id));
    });
});
