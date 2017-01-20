var master = self;

// Functions exposed to libsent/src/adin_mic_webaudio.c
var setRate;
var begin = function() { master.postMessage({type: 'begin'}); };

// console polyfill for emscripted Module
var console = {};

importScripts('recognizer.js', 'listener/resampler.js', 'listener/converter.js');

console.log = (function() {
  // The designation used by julius for recognition
  var recogPrefix = /^sentence[0-9]+: (.*)/;
  var guessPrefix = /^pass[0-9]+_best: (.*)/;
  var scorePrefix = /^score[0-9]+: (.*)/;
  var recog;

  return function(str) {
    var score;
    var sentence;

    if (typeof str !== 'string') {
      if (console.verbose) master.postMessage({type: 'log', sentence: str});
      return;
    }

    if (score = str.match(scorePrefix)) {
      master.postMessage({type: 'recog', sentence: recog, score: score[1]});
    } else if (sentence = str.match(recogPrefix)) {
      recog = sentence[1];
      if (console.stripSilence)
        recog = recog.split(' ').slice(1, -1).join(' ');
    } else if (sentence = str.match(guessPrefix)) {
      master.postMessage({type: 'recog', sentence: sentence[1], firstpass: true});
    } else if (console.verbose)
      master.postMessage({type: 'log', sentence: str});
  };
}() );

console.error = function(err) { master.postMessage({type: 'error'}); };

master.onmessage = (function() {
  var converter;
  var bufferSize;
  var byteSize;

  setRate = function(rate) {
    rate = rate || 16000;
    bufferSize = Math.floor(rate * 4096 / 44100);
    byteSize = bufferSize * 2;
    converter = new Converter(rate, bufferSize, byteSize);
  };

  var fillBuffer = Module.cwrap('fill_buffer', 'number', ['number', 'number']);

  return function(e) {
    if (e.data.type === 'begin') {
      var tiedlist = 'julius.tiedlist';
      var hmmdefs = 'julius.hmmdefs';
      var dfa = 'julius.dfa';
      var dict = 'julius.dict';
      var options = [];

      console.verbose = e.data.options.verbose;
      console.stripSilence =
        e.data.options.stripSilence === undefined ?
          true : e.data.options.stripSilence;

      delete e.data.options.verbose, delete e.data.options.stripSilence;
      console.log({type: 'log', sentence: e.data})
      if (typeof e.data.options.pathToDfa === 'string' &&
          typeof e.data.options.pathToDict === 'string' &&
          typeof e.data.options.pathToHmmdefs === 'string' &&
          typeof e.data.options.pathToTiedlist === 'string') {
            console.log({type:'log', sentence: "let's roll XXXXXXXXXXXXX"})
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
        console.log({type: 'log', sentence: "not that XXXXXXXXXXXXXXXXX"});
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
        //'-h',     'voxforge/hmmdefs',
        //'-hlist', 'voxforge/tiedlist',
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
      else console.verbose = true;

      var bootstrap = function() {
        if (runDependencies) {
          setTimeout(bootstrap, 0);
          return;
        }
        try { Module.callMain(options); }
        catch (error) { master.postMessage({type: 'error', error: error}); }
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
}() );
