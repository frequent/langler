/*jslint nomen: true, indent: 2, maxerr: 3 */
/*global self */
(function (worker_instance) {
  "use strict";

  importScripts(
    'recognizer.js',
    'listener/resampler.js',
    'listener/converter.js'
  );

  // some strings
  var STRING = 'string';
  var LOG = 'log';
  var ERROR = 'error';
  var RECOG = 'recog';

  // Designation used by julius for recognition
  var RECOG_PREFIX = /^sentence[0-9]+: (.*)/;
  var GUESS_PREFIX = /^pass[0-9]+_best: (.*)/;
  var SCORE_PREFIX = /^score[0-9]+: (.*)/;

  // paramaters exposed to libsent/src/adin_mic_webaudio.c
  var SETRATE;
  var BEGIN = function () {
    sendMessage({"type": 'begin'});
  };

  function getDict(my_string) {
    if (typeof my_string !== STRING) {
      return {"bail": true};
    }
    return {
      "score": my_string.match(SCORE_PREFIX),
      "guess": my_string.match(GUESS_PREFIX),
      "recog": my_string.match(RECOG_PREFIX)
    };
  }

  function sendMessage(my_object) {
    worker_instance.postMessage(my_object);
  }

  //console emscripten polyfill 
  function Console () {}

  Console.error = function(error) {
    sendMessage({"type": ERROR, "error": error});
  };

  Console.log = (function() {
    var recog;

    return function(str) {
      var dict = getDict(str);

      if (dict.recog) {
        recog = dict.recog[1];
        if (Console.stripSilence) {
          recog = recog.split(' ').slice(1, -1).join(' ');
        }
        // XXX Why not? sendMessage({type: RECOG, sentence: recog});
      } else if (dict.score) {
        sendMessage({type: RECOG, sentence: recog, score: dict.score[1]});
      } else if (dict.guess) {
        sendMessage({type: RECOG, sentence: dict.guess[1], firstpass: true});
      } else if (Console.verbose) {
        sendMessage({type: LOG, sentence: str});
      }
      if (dict.bail) {
        return;
      }
    };
  }());

  worker_instance.onmessage = (function() {
    var converter,
      bufferSize,
      byteSize,
      fillBuffer;

    SETRATE = function (rate) {
      rate = rate || 16000;
      bufferSize = Math.floor(rate * 4096 / 44100);
      byteSize = bufferSize * 2;
      converter = new Converter(rate, bufferSize, byteSize);
    };
  
    fillBuffer = Module.cwrap('fill_buffer', 'number', ['number', 'number']);
  
    return function(e) {
      if (e.data.type === 'begin') {
        var tiedlist = 'julius.tiedlist';
        var hmmdefs = 'julius.hmmdefs';
        var dfa = 'julius.dfa';
        var dict = 'julius.dict';
        var options = [];
  
        Console.verbose = e.data.options.verbose;
        Console.stripSilence =
          e.data.options.stripSilence === undefined ?
            true : e.data.options.stripSilence;
  
        delete e.data.options.verbose, delete e.data.options.stripSilence;

        if (typeof e.data.options.pathToDfa === 'string' &&
            typeof e.data.options.pathToDict === 'string' &&
            typeof e.data.options.pathToHmmdefs === 'string' &&
            typeof e.data.options.pathToTiedlist === 'string') {

          var pathToDfa = 
            ((e.data.options.pathToDfa[0] === '/') ? '..' : '../') + e.data.options.pathToDfa;
          var pathToDict =
            ((e.data.options.pathToDict[0] === '/') ? '..' : '../') + e.data.options.pathToDict;
          var pathToHmmdefs =
            ((e.data.options.pathToHmmdefs[0] === '/') ? '..' : '../') + e.data.options.pathToHmmdefs;
          var pathToTiedlist =
            ((e.data.options.pathToTiedlist[0] === '/') ? '..' : '../') + e.data.options.pathToTiedlist;
          FS.createLazyFile('/', 'julius.dfa', '../' + pathToDfa, true, false);
          FS.createLazyFile('/', 'julius.dict', '../' + pathToDict, true, false);
          FS.createLazyFile('/', 'julius.hmmdefs', '../' + pathToHmmdefs, true, false);
          FS.createLazyFile('/', 'julius.tiedlist', '../' + pathToTiedlist, true, false);
        } else {
          dfa = 'voxforge/sample.dfa';
          dict = 'voxforge/sample.dict';
          hmmdefs = 'voxforge/hmmdefs';
          tiedlist = 'voxforge/tiedlist';
        }
  
        options = [
          '-dfa',   dfa,
          '-v',     dict,
          '-h',     hmmdefs,
          '-hlist', tiedlist,
          '-input', 'mic',
          '-realtime'
        ];

        for (var flag in e.data.options) {
          if (flag.match(/dfa|v|h|hlist|input|realtime|quiet|nolog|log/))
            break;
  
          options.push('-' + flag);
          if (options[flag] !== true && options[flag])
            options.push(options[flag]);
        }
        if (!('log' in e.data.options)) options.push('-nolog');
        else Console.verbose = true;
  
        var bootstrap = function() {
          if (runDependencies) {
            setTimeout(bootstrap, 0);
            return;
          }
          try { Module.callMain(options); }
          catch (error) { sendMessage({type: ERROR, error: error}); }
        };
        bootstrap();
  
      } else {
        var ptr = Module._malloc(byteSize);
        // Convert to .raw format
        converter.convert(e.data, Module.HEAPU16.buffer, ptr);
        // Copy to ring buffer (see libsent/src/adin_mic_webaudio.c)
        fillBuffer(ptr, bufferSize);
        Module._free(ptr);
      }
    };
  }());

  worker_instance.console = Console;
  worker_instance.setRate = SETRATE;
  worker_instance.begin = BEGIN;

}(self));

