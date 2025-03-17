import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// Source: https://expressjs.com/en/starter/static-files.html
// html chatgpt
app.use(express.static("dest"));

app.use((_, res) => {
  res.status(404).send("404 - Not Found");
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
