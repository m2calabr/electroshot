var fs = require('fs'),
    os = require('os'),
    path = require('path');

var ipc = require("electron").ipcMain,
    BrowserWindow = require("electron").BrowserWindow,
    xtend = require('xtend');

var log = require('minilog')('electron');

var dres;

function TargetWindow() {
  this.window = null;
}

// sync initialization
TargetWindow.prototype.initialize = function(task, onDone) {
  var self = this;
  var display = require("electron").Screen;
  const electron = require('electron')
  var browserOpts = {
    show: true,
    // SEGFAULTS on linux (!) with Electron 0.33.7 (!!)
    'enableLargerThanScreen': (os.platform() !== 'linux'),
    'skipTaskbar': true,
    'useContentSize': true,
    frame: (task.debug ? true : false),
    'webPreferences': {
      'overlayScrollbars': false,
      'pageVisibility': true,
    }
  };

  if (!task.debug) {
    if (!dres) {
      dres = electron.screen.getPrimaryDisplay().workAreaSize;
    }
    // Workaround for https://github.com/atom/electron/issues/2610
    browserOpts.x = dres.width;
    browserOpts.y = dres.height;
  }

  this.task = task;
  if (!this.window) {
    this.window = new BrowserWindow(browserOpts);
    this.window.showInactive();

    // Emitted when the window is closed.
    this.window.on('closed', function() {
      // Dereference the window object, usually you would store windows
      // in an array if your app supports multi windows, this is the time
      // when you should delete the corresponding element.
      self.window = null;
    });
  }

  // width, height
  this.window.setContentSize(task.size.width, task.size.height || 768);


  if (task.device) {
    // useful: set the size exactly (contentsize is not useful here)
    this.window.setSize(task.device.screenSize.width, task.device.screenSize.height);
    //this.window.setMaximumSize(task.device.screenSize.width, task.device.screenSize.height);
  }

  this.window.loadURL(task.url, task['user-agent'] !== '' ? { userAgent: task['user-agent'] } : {});
  this.window.webContents.openDevTools();
  // this happens before the page starts executing
  if (task.device) {
    this.window.webContents.enableDeviceEmulation(task.device);
  }

  if (task.cookies) {
    // TODO wait
    task.cookies.forEach(function(cookie) {
      log.debug('Set cookie', cookie);
      self.window.webContents.session.cookies.set(cookie, function(err) {
        if (err) {
          log.debug('ERR Set cookie', cookie, err);
        }
      });
    });
  }

  var has = {
    latency: typeof task.latency === 'number',
    download: typeof task.download === 'number',
    upload: typeof task.upload === 'number',
  };

  var hasThrottling = has.latency || has.download || has.upload;
  if (hasThrottling) {
    // when not set, default to "WiFi" profile
    self.window.webContents.session.enableNetworkEmulation({
      latency: has.latency ? task.latency : 2,
      downloadThroughput: has.download ? task.download : 3932160,
      uploadThroughput: has.upload ? task.upload : 3932160
    });
  }

  if (task.delay !== 0) {
    // clear the cache
    this.window.webContents.session.clearCache(function() {
      self.completeInit(task, onDone);
    });
  } else {
    self.completeInit(task, onDone);
  }
};

TargetWindow.prototype.completeInit = function(task, onDone) {
  if (task.delay !== 0) {
    // executeJavaScript runs after the page is loaded, so we cannot use it with delays (!)
    // Note that zoom-factor and selector are incompatible ...
    setTimeout(function() {
      onDone();
    }, task.delay);
  } else {
    this.setUpPreloadedListener(task, onDone);
    // to work around https://github.com/atom/electron/issues/1580
    this.window.webContents.executeJavaScript(fs.readFileSync(path.resolve(__dirname + '/preload.js'), 'utf8'), false);
  }
};

