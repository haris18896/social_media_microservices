const Search = require("../models/Search");
const logger = require("../utils/logger");

const searchPostController = async (req, res) => {
  logger.info("Searching for posts");

  try {
    const { query } = req.query;

    const result = await Search.find(
      {
        $text: {
          $search: query,
          $caseSensitive: false,
          $diacriticSensitive: false,
        },
      },
      {
        score: { $meta: "textScore" },
      }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(10);

    res.status(200).json(result);
  } catch (e) {
    logger.error("Error while searching post", e);
    res.status(500).json({ message: "Error while searching post" });
  }
};

module.exports = searchPostController;
