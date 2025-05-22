const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

    const tasksCollection = client.db('TaskTideDB').collection('tasks')

    app.post('/tasks', async (req, res) => {
      const newTask = req.body
      newTask.bidsCount = 0;
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

    app.get('/tasks/:id', async (req, res) => {
      const id = req.params.id
      const quary = { _id: new ObjectId(id) }
      const result = await tasksCollection.findOne(quary)
      res.send(result)
    })

    app.patch('/tasks/:id/bid', async (req, res) => {
      const id = req.params.id
      const { userEmail } = req.body
      const filter = { _id: new ObjectId(id) }

      const task = await tasksCollection.findOne(filter);
      if (task?.bidders?.includes(userEmail)) {
        return res.send({ success: true, alreadyBid: true });
      }

      const updateDoc = {
        $push: { bidders: userEmail },
        $inc: { bidsCount: 1 }
      };

      await tasksCollection.updateOne(filter, updateDoc);
      const updatedTask = await tasksCollection.findOne(filter);
      res.send({ success: true, task: updatedTask });
    });

    app.post('/my-tasks', async (req, res) => {
      const { email } = req.body;
      const tasks = await tasksCollection.find({ email }).toArray();
      res.send(tasks);
    });

    app.delete('/tasks/:id', async (req, res) => {
      const id = req.params.id;
      const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

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