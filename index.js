const cors = require('cors');
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ynxyt70.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Main server function
async function run() {
  try {
    await client.connect();
    console.log('✅ MongoDB Connected');

    const db = client.db('TaskTideDB');
    const tasksCollection = db.collection('tasks');
    const bidsCollection = db.collection('bids');

    // POST - Create Task
    app.post('/tasks', async (req, res) => {
      try {
        const newTask = {
          ...req.body,
          bidsCount: 0,
          bidders: [],
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        const result = await tasksCollection.insertOne(newTask);
        res.status(201).send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to create task', error: err });
      }
    });

    // GET - All Tasks
    app.get('/tasks', async (req, res) => {
      try {
        const { status, category, search } = req.query;
        const query = {};
        if (status) query.status = status;
        if (category) query.category = category;
        if (search) {
          query.$or = [
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ];
        }
        const result = await tasksCollection.find(query).toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch tasks', error: err });
      }
    });

    // GET - Featured Tasks
    app.get('/tasks/featured', async (req, res) => {
      try {
        const result = await tasksCollection.find().sort({ deadline: 1 }).limit(6).toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch featured tasks', error: err });
      }
    });

    // GET - Single Task by ID
    app.get('/tasks/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const result = await tasksCollection.findOne({ _id: new ObjectId(id) });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch task', error: err });
      }
    });

    // PUT - Update Task
    app.put('/tasks/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updated = {
          ...req.body,
          updatedAt: new Date()
        };
        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updated }
        );
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to update task', error: err });
      }
    });

    // DELETE - Task
    app.delete('/tasks/:id', async (req, res) => {
      try {
        const result = await tasksCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to delete task', error: err });
      }
    });

    // PATCH - Quick Bid (update bidsCount + bidders list)
    app.patch('/tasks/:id/bid', async (req, res) => {
      try {
        const { userEmail } = req.body;
        const id = req.params.id;

        const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
        if (!task) return res.status(404).send({ message: 'Task not found' });

        if (task.bidders.includes(userEmail)) {
          return res.status(400).send({ message: 'You already bid on this task' });
        }

        await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $push: { bidders: userEmail },
            $inc: { bidsCount: 1 }
          }
        );
        const updated = await tasksCollection.findOne({ _id: new ObjectId(id) });
        res.send({ success: true, task: updated });
      } catch (err) {
        res.status(500).send({ message: 'Bid update failed', error: err });
      }
    });

    // POST - Full Bid Submission
    app.post('/tasks/:id/bid', async (req, res) => {
      try {
        const { userEmail, bidAmount, message } = req.body;
        const id = req.params.id;

        const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
        if (!task) return res.status(404).send({ message: 'Task not found' });

        const exists = await bidsCollection.findOne({
          taskId: new ObjectId(id),
          bidderEmail: userEmail
        });
        if (exists) return res.status(400).send({ message: 'Already bid on this task' });

        const bid = {
          taskId: new ObjectId(id),
          taskTitle: task.title,
          bidderEmail: userEmail,
          bidAmount,
          message,
          status: 'pending',
          createdAt: new Date()
        };

        await bidsCollection.insertOne(bid);
        await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $push: { bidders: userEmail },
            $inc: { bidsCount: 1 }
          }
        );

        res.send({ success: true, bid });
      } catch (err) {
        res.status(500).send({ message: 'Bid placement failed', error: err });
      }
    });

    // GET - My Tasks by Email
    app.get('/my-tasks', async (req, res) => {
      try {
        const { email } = req.query;
        const result = await tasksCollection.find({ email }).toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch user tasks', error: err });
      }
    });

    // GET - My Bids by Email
    app.get('/my-bids', async (req, res) => {
      try {
        const { email } = req.query;
        const bids = await bidsCollection.find({ bidderEmail: email }).sort({ createdAt: -1 }).toArray();

        const enriched = await Promise.all(bids.map(async (bid) => {
          const task = await tasksCollection.findOne({ _id: new ObjectId(bid.taskId) });
          return { ...bid, task };
        }));

        res.send(enriched);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch bids', error: err });
      }
    });

    // GET - Dashboard Stats
    app.get('/dashboard/stats', async (req, res) => {
      try {
        const { email } = req.query;

        const totalTasks = await tasksCollection.countDocuments({ email });
        const activeTasks = await tasksCollection.countDocuments({ email, status: 'active' });
        const completedTasks = await tasksCollection.countDocuments({ email, status: 'completed' });

        const activeBids = await bidsCollection.countDocuments({ bidderEmail: email });

        const completedBids = await bidsCollection.find({ bidderEmail: email, status: 'completed' }).toArray();
        const earnings = completedBids.reduce((acc, bid) => acc + (bid.bidAmount || 0), 0);

        res.send({
          totalTasks,
          activeTasks,
          completedTasks,
          activeBids,
          earnings
        });
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch dashboard stats', error: err });
      }
    });

    // GET - Dashboard Category Breakdown
    app.get('/dashboard/categories', async (req, res) => {
      try {
        const { email } = req.query;
        const result = await tasksCollection.aggregate([
          { $match: { email } },
          {
            $group: {
              _id: "$category",
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              name: "$_id",
              value: "$count",
              _id: 0
            }
          }
        ]).toArray();
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: 'Failed to fetch categories', error: err });
      }
    });

  } finally {
    
  }
}

// Root route
app.get('/', (req, res) => {
  res.send('✅ Task Marketplace Server is running!');
});

run();
