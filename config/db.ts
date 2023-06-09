import * as mongoose from 'mongoose';
const stateService = require('../services/stateservices');
require('dotenv').config();

const InitiateMongoServer = async () => {
  try {
    await mongoose.connect(process.env.MONGOURI, {
      useNewUrlParser: true,
      retryWrites: true,
    } as mongoose.ConnectOptions);
    console.log("Connected to DB !!");
  } catch (e) {
    stateService.suspendOperations(e);
  }
};

module.exports = InitiateMongoServer;

//mongodb+srv://wadkararyan01:<password>@cluster0.67rc4fq.mongodb.net/?retryWrites=true&w=majority
//mongodb://testuser:testpassword@ds257698.mlab.com:57698/node-auth