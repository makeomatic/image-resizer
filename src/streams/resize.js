const sharp = require('sharp');
const map = require('map-stream');
const env = require('../config/environment_vars');
const dims = require('../lib/dimensions');

function processor(image, callback) {
  // do nothing if there is an error on the image object
  if (image.isError()) {
    return callback(null, image);
  }

  // let this pass through if we are requesting the metadata as JSON
  if (image.modifiers.action === 'json') {
    image.log.log('resize: json metadata call');
    return callback(null, image);
  }

  if (image.modifiers.action === 'original' && env.RESIZE_PROCESS_ORIGINAL === false) {
    image.log.log('resize: original no resize');
    return callback(null, image);
  }

  image.log.time('resize');

  const resizeResponse = (err, buffer) => {
    if (err) {
      image.log.error('resize error', err);
      image.error = new Error(err);
    } else {
      image.contents = buffer;
    }

    image.log.timeEnd('resize');
    callback(null, image);
  };

  // use SIMD for faster resize operations
  sharp.simd(true);

  const r = sharp(image.contents);

  // never enlarge an image beyond its original size, unless we're padding
  // the image, as even though this can count as an "enlargement" the padded
  // result can be reasonably generated in most cases.
  if (image.modifiers.action !== 'crop' && image.modifiers.crop !== 'pad') {
    r.withoutEnlargement();
  }

  // if allowed auto rotate images, very helpful for photos off of an iphone
  // which are landscape by default and the metadata tells them what to show.
  if (env.AUTO_ORIENT) {
    r.rotate();
  }

  // by default we remove the metadata from resized images, setting the env
  // var to false can retain it.
  if (!env.REMOVE_METADATA) {
    r.withMetadata();
  }

  let d;
  let wd;
  let ht;

  // eslint-disable-next-line default-case
  switch (image.modifiers.action) {
    case 'original' :
      r.toBuffer(resizeResponse);
      break;

    case 'resize':
      r.resize(image.modifiers.width, image.modifiers.height);
      r.max();
      r.toBuffer(resizeResponse);
      break;

    case 'square':
      r.metadata((err, metadata) => {
        if (err) {
          image.error = new Error(err);
          callback(null, image);
          return;
        }

        d = dims.cropFill(image.modifiers, metadata);

        // resize then crop the image
        r.resize(
          d.resize.width,
          d.resize.height
        ).extract({
          left: d.crop.x,
          top: d.crop.y,
          width: d.crop.width,
          height: d.crop.height,
        });

        r.toBuffer(resizeResponse);
      });

      break;

    case 'crop':
      r.metadata((err, size) => {
        if (err) {
          image.error = new Error(err);
          callback(null, image);
          return;
        }

        // eslint-disable-next-line default-case
        switch (image.modifiers.crop) {
          case 'fit':
            r.resize(image.modifiers.width, image.modifiers.height);
            r.max();
            break;

          case 'fill':
            d = dims.cropFill(image.modifiers, size);
            r.resize(
              d.resize.width,
              d.resize.height
            ).extract({
              left: d.crop.x,
              top: d.crop.y,
              width: d.crop.width,
              height: d.crop.height,
            });
            break;

          case 'cut':
            wd = image.modifiers.width || image.modifiers.height;
            ht = image.modifiers.height || image.modifiers.width;

            d = dims.gravity(
              image.modifiers.gravity,
              size.width,
              size.height,
              wd,
              ht
            );
            r.extract({ top: d.y, left: d.x, width: wd, height: ht });
            break;
          case 'scale':
            // TODO: deal with scale
            r.resize(image.modifiers.width, image.modifiers.height);
            break;

          case 'pad':
            r.resize(image.modifiers.width, image.modifiers.height)
              .background(image.modifiers.paddingColor || env.IMAGE_PADDING_COLOR || 'white')
              .embed();
            break;
        }

        r.toBuffer(resizeResponse);
      });

      break;
  }

  return null;
}

module.exports = () => map(processor);
