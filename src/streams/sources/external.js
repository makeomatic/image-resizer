// Fetches an image from an external URL

'use strict';

var stream, util, request;

stream  = require('stream');
util    = require('util');
request = require('request');

var _     = require('lodash');

function contentLength(bufs){
  return bufs.reduce(function(sum, buf){
    return sum + buf.length;
  }, 0);
}

function External(image, key, prefix){
  /* jshint validthis:true */
  if (!(this instanceof External)){
    return new External(image, key, prefix);
  }
  stream.Readable.call(this, { objectMode : true });
  this.image = image;
  this.ended = false;
  this.key = key;
  this.prefix = prefix;
}

util.inherits(External, stream.Readable);

External.prototype._read = function(){
  var _this = this,
    url,
    fbStream,
    bufs = [];

  if ( this.ended ){ return; }

  // pass through if there is an error on the image object
  if (this.image.isError()){
    this.ended = true;
    this.push(this.image);
    return this.push(null);
  }

  url = this.prefix + '/' + this.image.path;

  this.image.log.time(this.key);

  fbStream = request.get(url);
  fbStream.on('data', function(d){ bufs.push(d); });
  fbStream.on('error', function(err){
    _this.image.error = new Error(err);
  });
  fbStream.on('response', function(response) {
    if (response.statusCode !== 200) {
      _this.image.error = new Error('Error ' + response.statusCode + ':');
    } else {
      var contentType = _.last(response.headers['content-type'].split('/'));
      var Image = require('../../image');
      if (!_.contains(Image.validFormats, contentType)) {
        _this.image.error = new Error('Invalid content type: ' + contentType);
      } else {
        // Set output format to input content-type if no explicit format is provided
        if(!_this.image.format) {
          _this.image.format = contentType;
        }
      }
    }
  });
  fbStream.on('end', function(){
    _this.image.log.timeEnd(_this.key);
    if(_this.image.isError()) {
      _this.image.error.message += Buffer.concat(bufs);
    } else {
      _this.image.contents = Buffer.concat(bufs);
    }
    _this.image.originalContentLength = contentLength(bufs);
    _this.ended = true;
    _this.push(_this.image);
    _this.push(null);
  });

};


module.exports = External;