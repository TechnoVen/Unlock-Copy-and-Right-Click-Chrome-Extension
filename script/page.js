window.pointers = window.pointers || {
  run: new Set(),
  cache: new Map(),
  status: ''
};

window.pointers.record = (element, name, value) => {
  window.pointers.cache.set(element, {
    name,
    value
  });
};

function restoreCachedStyles() {
  for (const [element, { name, value }] of window.pointers.cache) {
    if (element && element.style) {
      element.style[name] = value;
    }
  }
  window.pointers.cache.clear();
}

function dispatchEvents(eventName) {
  for (const script of document.querySelectorAll('script.rightclickaddon')) {
    script.dispatchEvent(new Event(eventName));
  }
}

function cleanup() {
  window.pointers.status = 'removed';
  chrome.runtime.sendMessage({
    method: 'rc-release'
  });
  for (const cleanupFn of window.pointers.run) {
    cleanupFn();
  }
  window.pointers.run.clear();
  dispatchEvents('remove');
  restoreCachedStyles();
}

function initialize() {
  window.pointers.status = 'ready';
  dispatchEvents('install');
  chrome.runtime.sendMessage({
    method: 'rc-activate'
  });
  initRCMouseClick();
}

function rcInitContent() {
  if (window.pointers.status === '' || window.pointers.status === 'removed') {
    initialize();
  } else {
    cleanup();
  }
}

