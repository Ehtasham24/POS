const {v4:uuid4}= require('uuid');
const {pool}=require('../Db');


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
            reply.code(400).send({ message: 'Item not found' });
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
    const  name  = req.body;
        if(typeof(Number(name))!=='string'){
            reply.code(250).send({ message: 'Invalid datatype inserted. Name must be a string.' });
            return;  
        }

        // const type = typeof(name);
        else if(typeof name !== 'string'){
            reply.code(250).send({ message: 'Invalid datatype inserted. Name must be a string.' });
            return;  
        }
    try {
        const result = await pool.query('INSERT INTO items (id, name) VALUES ($1, $2) RETURNING *', [uuid4(), name]);
        reply.code(201).send({message : 'element inserted',result});
    } catch (err) {
        console.error(err);
        reply.code(500).send({ message: 'Internal error' });
        }
    }
    
    
const UpdateItem=async(req,reply)=>{
    const {id}=req.params;
    const {name}=req.body;
    try{
    const result=await pool.query('UPDATE items SET name=$1 WHERE id=$2 RETURNING*',[name,id]);
    reply.send(`The item with id ${id} updated with name: ${name} ${result}`)
    }catch(err){
        reply.code(5000).send({message:'Update query error'})
    }
}

module.exports={GetItem,GetItems,PostItems,DeleteItem,UpdateItem};