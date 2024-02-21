const { ImgPost,GetItems, GetItem, PostItems, DeleteItem, UpdateItem } = require("../Controller/Items");




const postItems = {
    schema:{
        response:{
            201:{
                properties:{
                id:{type:'string'},
                name:{type:'string'}
             }
            }
       }
        
    },
    handler:PostItems
}

const itemsopt={
    schema:{
        response:{
            200:{
                type:'array',
                items:{
                    type: 'object',
                    properties:{
                        id:{type:'string'},
                        name:{type:'string'}   
                     }
                }
        }
    }
},
handler:GetItems
}

const itemsoptSing={
    schema:{
        response:{
            200:{
                type: 'object',
                properties:{
                        // id:{type:'string'},
                        name:{type:'string'}   
                     }
                }
        }
    },
    handler:GetItem
}

const deleteItems={
    schema:{
        response:{
            200:{
                type: 'object',
                properties:{
                        id:{type:'string'},
                        message:{type:'string'}   
                     }
                }
        }
    },
    handler:DeleteItem
}

const updateItems={
    schema:{
        response:{
            200:{
                type:'object',
                properties:{
                    id:{type:'string'},
                    name:{type:'string'}
                }
            }
        }
    },
    handler:UpdateItem
}

const ImageUploadSchema = {
    schema: {
        response: {
            201: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Image uploaded successfully' },
                    
                }
            }
        }
    },
    handler:ImgPost
};

function Routes(fastify,options, done){
    
    fastify.get('/items',itemsopt)
    fastify.get('/items/:id',itemsoptSing)
    fastify.post('/items',postItems)
    fastify.delete('/items/:id',deleteItems)
    fastify.put('/items/:id',updateItems)
    fastify.post('/Images',ImageUploadSchema)
    done()



}



module.exports=Routes;