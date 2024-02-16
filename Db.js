const {Pool}= require('pg');
const path=require('path');
require('dotenv').config({
    override:true,
    path:path.join(__dirname, 'Development.env')
});

 const pool=new Pool({
    // user: process.env.USER,
    // host: process.env.HOST,
    // // host: '192.168.4.218',
    // database: process.env.DATABASE,
    // password: process.env.PASSWORD,
    // port: process.env.PORT,
    user: "postgres",
    host: "localhost",
    database: "NewDb",
    password: "ehtasham24",
    port: 5432
});


module.exports={pool};