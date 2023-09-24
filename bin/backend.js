const express = require('express');
const { stringReplace } = require('string-replace-middleware');
const { DEFAULT_PORT } = require('./constant');

const application = express();

application.use(
  stringReplace(
    {
      RUN_MODE: process.NODE_ENV || 'development',
    },
    {
      contentTypeFilterRegexp: /text\/html/,
    }
  )
);

application.use(express.static('./public'));

application.listen(DEFAULT_PORT, (err) => {
  if (err) {
    console.error('Server could not start');
    return;
  }
  console.log('Http server listening on port', DEFAULT_PORT);
});
