const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

// -----------------------
// Middleware
// -----------------------
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

// -----------------------
// MongoDB Connection
// -----------------------
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.hj4tbay.mongodb.net/model-db?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
});

// -----------------------
// JWT Verify Middleware
// -----------------------
// const verifyToken = (req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader) {
//     return res.status(401).json({ message: "Unauthorized Access" });
//   }

//   const token = authHeader.split(" ")[1];

//   jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
//     if (err) {
//       return res.status(403).json({ message: "Forbidden Access" });
//     }

//     req.user = decoded;
//     next();
//   });
// };

// -----------------------
// Run Function
// -----------------------
async function run() {
  try {
    await client.connect();

    const db = client.db("Finalprojectdb");
    const usersCollection = db.collection("users");
    const scholarshipsCollection = db.collection("scholarships");
    const reviewsCollection = db.collection("reviews");

    console.log("MongoDB Connected Successfully!");

    // -----------------------------------
    // Get all users (Protected Route)
    // -----------------------------------
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // -----------------------------------
    // Save or Update a User
    // -----------------------------------
    app.post("/user", async (req, res) => {
      const userData = req.body;

      const query = { email: userData.email };
      const exists = await usersCollection.findOne(query);

      if (exists) {
        // update last login
        const result = await usersCollection.updateOne(query, {
          $set: { last_loggedIn: new Date().toISOString() },
        });
        return res.send(result);
      }

      // Save new user
      userData.created_at = new Date().toISOString();
      userData.last_loggedIn = new Date().toISOString();
      userData.role = "student";

      const result = await usersCollection.insertOne(userData);
      res.send(result);
    });

    // -----------------------------------
    // Get User Role
    // -----------------------------------
    app.get("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role });
    });

    //add-scholarship
    app.post("/scholarships", async (req, res) => {
      const data = req.body;
      const result = await scholarshipsCollection.insertOne(data);
      res.send({ success: true, result });
    });
    //all-scholarship
    app.get("/allscholarships", async (req, res) => {
      const result = await scholarshipsCollection.find().toArray();
      res.send(result);
    });

    //update scholarship-

    app.put("/scholarships/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const data = req.body;

        console.log("Updating Scholarship:", id, data); // <-- Add this

        const result = await scholarshipsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: data }
        );

        res.send({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: err.message });
      }
    });

    //  DELETE  scholarship
    app.delete("/scholarships/:id", async (req, res) => {
      const { id } = req.params;
      const result = await scholarshipsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send({ success: true, result });
    });

    //scholarship by id
    app.get("/scholarships/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await scholarshipsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!result) {
          return res.status(404).send({ message: "Scholarship not found" });
        }

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Server error" });
      }
    });

    //reviews
    app.post("/reviews", async (req, res) => {
      const review = req.body;

      review.reviewDate = new Date();

      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    //User manage
    //filter role--user

    app.get("/users/filter", async (req, res) => {
      const role = req.query.role;

      let query = {};
      if (role && role !== "all") {
        query.role = role;
      }

      const users = await usersCollection.find(query).toArray();

      res.send({
        success: true,
        users,
      });
    });

    //user role update

    // Update User Role
    app.put("/user/update-role/:email", async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;

      const result = await usersCollection.updateOne(
        { email },
        { $set: { role } }
      );

      res.send({
        success: true,
        message: "User role updated successfully",
        result,
      });
    });

    // Delete User by Email
    app.delete("/user/:email", async (req, res) => {
      const email = req.params.email;

      const result = await usersCollection.deleteOne({ email });

      res.send({
        success: true,
        message: "User deleted successfully",
        result,
      });
    });

    //analytics
    app.get("/analytics", async (req, res) => {
      const totalUsers = await usersCollection.countDocuments();
      const totalScholarships = await scholarshipsCollection.countDocuments();

      const allScholarships = await scholarshipsCollection.find().toArray();

      const totalFees = allScholarships.reduce(
        (sum, item) => sum + Number(item.applicationFees || 0),
        0
      );

      // Applications per university
      const universityApplications = Object.values(
        allScholarships.reduce((acc, item) => {
          acc[item.universityName] = acc[item.universityName] || {
            university: item.universityName,
            count: 0,
          };
          acc[item.universityName].count++;
          return acc;
        }, {})
      );

      // Scholarship category distribution
      const categoryDistribution = Object.values(
        allScholarships.reduce((acc, item) => {
          acc[item.scholarshipCategory] = acc[item.scholarshipCategory] || {
            category: item.scholarshipCategory,
            value: 0,
          };
          acc[item.scholarshipCategory].value++;
          return acc;
        }, {})
      );

      res.send({
        totalUsers,
        totalFees,
        totalScholarships,
        universityApplications,
        categoryDistribution,
      });
    });
    //get limited bill for home

    app.get("/top-scholarships", async (req, res) => {
      const result = await scholarshipsCollection.find().limit(6).toArray();
      res.send(result);
    });
    //profile update
    // Update User Profile Photo
    // Update User Profile Photo by Email
    app.put("/users/update-photo/:email", async (req, res) => {
      const email = req.params.email;
      const { photo } = req.body;

      const result = await usersCollection.updateOne(
        { email },
        { $set: { photo } }
      );

      res.send({ message: "Profile photo updated successfully", result });
    });
  } finally {
    // Don't close client
  }
}

run().catch(console.dir);

// -----------------------
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
