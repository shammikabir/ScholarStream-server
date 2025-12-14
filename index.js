const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

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
    const appplicationsCollection = db.collection("applications");

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
    //get scholarship by id
    app.get("/scholarships/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const scholarship = await scholarshipsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!scholarship)
          return res.status(404).send({ message: "Scholarship not found" });

        res.status(200).send(scholarship);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Server error" });
      }
    });

    //review

    //post review
    app.post("/reviews", async (req, res) => {
      try {
        const review = req.body; // frontend theke je data eseche

        const result = await reviewsCollection.insertOne(review);

        // Insert হলে MongoDB insertedId ফেরত দেয়
        res.send({ _id: result.insertedId, ...review });
      } catch (error) {
        console.log(error);
        res.send({ message: "Something went wrong" });
      }
    });

    //get review
    app.get("/reviews/:scholarshipId", async (req, res) => {
      try {
        const scholarshipId = req.params.scholarshipId;
        const reviews = await reviewsCollection
          .find({ scholarshipId })
          .toArray();

        res.status(200).send(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: "Error fetching reviews" });
      }
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

    //payments

    app.post("/create-checkout-session", async (req, res) => {
      try {
        const { title, price } = req.body;

        // Simple validation
        if (!title || !price) {
          return res.status(400).send({ message: "Missing data" });
        }

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],

          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: title,
                },
                unit_amount: price * 100, // Stripe works with cents
              },
              quantity: 1,
            },
          ],

          mode: "payment",

          success_url: `${process.env.CLIENT_URL}/payment-success`,
          cancel_url: `${process.env.CLIENT_URL}/payment-cancle`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Stripe session failed" });
      }
    });

    //application add
    app.post("/applications", async (req, res) => {
      const application = {
        ...req.body,
        applicationStatus: "pending",
        paymentStatus: "unpaid",
        moderatorFeedback: "",
        transactionId: null,
        createdAt: new Date(),
      };

      const result = await appplicationsCollection.insertOne(application);
      res.send(result);
    });

    //get applications
    app.get("/applications/:email", async (req, res) => {
      const email = req.params.email;

      const result = await appplicationsCollection
        .find({ studentEmail: email })
        .toArray();

      res.send(result);
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
