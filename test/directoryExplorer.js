/* eslint-env mocha */
const expect = require('expect.js');
const { explore } = require('../lib/directoryExplorer');
const { computeFileDigest } = require('../lib/directoryExplorer/digest');

describe('directoryExplorer', () => {

  describe('computeFileDigest()', () => {
    describe('regular file', () => {
      it('should compute the sha1 digest', () => {
        return computeFileDigest(__dirname + '/data/file-to-digest')
          .then(digest => expect(digest).to.equal('bdc37c074ec4ee6050d68bc133c6b912f36474df'));
      });
    });
  });

  describe('explore()', () => {

    describe('nested files and directories', () => {
      it('should return nested reports', () => {
        return explore(__dirname + '/data/nested')
          .then(report => {
            expect(report).to.eql({
              name: 'nested',
              type: 'directory',
              children: [
                {
                  name: 'a',
                  type: 'file',
                  digest: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
                },
                {
                  name: 'b',
                  type: 'file',
                  digest: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
                },
                {
                  name: 'c',
                  type: 'directory',
                  children: [
                    {
                      name: 'd',
                      type: 'file',
                      digest: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
                    },
                    {
                      name: 'e',
                      type: 'directory',
                      children: [
                        {
                          name: 'f',
                          type: 'file',
                          digest: 'bdc37c074ec4ee6050d68bc133c6b912f36474df',
                        },
                      ],
                    },
                  ],
                },
              ],
            });
          });
      });
    });

  });

});
