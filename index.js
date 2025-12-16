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
// JWT create (SECURE)
// -----------------------
app.post("/jwt", async (req, res) => {
  try {
    const { email } = req.body; // make sure email is sent

    // optional: check if user exists in DB
    // const user = await User.findOne({ email });
    // if (!user) return res.status(404).json({ error: 'User not found' });

    const token = jwt.sign({ email }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ token });
  } catch (err) {
    console.error(err); // check this in terminal
    res.status(500).json({ error: "Internal Server Error" });
  }
});
//middleware
const verifyJWT = (req, res, next) => {
  console.log("VERIFY JWT MIDDLEWARE HIT");
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized Access" });
    }
    console.log("JWT VERIFIED USER:", decoded);
    req.decoded = decoded; // { email, role }

    next();
  });
};

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

    //verify admin,moderator

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;

      const user = await usersCollection.findOne({ email });

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "Admin only access" });
      }

      next();
    };
    const verifyModerator = async (req, res, next) => {
      const email = req.decoded.email;

      const user = await usersCollection.findOne({ email });

      if (user?.role !== "moderator") {
        return res.status(403).send({ message: "Moderator only access" });
      }

      next();
    };

    // -----------------------------------
    // Get all users (Protected Route)
    // -----------------------------------
    app.get("/users", verifyJWT, async (req, res) => {
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
    app.get("/user/role/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden" });
      }

      const user = await usersCollection.findOne({ email });
      res.send({ role: user?.role });
    });

    app.get("/user/role", verifyJWT, async (req, res) => {
      const email = req.decoded.email;

      const user = await usersCollection.findOne({ email });

      res.send({ role: user?.role || "user" });
    });

    //.............admin......................................

    //add-scholarship
    app.post("/scholarships", verifyJWT, verifyAdmin, async (req, res) => {
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

    //user role update

    // Update User Role
    app.put(
      "/user/update-role/:email",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
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
      }
    );

    // Delete User by Email
    app.delete("/user/:email", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.params.email;

      const result = await usersCollection.deleteOne({ email });

      res.send({
        success: true,
        message: "User deleted successfully",
        result,
      });
    });

    //analytics
    app.get("/analytics", verifyJWT, verifyAdmin, async (req, res) => {
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

    //update scholarship-

    app.put("/scholarships/:id", verifyJWT, verifyAdmin, async (req, res) => {
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
    app.delete(
      "/scholarships/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const result = await scholarshipsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send({ success: true, result });
      }
    );

    //User manage
    //filter role--user

    app.get("/users/filter", verifyJWT, verifyAdmin, async (req, res) => {
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

    //review..............................................

    //post review
    app.post("/reviews", verifyJWT, async (req, res) => {
      try {
        const review = req.body; // frontend theke je data eseche

        const result = await reviewsCollection.insertOne(review);

        // Insert
        res.send({ _id: result.insertedId, ...review });
      } catch (error) {
        console.log(error);
        res.send({ message: "Something went wrong" });
      }
    });

    //get all review for moderator
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection
        .find()
        // .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    //delete review
    app.delete("/reviews/:id", verifyJWT, async (req, res) => {
      const { id } = req.params;

      const result = await reviewsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.send({ success: true, result });
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

    //get review for myreview
    // Express.js route
    app.get("/my-reviews/:email", verifyJWT, async (req, res) => {
      const { email } = req.params;
      try {
        const userReviews = await reviewsCollection
          .find({ studentEmail: email })
          .sort({ createdAt: -1 }) // newest first
          .toArray();

        res.send(userReviews);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch reviews" });
      }
    });

    //update review

    // PATCH route for updating a review
    // Update a review (simple way using PUT)
    app.put("/reviews/:id", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;
        const data = req.body; // expect { rating, comment }

        console.log("Updating Review:", id, data);

        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { ...data, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Review not found" });
        }

        res.send({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: err.message });
      }
    });

    //
    // Delete review by ID
    app.delete("/reviews/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await reviewsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: err.message });
      }
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
        const { title, price, studentEmail, scholarshipId } = req.body;

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
          metadata: {
            scholarshipId,
            studentEmail,
          },

          success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.CLIENT_URL}/payment-cancle`,
        });

        res.send({ url: session.url });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Stripe session failed" });
      }
    });

    //payment update after pay
    //payment status change
    app.post("/payment-success", async (req, res) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId)
          return res.status(400).send({ message: "Missing sessionId" });

        // Retrieve the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log(session);

        if (session.status === "complete") {
          // Extract metadata
          const scholarshipId = session.metadata.scholarshipId;
          // const studentEmail = session.metadata.studentEmail;

          // Find the application in DB
          const application = await appplicationsCollection.findOne({
            scholarshipId,
          });

          if (!application)
            return res.status(404).send({ message: "Application not found" });

          // Update payment status and application status
          await appplicationsCollection.updateOne(
            { _id: application._id },
            {
              $set: {
                paymentStatus: "paid",
                applicationStatus: "completed",
                transactionId: session.payment_intent,
              },
            }
          );

          return res.send({
            message: "Payment completed and application updated",
            applicationId: application._id,
            transactionId: session.payment_intent,
          });
        } else {
          return res.status(400).send({ message: "Payment not completed yet" });
        }
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to update payment" });
      }
    });

    //application add
    app.post("/applications", verifyJWT, async (req, res) => {
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

    // check already applied
    app.get("/applications/check", async (req, res) => {
      const { scholarshipId, email } = req.query;

      const exists = await appplicationsCollection.findOne({
        scholarshipId,
        studentEmail: email,
      });

      res.send({ applied: !!exists });
    });

    //get applications
    app.get("/applications/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      const result = await appplicationsCollection
        .find({ studentEmail: email })
        .toArray();

      res.send(result);
    });

    //get all applications
    app.get("/applications", verifyJWT, async (req, res) => {
      const result = await appplicationsCollection.find().toArray();
      res.send(result);
    });

    //.............update status from moderator.....................
    // Update status
    app.put(
      "/applications/status/:id",
      verifyJWT,
      verifyModerator,
      async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;

        const result = await appplicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { applicationStatus: status } }
        );

        res.send({ success: true, result });
      }
    );

    // Add feedback
    app.put(
      "/applications/feedback/:id",
      verifyJWT,
      verifyModerator,
      async (req, res) => {
        const { id } = req.params;
        const { feedback } = req.body;

        const result = await appplicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { feedback } }
        );

        res.send({ success: true, result });
      }
    );

    //delete my application
    app.delete("/applications/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await appplicationsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send({ success: true, result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: err.message });
      }
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
