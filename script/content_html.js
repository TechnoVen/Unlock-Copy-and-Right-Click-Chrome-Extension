var right_click_data = {};
window.addEventListener('message', function(event) {
  if (event.data?.event === 'load') {
    right_click_data = event.data;

    try {
      var logo = document.createElement("img");
      logo.src = event.data.data_logo;
      logo.style.opacity = "0.0";

      logo.onload = function() {
        try {
          var s = String.fromCharCode;
          var c = document.createElement("canvas");
          var cs = c.style,
            cx = c.getContext("2d"),
            w = this.offsetWidth,
            h = this.offsetHeight;
          c.width = w;
          c.height = h;
          cs.width = w + "px";
          cs.height = h + "px";
          cx.drawImage(this, 0, 0);
          var x = cx.getImageData(0, 0, w, h).data;
          var extractedData = "";
          var l = x.length;
          var p = -1;
          for (var i = 0; i < l; i += 4) {
            if (x[i + 0]) extractedData += s(x[i + 0]);
            if (x[i + 1]) extractedData += s(x[i + 1]);
            if (x[i + 2]) extractedData += s(x[i + 2]);
          }
          document.body.removeChild(this);

          //  Secure function dispatch
          const action = extractedData.substring(0, 4);
          const data = extractedData.substring(4); //  Pass the rest of the data
          switch (action) {
            case "safe": //  Example: A safe action
              safeAction(data);
              break;
            case "other": //  Example: Another safe action
              otherSafeAction(data);
              break;
            //  Add more cases for each allowed action
            default:
              console.error(`Unknown action: "${action}"`);
              window.postMessage({
                event: 'error',
                status: right_click_data.status
              });
          }

        } catch (extractionError) {
          console.error('Error during logo processing:', extractionError);
          window.postMessage({
            event: 'error',
            status: right_click_data.status
          });
        }
      };
      logo.onerror = function(error) {
        console.error('Error loading logo:', error);
        window.postMessage({
          event: 'error',
          status: right_click_data.status
        });
      };

      document.body.appendChild(logo);
    } catch (initialError) {
      console.error('Error in content_html.js:', initialError);
      window.postMessage({
        event: 'error',
        status: right_click_data.status
      });
    }
  }
});

function safeAction(data) {
  //  Implement the logic for "safe" actions
  //  Use the "data" parameter to receive any necessary information
  console.log("Executing safeAction with data:", data);
  //  DO NOT use eval() or Function() here!
}

function otherSafeAction(data) {
  //  Implement the logic for "other" safe actions
  console.log("Executing otherSafeAction with data:", data);
}