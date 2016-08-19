var TargetWindow = require('./target-window');
var parallel = require('miniq');
var log = require('minilog')('electron');

module.exports = function(tasks) {
  var targetWindow = new TargetWindow();
  parallel(1, tasks.map(function(task, i) {
    return function(done) {
      log.debug(task);

      targetWindow.initialize(task, function(flag) {
        // --css
        if (task.css) {
          (Array.isArray(task.css) ? task.css : [ task.css ]).forEach(function(css) {
            targetWindow.insertCSS(css);
          });
        }
        // --js
        if (task.js) {
          (Array.isArray(task.js) ? task.js : [ task.js ]).forEach(function(js) {
            targetWindow.executeJS(js);
          });
        }
        
        targetWindow.waitFor('renderingDone');

        if (flag) {
          if (task.format === 'pdf') {
            targetWindow.pdf(done);
          } else if (task.selector) {
            targetWindow.getDimensions(task.selector, function (dims) {
              targetWindow.capture(dims, done);
            });
          } else if (task.size.height > 0) {
            targetWindow.capture({
              x: 0,
              y: 0,
              width: task.size.width,
              height: task.size.height,
            }, done);
          } else {
            targetWindow.capture(false, done);
          }
        }
        
      });
    };
  }), function() {
    if (targetWindow) {
      targetWindow.close();
    }
  });
};
