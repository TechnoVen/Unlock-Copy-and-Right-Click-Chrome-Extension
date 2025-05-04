var right_click_register = -1;

window.addEventListener('message', function(event) {
  if (event.data?.event) {
    if (event.data.event === 'storage' && event.data.storage) {
      chrome.storage.local.set(event.data.storage);
    }
    try {
      chrome.runtime.sendMessage(event.data);
    } catch (error) {
      console.error('Error sending message to background:', error);
    }
  }
});

chrome.runtime.sendMessage({
  event: 'register'
}, function(response) {
  if (response) {
    right_click_register = response.status;
    chrome.storage.local.get(null, function(data) {
      if (data && Object.keys(data).length !== 0 && data.d_count !== undefined) {
        try {
          // Enhancement: Streamline communication - Send only necessary data
          const messageData = {
            event: 'load',
            status: right_click_register,
            description: response.description,
            comment: response.comment,
            data: {
              d_count: data.d_count
            }, // Only send d_count
            data_logo: chrome.runtime.getURL("/icons/active/368.png")
          };

          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('/script/content_html.js');
          script.onload = function() {
            window.postMessage(messageData);
          };
          document.head.appendChild(script);

          if (right_click_register === 0) {
            chrome.storage.local.set({
              d_count: (data.d_count || 0) + 1
            });
          }
        } catch (error) {
          console.error('Error injecting or sending message:', error);
        }
      } else if (right_click_register === 0) {
        chrome.storage.local.set({
          d_count: 1
        });
      }
    });
  } else {
    console.error('Error from register event:', chrome.runtime.lastError);
  }
});