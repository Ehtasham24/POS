const {v4:uuid4}= require('uuid');
const {pool}=require('../Db');
const joi=require('joi');
const Joi = require('joi');


const PostschemaJoi=Joi.object().keys({
    // id:Joi.string().min(8).max(40).required(),
    name:Joi.string().min(3).max(18).required(),

});

const UpdateschemaJoi=Joi.object().keys({
    id:Joi.string().min(8).max(40).required(),
    name:Joi.string().min(3).max(18).required(),

});

const GetItems=async(req, reply)=>
{
    try{
        const result=await pool.query('Select * From items');
        reply.send(result.rows);
    }catch(err){
        reply.code(500).send({message:"Internal server error"})
    }
}


const DeleteItem = async (req, reply) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM items WHERE id=$1', [id]);
        if (result.rowCount === 0) {
            reply.code(404).send({ message: 'Item not found' });
        } else {
            reply.send({ message: 'Item deleted', id });
        }
    } catch (err) {
        console.error(err);
        reply.code(500).send({ message: 'Delete query error' });
    }
}
const GetItem=async (req,reply)=>{
    const {id}=req.params;
    try{  
        const result= await pool.query('Select * From items WHERE id= $1',[id]);
        if (result.rows.length===0){
            reply.send({message:'Item not found'});
        }
    }catch(err){
        reply.send({message:'Server Error'})
    }
}

const PostItems = async (req, reply) => {
    const  {name}  = req.body;
    //     if(typeof name !=='string'){
    //         reply.code(400).send({ message: 'Invalid datatype inserted. Name must be a string.' });
    //         return;  
    //  }
       // const valid=Joi.valid(name,schemaJoi);

       const validation=await PostschemaJoi.validateAsync({name});
       if(validation.error){
        reply.code(404).send({message:'Validation error'});
       } 

    try {        
        const result = await pool.query('INSERT INTO items (id, name) VALUES ($1, $2) RETURNING *', [uuid4(), name]);
        reply.send({message : 'element inserted', newItem: result.rows[0]});
    } catch (err) {
        console.error(err);
        reply.code(500).send({ message: 'Internal error' });
        }
    }
    
    
const UpdateItem=async(req,reply)=>{
    const {id}=req.params;
    const {name}=req.body;
    
    // if(typeof name!=='string'){
    //     reply.code(400).send({ message: 'Invalid datatype inserted. Name must be a string.' });
    //     return;  
    // }
    const validation=await UpdateschemaJoi.validateAsync({id,name});
    if(validation.error){
        reply.code(404).send({message:'Validation error'});
        return;
    } 
    try{   
    const result=await pool.query('UPDATE items SET name=$1 WHERE id=$2 RETURNING*',[name,id]);
    if(result.rowCount===0){
        reply.code(404).send({message:`Item with id: ${id} not present`});
    }
    else
    reply.send(`The item with id ${id} updated with name: ${name} ${result}`)
    }catch(err){
        reply.code(500).send({message:'Update query error'})
    }
}

module.exports={GetItem,GetItems,PostItems,DeleteItem,UpdateItem};