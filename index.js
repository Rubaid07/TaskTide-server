const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ynxyt70.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    // await client.connect();
    const tasksCollection = client.db('TaskTideDB').collection('tasks')
    app.post('/tasks', async (req, res) => {
      const newTask = req.body
      console.log(newTask);
      const result = await tasksCollection.insertOne(newTask)
      res.send(result)
    })
    app.get('/tasks/featured', async (req, res) => {
      const result = await tasksCollection.find().sort({ deadline: 1 }).limit(6).toArray()
      res.send(result)
    })

    app.get('/tasks', async (req, res) => {
      const result = await tasksCollection.find().toArray();
      res.send(result);
    });

    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("Task server")
})
app.listen(port, () => {
  console.log(`Task server is running on port ${port}`);
})