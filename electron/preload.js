var ipc = require('ipc');
var webFrame = require('web-frame');

console.log("In preload");

function MTQCheckDone(){
  console.log(renderingDone);
  console.log(doneRetries);
  console.log(maxRetries);

  if (renderingDone===false && doneRetries<maxRetries) {
    doneRetries++; setTimeout(MTQCheckDone, 100);
  } else {
    console.log('SEND', 'variable-signal');
    ipc.send('variable-signal',{'retries':doneRetries});
  }
};

MTQCheckDone();

function waitFor(num, onDone) {
  if (num) {
    setTimeout(onDone, num);
    return;
  }

  // requestAnimationFrame's callback happens right before a paint. So, it takes two calls
  // before we can be confident that one paint has happened.
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      onDone();
    });
  });
}
ipc.on('ensure-rendered', function ensureRendered(delay, eventName) {
  console.log('RECEIVE', 'ensure-rendered');
  try {
    var style = document.createElement('style');
    // WebKit hack :(
    style.appendChild(document.createTextNode(''));
    document.head.appendChild(style);
    style.sheet.insertRule('::-webkit-scrollbar { display: none; }', 0);
  } catch (e) {}

  waitFor(delay, function() {
    console.log('SEND', eventName);
    ipc.send(eventName);
  });
});

ipc.on('get-dimensions', function ensureRendered(selector) {
  console.log('get-dimensions', selector);
  var result;
  try {
   result = document.querySelector(selector).getBoundingClientRect();
  } catch (e) {
    console.error('Could not find target ' + selector, e);
    ipc.send('return-dimensions', false);
    return;
  }
  ipc.send('return-dimensions', {
    x: result.top,
    y: result.left,
    width: result.right - result.left,
    height: result.bottom - result.top,
  });
});

ipc.on('get-content-dimensions', function() {
  // We want to increase the height if needed, but not the width.
  var height = Math.max( document.body.scrollHeight, document.body.offsetHeight,
                         document.documentElement.clientHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight );
  ipc.send('return-content-dimensions', {
    width: window.innerWidth,
    height: height,
  });
});

ipc.on('set-zoom-factor', function(factor) {
  console.log('set-zoom-factor', factor);
  webFrame.setZoomFactor(factor);
  ipc.send('return-zoom-factor');
});

console.log('SEND', 'window-loaded');
ipc.send('window-loaded');
