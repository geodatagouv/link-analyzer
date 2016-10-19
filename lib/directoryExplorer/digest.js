const crypto = require('crypto');
const fs = require('fs');
const Promise = require('bluebird');

function computeFileDigest(path) {
  const hash = crypto.createHash('sha1');

  return new Promise((resolve, reject) => {
    fs.createReadStream(path)
      .on('error', reject)
      .pipe(hash)
      .on('error', reject)
      .once('finish', () => {
        const data = hash.read();
        if (data) return resolve(data.toString('hex'));
        reject(new Error('Digest is empty'));
      });
  });
}

module.exports = { computeFileDigest };