function initRCMouseClick() {
  // CSS User-Select
  {
    const cleanSheet = (sheet) => {
      try {
        let canAccessRules = false;
        try {
          //  Try to access cssRules (may throw an error)
          sheet.cssRules;
          canAccessRules = true;
        } catch (e) {
          console.warn('Cannot access cssRules for stylesheet:', sheet.href, e);
        }

        if (canAccessRules) {
          for (const rule of sheet.cssRules) {
            cleanRule(rule);
          }
        }
      } catch (e) {
        console.error('Error processing stylesheet:', e);
      }
    };

    const cleanRule = (rule) => {
      if (rule.style) {
        if (rule.style['user-select']) {
          rule.style['user-select'] = 'initial';
        }
      } else if (rule.cssRules) {
        for (const subRule of rule.cssRules) {
          cleanRule(subRule);
        }
      }
    };

    const processStylesheets = () => {
      for (const sheet of document.styleSheets) {
        if (!processStylesheets.cache.has(sheet)) {
          processStylesheets.cache.set(sheet, true);
          cleanSheet(sheet);
        }
      }
    };
    processStylesheets.cache = new WeakMap();

    const styleObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node?.nodeType === Node.TEXT_NODE && mutation.target?.tagName === 'STYLE' ||
            node?.nodeType === Node.ELEMENT_NODE && (node?.tagName === 'STYLE' || (node?.tagName === 'LINK' && node?.rel === 'stylesheet'))) {
            shouldUpdate = true;
            break;
          }
          if (node?.nodeType === Node.ELEMENT_NODE && node?.tagName === 'LINK' && node?.rel === 'stylesheet') {
            node.addEventListener('load', () => processStylesheets());
          }
        }
        if (shouldUpdate) {
          break;
        }
      }
      if (shouldUpdate) {
        processStylesheets();
      }
    });

    styleObserver.observe(document.documentElement, {
      subtree: true,
      childList: true
    });
    window.pointers.run.add(() => styleObserver.disconnect());
    processStylesheets();
  }

  // Inline User-Select
  {
    const inlineStyleObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.target instanceof HTMLElement && mutation.target.style['user-select']) {
          window.pointers.record(mutation.target, 'user-select', mutation.target.style['user-select']);
          mutation.target.style['user-select'] = 'initial';
        }
      });
    });

    inlineStyleObserver.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ['style']
    });
    window.pointers.run.add(() => inlineStyleObserver.disconnect());

    document.querySelectorAll('[style]').forEach((element) => {
      if (element instanceof HTMLElement && element.style['user-select']) {
        window.pointers.record(element, 'user-select', element.style['user-select']);
        element.style['user-select'] = 'initial';
      }
    });
  }

  // Context Menu and Event Blocking
  {
    const preventDefaultGlobal = (event) => {
      event.stopPropagation();
    };

    const handleCopyPaste = (event) => {
      if ((event.metaKey || event.ctrlKey) && ['KeyC', 'KeyV', 'KeyP', 'KeyA'].includes(event.code)) {
        event.stopPropagation();
      }
    };

    const eventHandlers = [
      { event: 'dragstart', handler: preventDefaultGlobal, useCapture: true, passive: false },
      { event: 'mousedown', handler: preventDefaultGlobal, useCapture: true, passive: true },
      { event: 'selectstart', handler: preventDefaultGlobal, useCapture: true, passive: false },
      { event: 'keydown', handler: handleCopyPaste, useCapture: true, passive: true },
      { event: 'cut', handler: preventDefaultGlobal, useCapture: true, passive: false },
      { event: 'paste', handler: preventDefaultGlobal, useCapture: true, passive: false },
      { event: 'copy', handler: preventDefaultGlobal, useCapture: true, passive: false },
      { event: 'contextmenu', handler: preventDefaultGlobal, useCapture: true, passive: false }
    ];

    eventHandlers.forEach(({ event, handler, useCapture, passive }) => {
      document.addEventListener(event, handler, {
        useCapture,
        passive
      });
      window.pointers.run.add(() => document.removeEventListener(event, handler, useCapture));
    });
  }

  // Custom Styles
  {
    const injectCustomStyles = () => {
      const style = document.createElement('style');
      style.textContent = `
        .copy-protection-on #single-article-right,
        .copy-protection-on {
          pointer-events: initial !important;
        }

        ::-moz-selection {
          color: #000 !important;
          background: #accef7 !important;
        }

        ::selection {
          color: #000 !important;
          background: #accef7 !important;
        }

        @layer allow-right-click {
          ::-moz-selection {
            color: #000 !important;
            background: #accef7 !important;
          }

          ::selection {
            color: #000 !important;
            background: #accef7 !important;
          }
        }
      `;
      (document.head || document.body).appendChild(style);
      window.pointers.run.add(() => style.remove());
    };

    if (document.body) {
      injectCustomStyles();
    } else {
      document.addEventListener('DOMContentLoaded', injectCustomStyles);
    }
  }

  // Right-Click Element Targeting
  {
    const handleRightClick = (event) => {
      if (event.button !== 2) {
        return;
      }
      event.stopPropagation();

      const targetElements = event.target.querySelectorAll('img, video');
      targetElements.forEach(el => el.style.setProperty('pointer-events', 'all', 'important'));

      const elementsFromPoint = document.elementsFromPoint(event.clientX, event.clientY);
      const images = Array.from(elementsFromPoint).filter(el => el instanceof HTMLImageElement);
      const videos = Array.from(elementsFromPoint).filter(el => el instanceof HTMLVideoElement);
      const blockedElements = [];

      elementsFromPoint.forEach(el => {
        if ((videos.length && videos.includes(el)) || (images.length && images.includes(el))) {
          return;
        }
        if (el instanceof HTMLElement) {
          blockedElements.push({
            el,
            originalPointerEvents: el.style.pointerEvents
          });
          el.style.pointerEvents = 'none';
          el.dataset.igblock = 'true';
        }

      });

      setTimeout(() => {
        blockedElements.forEach(({
          el,
          originalPointerEvents
        }) => {
          if (el instanceof HTMLElement) {
            el.style.pointerEvents = originalPointerEvents;
            delete el.dataset.igblock;
          }
        });
      }, 300);
    };

    document.addEventListener('mousedown', handleRightClick, true);
    window.pointers.run.add(() => document.removeEventListener('mousedown', handleRightClick, true));
  }
}

// Initialization Logic
if (window.top === window) {
  rcInitContent();
} else {
  chrome.runtime.sendMessage({
    method: 'rc-status'
  }, (response) => {
    if (response === 'removed' && window.pointers.status === '') {
      window.pointers.status = 'ready';
    }
    rcInitContent();
  });
}