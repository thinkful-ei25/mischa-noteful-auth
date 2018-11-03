'use strict';

const chai = require('chai');
const chaiHttp = require('chai-http');
const mongoose = require('mongoose');
const express = require('express');
const sinon = require('sinon');

const app = require('../server');
const Folder = require('../models/folder');
const Note = require('../models/note');
const User = require('../models/user');
const folders  = require('../db/seed/folders');
const notes  = require('../db/seed/notes');
const users  = require('../db/seed/users');
const { TEST_MONGODB_URI } = require('../config');
const {JWT_SECRET} = require('../config');
const jwt = require('jsonwebtoken');

chai.use(chaiHttp);
const expect = chai.expect;
const sandbox = sinon.createSandbox();

describe('Noteful API - Folders', function () {
  let token, user, user2;
  before(function () {
    return mongoose.connect(TEST_MONGODB_URI, { useNewUrlParser: true, useCreateIndex : true })
      .then(() => mongoose.connection.db.dropDatabase());
  });

  beforeEach(function () {
    return Promise.all([
      // Note.insertMany(notes),
      User.insertMany(users),
      Note.insertMany(notes),
      Folder.insertMany(folders),
      Folder.createIndexes()
    ])
      .then(([users]) => {
        user = users[0];
        user2 = users[1];
        token = jwt.sign({ user }, JWT_SECRET, { subject: user.username });
      });
  });

  afterEach(function () {
    sandbox.restore();
    return mongoose.connection.db.dropDatabase();
  });

  after(function () {
    return mongoose.disconnect();
  });
  
  describe('GET /api/folders', function () {

    it('should return a list sorted with the correct number of folders', function () {
      const dbPromise = Folder.find({userId: user.id}).sort('name');
      const apiPromise = chai.request(app)
        .get('/api/folders')
        .set('Authorization', `Bearer ${token}`);
      return Promise.all([dbPromise, apiPromise])
        .then(([data, res]) => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.be.a('array');
          expect(res.body).to.have.length(data.length);
        });
    });

    it('should return a list sorted by name with the correct fields and values', function () {
      return Promise.all([
        Folder.find({userId: user.id}).sort('name'),
        chai.request(app) 
          .get('/api/folders')
          .set('Authorization', `Bearer ${token}`)
      ])
        .then(([data, res]) => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.be.a('array');
          expect(res.body).to.have.length(data.length);
          res.body.forEach(function (item, i) {
            expect(item).to.be.a('object');
            expect(item).to.have.all.keys('id', 'name', 'createdAt', 'updatedAt', 'userId');
            expect(item.id).to.equal(data[i].id);
            expect(item.name).to.equal(data[i].name);
            expect(new Date(item.createdAt)).to.eql(data[i].createdAt);
            expect(new Date(item.updatedAt)).to.eql(data[i].updatedAt);
          });
        });
    });

    it('should catch errors and respond properly with valid creds', function () {
      sandbox.stub(Folder.schema.options.toJSON, 'transform').throws('FakeError');
      return chai.request(app).get('/api/folders')
        .set('Authorization', `Bearer ${token}`) 
        .then(res => {
          expect(res).to.have.status(500);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Internal Server Error');
        });
    });

    it('should get 401 unauthorized for invalid creds', function () {
      sandbox.stub(Folder.schema.options.toJSON, 'transform').throws('FakeError');
      return chai.request(app).get('/api/folders')
        .then(res => {
          expect(res).to.have.status(401);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Unauthorized');
        });
    });

  });

  describe('GET /api/folders/:id', function () {

    it('should return correct folder', function () {
      let data;
      return Folder.findOne({userId: user.id}) 
        .then(_data => {
          data = _data;
          return chai.request(app)
            .get(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`);
        })
        .then((res) => {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.be.an('object');
          expect(res.body).to.have.all.keys('id', 'name', 'createdAt', 'updatedAt', 'userId');
          expect(res.body.id).to.equal(data.id);
          expect(res.body.name).to.equal(data.name);
          expect(new Date(res.body.createdAt)).to.eql(data.createdAt);
          expect(new Date(res.body.updatedAt)).to.eql(data.updatedAt);
        });
    });

    it('should respond with a 400 for an invalid id', function () {
      return chai.request(app)
        .get('/api/folders/NOT-A-VALID-ID')
        .set('Authorization', `Bearer ${token}`)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res.body.message).to.equal('The `id` is not valid');
        });
    });

    it('should respond with a 404 for an id that does not exist', function () {
      // The string "DOESNOTEXIST" is 12 bytes which is a valid Mongo ObjectId
      return chai.request(app)
        .get('/api/folders/DOESNOTEXIST')
        .set('Authorization', `Bearer ${token}`)
        .then(res => {
          expect(res).to.have.status(404);
        });
    });

    it('should catch errors and respond properly', function () {
      sandbox.stub(Folder.schema.options.toJSON, 'transform').throws('FakeError');

      let data;
      return Folder.findOne({userId: user.id})
        .then(_data => {
          data = _data;
          return chai.request(app).get(`/api/folders/${data.id}`).set('Authorization', `Bearer ${token}`);
        })
        .then(res => {
          expect(res).to.have.status(500);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Internal Server Error');
        });
    });
    it('should throw 404 with message Not Found if folder is not owned by user', function () {
      let data;
      return Folder.findOne({userId: user2.id})
        .then(_data => {
          data = _data;
          return chai.request(app).get(`/api/folders/${data.id}`).set('Authorization', `Bearer ${token}`);
        })
        .then(res => {
          expect(res).to.have.status(404);
          expect(res.body.message).to.equal('Not Found');
        });
    });

  });

  describe('POST /api/folders', function () {

    it('should create and return a new item when provided valid data', function () {
      const newItem = { name: 'newFolder' };
      let body;
      return chai.request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send(newItem)
        .then(function (res) {
          body = res.body;
          expect(res).to.have.status(201);
          expect(res).to.have.header('location');
          expect(res).to.be.json;
          expect(body).to.be.a('object');
          expect(body).to.have.all.keys('id', 'name', 'createdAt', 'updatedAt', 'userId');
          return Folder.findById(body.id);
        })
        .then(data => {
          expect(body.id).to.equal(data.id);
          expect(body.name).to.equal(data.name);
          expect(new Date(body.createdAt)).to.eql(data.createdAt);
          expect(new Date(body.updatedAt)).to.eql(data.updatedAt);
        });
    });

    it('should return an error when missing "name" field', function () {
      const newItem = {};
      return chai.request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send(newItem)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Missing `name` in request body');
        });
    });

    it('should return an error when "name" field is empty string', function () {
      const newItem = { name: '' };
      return chai.request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`)
        .send(newItem)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Missing `name` in request body');
        });
    });

    it('should return an error when given a duplicate name', function () {
      return Folder.findOne({userId: user.id})
        .then(data => {
          const newItem = { name: data.name };
          return chai.request(app).post('/api/folders').send(newItem).set('Authorization', `Bearer ${token}`);
        })
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Folder name already exists');
        });
    });

    it('should catch errors and respond properly', function () {
      sandbox.stub(Folder.schema.options.toJSON, 'transform').throws('FakeError');

      const newItem = { name: 'newFolder' };
      return chai.request(app)
        .post('/api/folders')
        .set('Authorization', `Bearer ${token}`) 
        .send(newItem)
        .then(res => {
          expect(res).to.have.status(500);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Internal Server Error');
        });
    });

  });

  describe('PUT /api/folders/:id', function () {

    it('should update the folder', function () {
      const updateItem = { name: 'Updated Name' };
      let data;
      return Folder.findOne({userId: user.id})
        .then(_data => {
          data = _data;
          return chai.request(app).put(`/api/folders/${data.id}`).send(updateItem).set('Authorization', `Bearer ${token}`);
        })
        .then(function (res) {
          expect(res).to.have.status(200);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body).to.have.all.keys('id', 'name', 'createdAt', 'updatedAt', 'userId');
          expect(res.body.id).to.equal(data.id);
          expect(res.body.name).to.equal(updateItem.name);
          expect(new Date(res.body.createdAt)).to.eql(data.createdAt);
          // expect item to have been updated
          expect(new Date(res.body.updatedAt)).to.greaterThan(data.updatedAt);
        });
    });

    it('should respond with a 400 for an invalid id', function () {
      const updateItem = { name: 'Blah' };
      return chai.request(app)
        .put('/api/folders/NOT-A-VALID-ID')
        .send(updateItem)
        .set('Authorization', `Bearer ${token}`) 
        .then(res => {
          expect(res).to.have.status(400);
          expect(res.body.message).to.equal('The `id` is not valid');
        });
    });

    it('should respond with a 404 for an id that does not exist', function () {
      const updateItem = { name: 'Blah' };
      // The string "DOESNOTEXIST" is 12 bytes which is a valid Mongo ObjectId
      return chai.request(app)
        .put('/api/folders/DOESNOTEXIST')
        .send(updateItem)
        .set('Authorization', `Bearer ${token}`) 
        .then(res => {
          expect(res).to.have.status(404);
        });
    });

    it('should return an error when missing "name" field', function () {
      const updateItem = {};
      let data;
      return Folder.findOne({userId: user.id})
        .then(_data => {
          data = _data;
          return chai.request(app)
            .put(`/api/folders/${data.id}`)
            .send(updateItem)
            .set('Authorization', `Bearer ${token}`);
        })
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Missing `name` in request body');
        });
    });

    it('should return an error when "name" field is empty string', function () {
      const updateItem = { name: '' };
      let data;
      return Folder.findOne({userId: user.id})
        .then(_data => {
          data = _data;
          return chai.request(app)
            .put(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send(updateItem);
        })
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Missing `name` in request body');
        });
    });

    it('should return an error when given a duplicate name', function () {
      return Folder.find({userId: user.id}).limit(2)
        .then(results => {
          const [item1, item2] = results;
          item1.name = item2.name;
          return chai.request(app)
            .put(`/api/folders/${item1.id}`)
            .send(item1)
            .set('Authorization', `Bearer ${token}`) ;
        })
        .then(res => {
          expect(res).to.have.status(400);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Folder name already exists');
        });
    });

    it('should catch errors and respond properly', function () {
      sandbox.stub(Folder.schema.options.toJSON, 'transform').throws('FakeError');

      const updateItem = { name: 'Updated Name' };
      let data;
      return Folder.findOne()
        .then(_data => {
          data = _data;
          return chai.request(app)
            .put(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send(updateItem);
        })
        .then(res => {
          expect(res).to.have.status(500);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Internal Server Error');
        });
    });

    it('should throw 404 with message Not Found if folder is not owned by user', function () {
      let data;
      const updateItem = { name: 'Updated Name' };
      return Folder.findOne({userId: user2.id})
        .then(_data => {
          data = _data;
          return chai.request(app)
            .put(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send(updateItem);
        })
        .then(res => {
          expect(res).to.have.status(404);
          expect(res.body.message).to.equal('Not Found');
        });
    });

    it('should allow user to update name of own folder with name owned by another user', function() {
      const updateItem = {};
      const id = '222222222222222222222222';
      const newItem = {'name' : 'it\'s note real!!', userId: user2.id, _id: id};
      return Promise.all([
        Folder.create(newItem),
        Folder.findOne({userId: user.id})
      ])
        .then(([,res]) => {
          updateItem.id = res.id;
          updateItem.name = newItem.name;
          return chai.request(app)
            .put(`/api/folders/${res.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send(updateItem);
        })
        .then((res) => {
          expect(res).to.have.status(200);
          expect(res.body.name).to.equal(newItem.name);
        });
    });
  });

  describe('DELETE /api/folders/:id', function () {

    it('should delete an existing folder and respond with 204', function () {
      let data;
      return Folder.findOne({userId: user.id})
        .then(_data => {
          data = _data;
          return chai.request(app)
            .delete(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`);
        })
        .then(function (res) {
          expect(res).to.have.status(204);
          expect(res.body).to.be.empty;
          return Folder.count({ _id: data.id });
        })
        .then(count => {
          expect(count).to.equal(0);
        });
    });

    it('should delete an existing folder and remove folderId reference from note', function () {
      let folderId;
      return Note.findOne({ $and : [
        {folderId: { $exists: true }}, 
        {userId: user.id}
      ]})
        .then(data => {
          expect(data).to.be.a('object');
          folderId = data.folderId;
          return chai.request(app)
            .delete(`/api/folders/${folderId}`)
            .set('Authorization', `Bearer ${token}`);
        })
        .then(function (res) {
          expect(res).to.have.status(204);
          expect(res.body).to.be.empty;
          return Note.count({ folderId });
        })
        .then(count => {
          expect(count).to.equal(0);
        });
    });

    it('should respond with a 400 for an invalid id', function () {
      return chai.request(app)
        .delete('/api/folders/NOT-A-VALID-ID')
        .set('Authorization', `Bearer ${token}`)
        .then(res => {
          expect(res).to.have.status(400);
          expect(res.body.message).to.equal('The `id` is not valid');
        });
    });

    it('should catch errors and respond properly', function () {
      sandbox.stub(express.response, 'sendStatus').throws('FakeError');
      return Folder.findOne()
        .then(data => {
          return chai.request(app)
            .delete(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`);
        })
        .then(res => {
          expect(res).to.have.status(500);
          expect(res).to.be.json;
          expect(res.body).to.be.a('object');
          expect(res.body.message).to.equal('Internal Server Error');
        });
    });

    it('should return 204 AND not delete when trying to delete folder owned by another user', () => {
      let data;
      return Folder.findOne({userId: user2.id})
        .then(_data => {
          data = _data;
          return chai.request(app)
            .delete(`/api/folders/${data.id}`)
            .set('Authorization', `Bearer ${token}`);
        })
        .then(res => {
          expect(res).to.have.status(204);
        })
        .then(() => {
          return Folder.findById(data.id);
        })
        .then(res => {
          expect(res).to.be.a('object');
          expect(res).to.deep.equal(data);
        });
    });

  });

});
