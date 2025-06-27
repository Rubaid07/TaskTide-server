const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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
    await client.connect();
    console.log("✅ Connected to MongoDB!");

    const db = client.db('TaskTideDB');
    const tasksCollection = db.collection('tasks');
    const bidsCollection = db.collection('bids');

    // 🟢 Create a task
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
      } catch (error) {
        res.status(500).send({ message: 'Failed to create task', error });
      }
    });

    // 🟢 Get all tasks (with optional query filters)
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
        const tasks = await tasksCollection.find(query).toArray();
        res.send(tasks);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch tasks', error });
      }
    });

    app.get('/tasks/featured', async (req, res) => {
      const result = await tasksCollection.find().sort({ deadline: 1 }).limit(6).toArray()
      res.send(result)
    })

    // 🟢 Get a single task by ID
    app.get('/tasks/:id', async (req, res) => {
      try {
        const task = await tasksCollection.findOne({ _id: new ObjectId(req.params.id) });
        if (!task) return res.status(404).send({ message: 'Task not found' });
        res.send(task);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch task', error });
      }
    });

    // 🟢 Update a task
    app.put('/tasks/:id', async (req, res) => {
      try {
        const updatedTask = req.body;
        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              ...updatedTask,
              updatedAt: new Date()
            }
          }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to update task', error });
      }
    });

    // 🟢 Delete a task
    app.delete('/tasks/:id', async (req, res) => {
      try {
        const result = await tasksCollection.deleteOne({ _id: new ObjectId(req.params.id) });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to delete task', error });
      }
    });

    // 🟢 Simple PATCH bid (used for "love" button)
    app.patch('/tasks/:id/bid', async (req, res) => {
      try {
        const { userEmail } = req.body;
        const taskId = req.params.id;

        const task = await tasksCollection.findOne({ _id: new ObjectId(taskId) });
        if (!task) return res.status(404).send({ message: 'Task not found' });

        if (task.bidders.includes(userEmail)) {
          return res.status(400).send({ message: 'You already bid on this task' });
        }

        await tasksCollection.updateOne(
          { _id: new ObjectId(taskId) },
          {
            $push: { bidders: userEmail },
            $inc: { bidsCount: 1 }
          }
        );

        const updated = await tasksCollection.findOne({ _id: new ObjectId(taskId) });
        res.send({ success: true, task: updated });
      } catch (error) {
        res.status(500).send({ message: 'Failed to update bid count', error });
      }
    });

    // 🟢 Full bid submission (stores in bid collection)
    app.post('/tasks/:id/bid', async (req, res) => {
      try {
        const { userEmail, bidAmount, message } = req.body;
        const taskId = req.params.id;

        const task = await tasksCollection.findOne({ _id: new ObjectId(taskId) });
        if (!task) return res.status(404).send({ message: 'Task not found' });

        const exists = await bidsCollection.findOne({
          taskId: new ObjectId(taskId),
          bidderEmail: userEmail
        });
        if (exists) return res.status(400).send({ message: 'Already bid on this task' });

        const bid = {
          taskId: new ObjectId(taskId),
          taskTitle: task.title,
          bidderEmail: userEmail,
          bidAmount,
          message,
          status: 'pending',
          createdAt: new Date()
        };

        await bidsCollection.insertOne(bid);
        await tasksCollection.updateOne(
          { _id: new ObjectId(taskId) },
          {
            $push: { bidders: userEmail },
            $inc: { bidsCount: 1 }
          }
        );

        res.send({ success: true, bid });
      } catch (error) {
        res.status(500).send({ message: 'Failed to place bid', error });
      }
    });

    // 🟢 Get user's tasks
    app.get('/my-tasks', async (req, res) => {
      try {
        const { email } = req.query;
        const tasks = await tasksCollection.find({ email }).toArray();
        res.send(tasks);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch user tasks', error });
      }
    });

    // 🟢 Get user's bids
    app.get('/my-bids', async (req, res) => {
      try {
        const { email } = req.query;
        const bids = await bidsCollection.find({ bidderEmail: email }).sort({ createdAt: -1 }).toArray();

        const enriched = await Promise.all(
          bids.map(async (bid) => {
            const task = await tasksCollection.findOne({ _id: new ObjectId(bid.taskId) });
            return { ...bid, task };
          })
        );

        res.send(enriched);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch user bids', error });
      }
    });

    // 🟢 Dashboard stats
    app.get('/dashboard/stats', async (req, res) => {
      try {
        const { email } = req.query;

        const totalTasks = await tasksCollection.countDocuments({ email });
        const activeTasks = await tasksCollection.countDocuments({ email, status: 'active' });
        const completedTasks = await tasksCollection.countDocuments({ email, status: 'completed' });

        const activeBids = await bidsCollection.countDocuments({ bidderEmail: email });

        const completedBids = await bidsCollection.find({
          bidderEmail: email,
          status: 'completed'
        }).toArray();

        const earnings = completedBids.reduce((acc, bid) => acc + (bid.bidAmount || 0), 0);

        res.send({
          totalTasks,
          activeTasks,
          completedTasks,
          activeBids,
          earnings,
          tasksThisWeek: 3,
          bidsThisWeek: 2
        });
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch stats', error });
      }
    });

    // 🟢 Dashboard category breakdown
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
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch category data', error });
      }
    });

  } finally {
    // Optional: keep MongoDB connection open
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("🚀 TaskTide Server is running!");
});

app.listen(port, () => {
  console.log(`🌐 Server is running on port ${port}`);
});
