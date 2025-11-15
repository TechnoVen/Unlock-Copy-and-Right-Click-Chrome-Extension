
/* global URLPattern */
function notifyAddon(msg) {
  chrome.notifications.create({
    title: chrome.runtime.getManifest().name,
    message: msg,
    type: 'basic',
    iconUrl: '/icons/128.png'
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
      // In case the service worker is terminated and restarted, this might throw an error.
      // We can safely ignore it as the purpose is just to keep the worker alive.
    }
  });
}, 20000);

chrome.action.onClicked.addListener(function(tab) {
  actionClicked(tab.id, { allFrames: true });
});

// --- Refactored Icon Management ---

const activeIcons = {
  '16': '/icons/active/16.png',
  '32': '/icons/active/32.png',
  '128': '/icons/active/128.png',
  '256': '/icons/active/256.png',
  '512': '/icons/active/512.png'
};

const defaultIcons = {
  '16': '/icons/16.png',
  '32': '/icons/32.png',
  '128': '/icons/128.png',
  '256': '/icons/256.png',
  '512': '/icons/512.png'
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

        const isEnabled = monitor && hostnames.some(h => new URLPattern(h).test(tab.url));
        const iconPath = isEnabled ? activeIcons : defaultIcons;

        chrome.action.setIcon({ tabId, path: iconPath }, () => {
            if (chrome.runtime.lastError) {
                // Ignore errors, e.g., if the tab was closed before the icon could be set.
            }
        });

    } catch(e) {
        // Tab was likely closed, or we don't have permission.
    }
}


chrome.runtime.onMessage.addListener(function(request, sender, response) {
  if (request.method === 'rc-status') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: () => window.pointers.status
    }, r => {
      if (chrome.runtime.lastError) {
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
        path: activeIcons
      });
    }
  } else if (request.method === 'rc-release') {
    if (sender.frameId === 0) {
      chrome.action.setIcon({
        tabId: sender.tab.id,
        path: defaultIcons
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
              // Use URLPattern for more robust matching against the spec
              matches.add(normalizedHostname);
            }
          }
          if (matches.size > 0) {
            await chrome.scripting.registerContentScripts([{
              allFrames: true,
              matchOriginAsFallback: true,
              runAt: 'document_start',
              id: 'monitor-script',
              js: ['/script/action.js'],
              matches: [...matches]
            }]);
          }
        }
      } catch (error) {
        console.error('Error in observe function:', error);
        notifyAddon('Error observing hostnames: ' + error.message);
      }
    });
  observe();
  chrome.storage.onChanged.addListener(prefs => {
    if (prefs.monitor || prefs.hostnames) {
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
        const { origin } = new URL(url);
        // Use origin for a more general match, can be refined to hostname if needed
        const pattern = origin + '/*';
        chrome.storage.local.get({ hostnames: [] }, prefs => {
          if (chrome.runtime.lastError) {
            console.error('Error getting hostnames:', chrome.runtime.lastError);
            return;
          }
          const newHostnames = new Set(prefs.hostnames);
          newHostnames.add(pattern);

          chrome.storage.local.set({
            hostnames: [...newHostnames]
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('Error saving hostname:', chrome.runtime.lastError);
            } else {
              notifyAddon(`This site has been added to the whitelist.`);
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


// --- Simplified Event Listeners for Icon Updates ---

chrome.tabs.onActivated.addListener(activeInfo => updateIcon(activeInfo.tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Use 'loading' status to set the icon as early as possible
  if (changeInfo.status === 'loading') {
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
        tabs.forEach(tab => {
          if (tab.id) updateIcon(tab.id);
        });
    });
});
