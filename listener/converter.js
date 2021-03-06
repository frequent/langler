/*jslint nomen: true, indent: 2, maxerr: 3 */
/*global self */
(function (worker_instance) {
  "use strict";

  function Converter (rate, bufferSize, byteSize) {
    this.rate = rate;
    this.bufferSize = bufferSize;
    this.byteSize = byteSize;
    
    // https://github.com/grantgalitz/XAudioJS/blob/master/resampler.js
    this.resampler = new Resampler(44100, rate, 1, bufferSize, true);
  }

  Converter.prototype.convert = (function () {
    
    // Helper functions to convert to PCM16
    function f32Toi16(float) {
      // Guard against overflow
      var s = Math.max(-1, Math.min(1, float));
      // Assume 2's complement representation
      return s < 0 ? 0xFFFF ^ Math.floor(-s * 0x7FFF) : Math.floor(s * 0x7FFF);
    }

    function i16ToUTF8Array(i16, littleEndian) {
      var l = i16 >> 8,
        r = i16 - (l << 8);
      return littleEndian ? [r, l] : [l, r];
    }

    // Use Uint8Array to enforce endianness
    // TODO: use Int16Array TypedArray to enforce system endianness
    // => this will receive e.data, Module.HEAPU16.buffer, ptr from worker.js
    return function(inp, out, ptr) {
        var buffer = new Uint8Array(out, ptr, this.byteSize),
          l = this.resampler.resampler(inp),
          i;

        for (i = 0; i < l; i++) {
          i16ToUTF8Array(f32Toi16(this.resampler.outputBuffer[i]), true)
            .forEach(function(val, ind) {
              buffer[i * 2 + ind] = val;
            });
        }
      };
  }());

  worker_instance.Converter = Converter;

}(self));

