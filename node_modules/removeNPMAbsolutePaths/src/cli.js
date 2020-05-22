'use strict';

const defaultOpts = {
  force: false,
};

function parseArguments(args) {
  if (args.length < 1) {
    throw new Error('Missing path.\nThe first argument should be the path to a directory or a package.json file.');
  }

  const path = args[0];
  const opts = { ...defaultOpts };

  const ignored = [];

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--force':
        opts.force = true;
        break;
      case '--fields':
        if (opts.fields) {
          throw new Error('Duplicated argument: --fields.\nThe --fields flag has been detected twice.');
        }

        opts.fields = [];
        while (args[i + 1] && args[i + 1].slice(0, 2) !== '--') {
          opts.fields.push(args[i += 1]);
        }

        if (opts.fields && opts.fields.length === 0) {
          throw new Error('Invalid argument usage: --fields.\nThe --fields flag should be followed by the specific fields that should be removed but none was found.');
        }
        break;
      default:
        ignored.push(arg);
        break;
    }
  }

  return {
    path,
    opts,
    ignored,
  };
}

module.exports.defaultOpts = defaultOpts;
module.exports.parseArguments = parseArguments;
