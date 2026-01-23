const express = require("express");
const cors = require("cors");

const userRoute = require("./routes/user.route");
const authRoute = require("./routes/auth.route");
const donorRoute = require("./routes/donor.route");
const requestRoute = require("./routes/request.route");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoute);
app.use("/api/v1/donor", donorRoute);
app.use("/api/v1/request", requestRoute);


app.get("/", (req, res) => {
  res.send("🩸 Blood API is running");
});

module.exports = app;
