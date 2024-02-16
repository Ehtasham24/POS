
const server = require('fastify')({ logger: true });
const routes = require('./routes/Routes');
const Port=5000;

// server.register(require('./routes/Routes').default);


const examplePlugin = async  ()=> {
    try{
        await server.register(routes);
       await server.listen({port:Port}) 
    } catch (error){
        server.log.error(error)
        process.exit(1);
    }
}

examplePlugin ();


// pool.connect();



