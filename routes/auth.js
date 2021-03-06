const passport = require('passport');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const {JWT_SECRET, JWT_EXPIRY} = require('../config');

const options = {session: false, failWithError: true};

const localAuth = passport.authenticate('local', options);

const jwtAuth = passport.authenticate('jwt', options);

router.post('/refresh', jwtAuth, (req, res) => {
  const authToken = createAuthToken(req.user);
  res.json({ authToken });
});

router.post('/login', localAuth, function (req, res) {
  const authToken = createAuthToken(req.user.toJSON());
  res.json({ authToken });
});

function createAuthToken(user) {
  console.log(user);
  return jwt.sign({user}, JWT_SECRET, {
    subject: user.username,
    expiresIn: JWT_EXPIRY
  });
}
module.exports = router; 