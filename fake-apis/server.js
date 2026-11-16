const express = require("express");

const app = express();
const port = 3001;

// A good endpoint: returns weather data in a consistent format.
app.get("/weather/current", (req, res) => {
  res.json({
    city: req.query.city || "Vancouver",
    temperature: 12,
    unit: "C",
    condition: "cloudy",
  });
});

// A deliberately bad endpoint: returns an unexpected response shape.
app.get("/weather-bad/current", (req, res) => {
  res.json({ message: "Weather data unavailable" });
});

app.listen(port, () => {
  console.log(`Fake weather API listening at http://localhost:${port}`);
});