TargetWindow.prototype.setUpPreloadedListener = function(task, onDone) {
  var self = this;
  ipc.once('window-loaded', function() {
    log.debug('IPC', 'window-loaded');
    log.debug('SEND', 'ensure-rendered');

    ipc.once('variable-signal',function(event,info){
      log.debug('IPC', 'variable-signal');
      log.debug('retries', info.retries);
      return onDone("success");
    });

    ipc.once('load-error',function(){
      log.debug('IPC', 'load-error');
      return onDone("failed");
    });

    ipc.once('max-retries',function(event,info) {
      log.debug('IPC', 'max-retries');
      log.debug('retries', info.retries);
      return onDone("failed");
    });

    ipc.once('loaded', function() {
      log.debug('IPC', 'loaded');

      if (task.size.height > 0) {
        return onDone();
      }
      // ensure window is sized to full content ...
      ipc.once('return-content-dimensions', function(event, dims) {
        if (dims.height > task.size.height) {
          console.log('Increasing window size to ' + task.size.width + 'x' + dims.height);
          self.window.setSize(task.size.width, dims.height);
          // wait another 2 frames
          ipc.once('loaded', function() {
            onDone("success");
          });
          self.window.webContents.send('ensure-rendered', 0, 'loaded');
          return;
        }
        onDone("success");
      });
      self.window.webContents.send('get-content-dimensions');
    });

    // webContents configuration
    // - zoom factor
    if (task['zoom-factor'] !== 1) {
      log.debug('SEND', 'set-zoom-factor', task['zoom-factor']);
      self.window.webContents.send('set-zoom-factor', task['zoom-factor']);
      ipc.once('return-zoom-factor', function() {
        self.window.webContents.send('ensure-rendered', task.delay, 'loaded');
      });
    } else {
      self.window.webContents.send('ensure-rendered', task.delay, 'loaded');
    }
  });
};


TargetWindow.prototype.reset = function() {
  var self = this;
  // reset zoom
  if (this.task['zoom-factor'] !== 1) {
    this.window.webContents.send('set-zoom-factor', 1);
  }
  // reset deviceEmulation
  if (this.task.device) {
    this.window.webContents.disableDeviceEmulation();
  }
  // reset cookies
  if (this.task.cookies) {
    // TODO wait
    this.task.cookies.forEach(function(cookie) {
      self.window.webContents.session.cookies.remove(cookie, function() {});
    });
  }
  // reset network emulation
  var hasNetworkEmulation = (typeof this.task.latency === 'number' ||
      typeof this.task.download === 'number' || typeof this.task.upload === 'number');

  if (hasNetworkEmulation) {
    self.window.webContents.session.disableNetworkEmulation();
  }
};

TargetWindow.prototype.getDimensions = function(selector, onDone) {
  ipc.once('return-dimensions', function(event, dims) {
    onDone(dims);
  });
  this.window.webContents.send('get-dimensions', selector);
};

TargetWindow.prototype.capture = function(dims, onDone) {
  var self = this;
  var tries = 0;
  var hasDims = arguments.length > 1 && dims;
  var task = this.task;

  function tryCapture(dims) {
    if (hasDims) {
      self.window.capturePage(dims, complete);
    } else {
      self.window.capturePage(complete);
    }
  }

  function complete(data, err) {
    if (data.isEmpty() || err) {
      log.warn(data.isEmpty() ? 'Screenshot is empty, retrying' : 'Error: ' + err);
      tries++;
      if (tries > 5) {
        return onDone(err);
      }
      setTimeout(function() {
        tryCapture(dims);
      }, 100 * tries);
      return;
    }

    console.log('Writing screenshot', task.out);
    fs.writeFile(task.out, (task.format === 'png' ? data.toPng() : data.toJpeg(task.quality)));
    self.reset();
    onDone();
  }
  tryCapture(dims);
};

TargetWindow.prototype.pdf = function(onDone) {
  var self = this;
  var task = this.task;
  this.window.printToPDF(xtend({
    pageSize: 'A4',
    marginsType: 0,
    printBackground: false,
    printSelectionOnly: false,
    landscape: false
  }, task.pdf || {}), function(err, data) {
    if (err) {
      log.error('Error: ' + err);
      return;
    }
    console.log('Writing PDF', task.out);
    fs.writeFile(task.out, data, function(err) {
      if (err) {
        log.error('Error: ' + err);
      }
      self.reset();
      onDone();
    });
  });
};

TargetWindow.prototype.insertCSS = function(css) {
  this.window.webContents.insertCSS(css);
};

TargetWindow.prototype.executeJS = function(js) {
  this.window.webContents.executeJavaScript(js);
};

TargetWindow.prototype.close = function() {
  if (this.window) {
    this.window.close();
  }
};

module.exports = TargetWindow;
