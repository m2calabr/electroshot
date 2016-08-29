var ipc = require("electron").ipcRenderer
const webFrame = require('electron');

//options
var electronMaxRetries = 1000,
    electronDoneRetries = 0,
    waitForVarName = "renderingDone",
    waitForVar = false,
    debugShot = false;

//If we get an error when loading -- we are done. TODO: make an option
window.onerror = function (errorMsg, url, lineNumber) {
  if (debugShot) console.log('SEND', 'load-error');
  ipc.send('load-error');
};

//We could hang for a lot of reasons, make sure we don't hang in an infinate loop
function MaxTimeOut() {
  if (electronDoneRetries >= electronMaxRetries) {
    if (debugShot) console.log('SEND', 'max-retries');
    ipc.send('max-retries',{'retries':electronDoneRetries});
  } else {
    //if (debugShot) console.log('electronDoneRetries', electronDoneRetries);
    setTimeout(MaxTimeOut, 100);
    electronDoneRetries++;
  }
}

//Are we waiting for a global var to turn true
function CheckForDoneVar(){
   if (typeof window[waitForVarName] === "undefined") {
     // console.log('CheckForDoneVar', waitForVarName + '-undefined',electronDoneRetries);
     setTimeout(CheckForDoneVar, 100);
  } else if (window[waitForVarName] === false) {
     //console.log('CheckForDoneVar', waitForVarName + '-false',electronDoneRetries);
     setTimeout(CheckForDoneVar, 100);
  } else {
     if (debugShot) console.log('SEND', 'variable-signal');
     ipc.send('variable-signal',{'retries':electronDoneRetries});
  }
}


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

ipc.on('ensure-rendered', function ensureRendered(e, delay, eventName) {
  console.log('RECEIVE', 'ensure-rendered');
  try {
    var style = document.createElement('style');
    // WebKit hack :(
    style.appendChild(document.createTextNode(''));
    document.head.appendChild(style);
    style.sheet.insertRule('::-webkit-scrollbar { display: none; }', 0);
  } catch (e) {}

  waitFor(delay, function() {
    if (debugShot) console.log('SEND', eventName);
    ipc.send(eventName);
  });
});

ipc.on('get-dimensions', function ensureRendered(e,selector) {
  if (debugShot) console.log('get-dimensions', selector);
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
    height: result.bottom - result.top
  });
});

ipc.on('get-content-dimensions', function() {
  // We want to increase the height if needed, but not the width.
  var height = Math.max( document.body.scrollHeight, document.body.offsetHeight,
                         document.documentElement.clientHeight, document.documentElement.scrollHeight, document.documentElement.offsetHeight );
  ipc.send('return-content-dimensions', {
    width: window.innerWidth,
    height: height
  });
});

ipc.on('set-zoom-factor', function(e,factor) {
  if (debugShot) console.log('set-zoom-factor', factor);
  webFrame.setZoomFactor(factor);
  ipc.send('return-zoom-factor');
});

ipc.on('set-options', function(e,values) {

  electronMaxRetries = values.maxTimeOut;
  debugShot = values.debug;
  waitForVar = values.waitForVar;
  waitForVarName = values.waitVarName;
  console.log('set-options', values);

  if (waitForVar) CheckForDoneVar();
  if (electronMaxRetries !== 'disabled') MaxTimeOut();
});

console.log('SEND', 'window-loaded');
ipc.send('window-loaded');
