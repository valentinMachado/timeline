const { Sequelize, DataTypes } = require('sequelize');
const { hashSync, genSaltSync } = require('bcryptjs');
const { USER } = require('../../src/shared/constant');
const { SALT } = require('./constant');
const { v4 } = require('uuid');
const { sign, verify } = require('jsonwebtoken');
const path = require('path');

// twek env variables
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
});

const connectToDatabase = async () => {
  const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database/timeline.sqlite',
    define: { freezeTableName: true },
  });

  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }

  // model definition
  const User = sequelize.define('User', {
    uuid: DataTypes.STRING,
    nickname: DataTypes.STRING,
    passwordHashed: DataTypes.STRING,
    role: DataTypes.STRING,
  });

  await sequelize.sync(); // force db to be up to date with javascript (create one if there is not)

  return { User };
};

const createUser = async (nicknameParam, passwordParam, roleParam) => {
  let validRole = false;
  for (const key in USER.ROLE) {
    console.log(USER.ROLE[key]);
    if (USER.ROLE[key] == roleParam) {
      validRole = true;
      break;
    }
  }

  if (!validRole) throw 'no valid role';

  const { User } = await connectToDatabase();

  const existingUser = await User.findOne({
    where: { nickname: nicknameParam },
  });

  if (existingUser) throw 'nickname already used';

  return await User.create({
    nickname: nicknameParam,
    passwordHashed: hashSync(passwordParam, genSaltSync(SALT)),
    role: roleParam,
    uuid: v4(),
  });
};

const createTokenOf = (user) => {
  const token = sign(
    {
      nickname: user.dataValues.nickname,
      role: user.dataValues.role,
      uuid: user.dataValues.uuid,
    },
    process.env.TOKEN_SECRET
  );
  return token;
};

const computeTokenFromRequest = (req) => {
  const cookie = req.headers.cookie;
  if (!cookie || cookie == '') return null;

  let result = null;
  try {
    result = JSON.parse(cookie).token;
  } catch (error) {
    console.log('cookie = ', cookie);
    console.info('Error reading cookie ', error);
  }

  return result;
};

const computeUserMiddleware = (req, res, next) => {
  const token = computeTokenFromRequest(req);

  console.log('compute user middleware', token);

  if (token == null) {
    next();
    return;
  }

  verify(token, process.env.TOKEN_SECRET, async (err, user) => {
    if (err) {
      next();
      return;
    }
    // check if token user is still in database
    const { User } = await connectToDatabase();

    const userDb = await User.findOne({ where: { uuid: user.uuid } });

    if (!userDb) {
      next();
      return;
    }

    // compute user and store it in req.user
    req.user = user;

    next();
  });
};

module.exports = {
  connectToDatabase: connectToDatabase,
  createUser: createUser,
  createTokenOf: createTokenOf,
  computeUserMiddleware: computeUserMiddleware,
};
