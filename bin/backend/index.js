const express = require('express');
const { stringReplace } = require('string-replace-middleware');
const { DEFAULT_PORT, SALT } = require('./constant');
const { json } = require('body-parser');
const { compareSync } = require('bcryptjs');
const {
  connectToDatabase,
  createTokenOf,
  computeUserMiddleware,
} = require('./database');

const main = async () => {
  const application = express();

  // string replace
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

  //public
  application.use(express.static('./public'));

  // body parser
  application.use(json({ limit: '1mb' }));

  // database
  const { User } = await connectToDatabase();

  // api
  application.use('/sign_in', (req, res) => {
    User.findOne({
      where: {
        nickname: req.body.nickname,
      },
    })
      .then((user) => {
        if (user) {
          if (compareSync(req.body.password, user.dataValues.passwordHashed)) {
            res.send(createTokenOf(user));
          } else {
            console.log('wrong password');
            res.sendStatus(403);
          }
        } else {
          console.log('no user found');
          res.sendStatus(403);
        }
      })
      .catch(() => {
        console.log('no user found');
        res.send(401);
      });
  });

  application.use('/validate_token', computeUserMiddleware, (req, res) => {
    res.send(req.user);
  });

  // listen on default port
  application.listen(DEFAULT_PORT, (err) => {
    if (err) {
      console.error('Server could not start');
      return;
    }
    console.log('Http server listening on port', DEFAULT_PORT);
  });
};

main();
