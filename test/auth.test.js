'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app  = require('../server');
const User  = require('../models/user');
const { JWT_SECRET, TEST_MONGODB_URI } = require('../config');

const expect = chai.expect;

// This let's us make HTTP requests
// in our tests.
// see: https://github.com/chaijs/chai-http
chai.use(chaiHttp);

describe('Auth endpoints', function () {
  const username = 'exampleUser';
  const password = 'examplePass';
  const firstName = 'Example';
  const lastName = 'User';
  const fullname = `${firstName} ${lastName}`;

  before(function () {
    return mongoose.connect(TEST_MONGODB_URI, { useNewUrlParser: true, useCreateIndex : true });
  });

  after(function () {
    return mongoose.disconnect();
  });
  let id;
  
  beforeEach(function () {
    return User.hashPassword(password).then(password =>
      User.create({
        username,
        password,
        fullname
      })
        .then((res) => id = res.id)
    );
  });

  afterEach(function () {
    return User.deleteMany();
  });

  describe('/api/auth/login', function () {
    it('Should reject requests with no credentials', function () {
      return chai
        .request(app)
        .post('/api/login')
        .send({})
        .then((res) => {
          expect(res).to.have.status(400);
          expect(res.body).to.be.an('object');
          expect(res.body.message).to.equal('Bad Request');
        });
    });
    it('should reject request with incorrect usernames', function(){
      return chai.request(app).post('/api/login')
        .send({username: 'wrongUser', password})
        .then((res)=>{
          expect(res).to.have.status(401);
        });
    });
    it('Should reject requests with incorrect passwords', function () {
      return chai
        .request(app)
        .post('/api/login')
        .send({ username, password: 'wrongPassword' })
        .then((res)=>{
          expect(res).to.have.status(401);
        });
    });
    it('Should return a valid auth token', function () {
      return chai
        .request(app)
        .post('/api/login')
        .send({ username, password, fullname })
        .then(res => {
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('object');
          const token = res.body.authToken;
          expect(token).to.be.a('string');
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ['HS256']
          });
          expect(payload.user).to.deep.equal({
            username,
            fullname,
            id
          });
        });
    });
  });

  describe('/api/refresh', function () {
    it('Should reject requests with no credentials', function () {
      return chai
        .request(app)
        .post('/api/refresh')
        .then((res) => {
          expect(res).to.have.status(401);
          expect(JSON.parse(res.text).message).to.equal('Unauthorized');
        });
    });
    it('Should reject requests with an invalid token', function () {
      const token = jwt.sign(
        {
          username,
          firstName,
          lastName
        },
        'wrongSecret',
        {
          algorithm: 'HS256',
          expiresIn: '7d'
        }
      );

      return chai
        .request(app)
        .post('/api/refresh')
        .set('Authorization', `Bearer ${token}`)
        .then((res) => {
          expect(res).to.have.status(401);
          expect(JSON.parse(res.text).message).to.equal('Unauthorized');
        });
    });
   
    it('Should return a valid auth token with a newer expiry date', function () {
      const token = jwt.sign(
        {
          user: {
            username,
            firstName,
            lastName
          }
        },
        JWT_SECRET,
        {
          algorithm: 'HS256',
          subject: username,
          expiresIn: '7d'
        }
      );
      const decoded = jwt.decode(token);

      return chai
        .request(app)
        .post('/api/refresh')
        .set('authorization', `Bearer ${token}`)
        .then(res => {
          expect(res).to.have.status(200);
          expect(res.body).to.be.an('object');
          const token = res.body.authToken;
          expect(token).to.be.a('string');
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ['HS256']
          });
          expect(payload.user).to.deep.equal({
            username,
            firstName,
            lastName
          });
          expect(payload.exp).to.be.at.least(decoded.exp);
        });
    });
    // it('should return a new, valid authToken', () => {
    //   const authToken = tokens.createAuthToken(user);
    //   requester.set('Authorization', `Bearer ${authToken}`).then((res) => {
    //     expect(res.authToken).to.not.equal(authToken);
    //     expect(() => jsonwebtoken.verify(res.body.authToken, JWT_SECRET, {
    //       subject: user.username,
    //     })).to.not.throw();
    //   });
    //   });
  });
});